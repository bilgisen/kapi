/**
 * kapi Worker (Cloudflare) — S2-3/4 + S3-3/4/5/6 + S7-1 birleşimi (P2a).
 *
 * - POST /ingest  (X-Classify-Secret) -> W1 çağrısı: bekleyen bildirimleri D1'den okur,
 *                                         sınıflandırır, kap_analysis'e yazar;
 *                                         BIST100 skor>=5 -> iç /auto (aynı worker, HTTP yok).
 * - POST /auto    (X-W3-Secret)       -> otomatik analiz; skor>=8/layer=3 -> MODEL_HIGH, aksi MODEL_LOW.
 * - POST /analyze (halka açık, K11)   -> on-demand; KV cache-first (24sa); global günlük limit.
 * - POST /daily   (X-W3-Secret)       -> gün sonu sentez (S11-3); KV cache gün bazlı.
 * - GET  /health                      -> durum
 * - GET  /trigger?secret=...          -> W1 refresh elle tetikleme (FETCH_SECRET)
 * - GET  /trigger-daily?secret=...    -> daily sentez elle tetikleme (FETCH_SECRET)
 *
 * scheduled (cron: her 10 dk): normalde W1 (kapi-fetch) refresh tetikler;
 * TR 18:30 (UTC 15:30) penceresinde daily sentezi önceden üretir (iç çağrı, KV cache'e yazar).
 */

import { classify, computeLayer, countEscalationHits, CATEGORY_LABELS, type Classification } from "./rules";
import { matchTemplate } from "./templateEngine";
import { callGemini, analyzeWithGemini } from "./gemini";
import {
  buildAnalysisPrompt,
  SYSTEM_PROMPT,
  type AnalysisInput,
  type AnalysisOutput,
} from "./prompt";
import {
  buildDailyPrompt,
  DAILY_SYSTEM_PROMPT,
  selectDaily,
  validateDaily,
  type DailyItemInput,
  type DailySynthesis,
} from "./daily";

interface Env {
  kapi_db: D1Database;
  kapi_ai_cache: KVNamespace;
  GEMINI_API_KEY: string;
  W3_SECRET: string;
  CLASSIFY_SECRET: string;
  FETCH_SECRET: string;
  FETCH_URL: string;
  MODEL_HIGH?: string;
  MODEL_LOW?: string;
  DAILY_ANALYZE_LIMIT?: string;
  KV_TTL_SECONDS?: string;
  BATCH_LIMIT?: string;
}

// ============================== ortak yardımcılar ==============================

const KV_PREFIX = "ai:analyze:";
const RATE_PREFIX = "ai:rate:";
const RATE_TTL_SECONDS = 86400;

/** W1 sync_state'te koşu sürüyorsa (RUNNING) tetiklemeyi atla — birikme önlenir. */
const STALE_MS = 12 * 60 * 1000;

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function kvKey(index: string): string {
  return `${KV_PREFIX}${index}`;
}

/** TR günü -> UTC aralığı (TR = UTC+3, gün sınırı 21:00 UTC). */
function trDayRange(trDay: string): [string, string] | null {
  const start = new Date(`${trDay}T00:00:00+03:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return [start.toISOString(), end.toISOString()];
}

function trToday(): string {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

// ============================== W1 refresh (eski kapi-cron) ==============================

async function isBusy(env: Env): Promise<boolean> {
  try {
    const health = await fetch(env.FETCH_URL.replace(/\/api\/cron\/refresh$/, "/health"), {
      headers: { "X-Fetch-Secret": env.FETCH_SECRET },
    });
    if (!health.ok) return false;
    const body = (await health.json()) as {
      sync_state?: { last_error?: string | null; updated_at?: string | null } | null;
    };
    const err = body?.sync_state?.last_error;
    if (err !== "RUNNING") return false;
    const updated = body?.sync_state?.updated_at;
    if (!updated) return true;
    const ts = new Date(updated.replace(" ", "T") + "Z").getTime();
    if (Number.isNaN(ts)) return true;
    return Date.now() - ts < STALE_MS;
  } catch {
    return false;
  }
}

async function triggerRefresh(env: Env): Promise<Response> {
  if (await isBusy(env)) {
    return new Response(
      JSON.stringify({ status: 202, skipped: true, reason: "W1 koşusu sürüyor (RUNNING)" }),
      { status: 202, headers: { "content-type": "application/json" } }
    );
  }
  const resp = await fetch(env.FETCH_URL, {
    method: "POST",
    headers: { "X-Fetch-Secret": env.FETCH_SECRET },
  });
  const body = await resp.text();
  return new Response(
    JSON.stringify({ status: resp.status, body }),
    { status: resp.status, headers: { "content-type": "application/json" } }
  );
}

// ============================== AI analiz (eski kapi-ai) ==============================

interface AutoRequest {
  notification: Record<string, unknown>;
  classification?: { importanceScore?: number; category?: string } | null;
  layer?: 2 | 3;
}

async function rateLimited(env: Env): Promise<boolean> {
  const limit = Number(env.DAILY_ANALYZE_LIMIT ?? "1000");
  const key = `${RATE_PREFIX}${dayKey()}`;
  const current = Number((await env.kapi_ai_cache.get(key)) ?? "0");
  if (current >= limit) return true;
  await env.kapi_ai_cache.put(key, String(current + 1), { expirationTtl: RATE_TTL_SECONDS });
  return false;
}

/** D1'den bildirim + analiz satırını birleştirir */
async function fetchNotification(env: Env, index: string) {
  const rows = (await env.kapi_db
    .prepare(
      `SELECT n.*, a.importance_score, a.category, a.time_horizon
       FROM kap_notifications n
       LEFT JOIN kap_analysis a ON a.disclosure_index = n.disclosure_index
       WHERE n.disclosure_index = ?`
    )
    .bind(index)
    .all()) as unknown as { results: Array<Record<string, unknown>> };
  return rows.results?.[0] ?? null;
}

async function getTickers(env: Env, index: string): Promise<string[]> {
  const rows = (await env.kapi_db
    .prepare("SELECT ticker FROM notification_companies WHERE disclosure_index = ?")
    .bind(index)
    .all()) as unknown as { results: Array<{ ticker: string }> };
  return (rows.results ?? []).map((r) => r.ticker);
}

function modelForScore(env: Env, score: number): string {
  if (score >= 8) return env.MODEL_HIGH ?? "gemini-3.1-pro-preview";
  return env.MODEL_LOW ?? "gemini-2.5-flash";
}

/** layer varsa o karar verir; yoksa eski skor eşiği (>=8 -> pro) korunur. */
function modelForLayer(env: Env, score: number, layer?: 2 | 3): string {
  if (layer === 3) return env.MODEL_HIGH ?? "gemini-3.1-pro-preview";
  if (layer === 2) return env.MODEL_LOW ?? "gemini-2.5-flash";
  return modelForScore(env, score);
}

function toAnalysisInput(row: Record<string, unknown>, tickers: string[], score: number | null): AnalysisInput {
  return {
    tickers,
    companyTitle: (row.title as string) ?? "",
    subject: (row.subject as string) ?? "",
    disclosureClass: (row.disclosure_class as string) ?? null,
    publishDate: (row.publish_date as string) ?? null,
    summary: (row.summary as string) ?? null,
    isLate: Boolean(row.is_late),
    isBist100: Number(row.is_bist100) === 1,
    importanceScore: score,
    isChanged: Boolean(row.is_changed),
    pdfText: (row.pdf_text as string) ?? null,
  };
}

async function persistAnalysis(
  env: Env,
  index: string,
  output: AnalysisOutput,
  model: string,
  source: "auto" | "ondemand"
): Promise<void> {
  await env.kapi_db
    .prepare(
      `INSERT INTO kap_analysis
         (disclosure_index, summary_tr, impact_analysis, key_numbers, sentiment,
          chatbot_context, ai_model_used, confidence, needs_review, analyzed_at, source, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), ?, datetime('now'))
       ON CONFLICT(disclosure_index) DO UPDATE SET
         summary_tr       = excluded.summary_tr,
         impact_analysis  = excluded.impact_analysis,
         key_numbers      = excluded.key_numbers,
         sentiment        = excluded.sentiment,
         chatbot_context  = excluded.chatbot_context,
         ai_model_used    = excluded.ai_model_used,
         confidence       = excluded.confidence,
         analyzed_at      = excluded.analyzed_at,
         source           = excluded.source,
         updated_at       = datetime('now')`
    )
    .bind(
      index,
      output.summary_tr,
      output.impact_analysis,
      JSON.stringify(output.key_numbers),
      output.sentiment,
      output.chatbot_context,
      model,
      output.confidence,
      source
    )
    .run();
}

/** Analiz üret + D1'e yaz + KV'ye cache'le. Mevcut AI analizi varsa veritabanından döner. */
async function runAnalysis(
  env: Env,
  row: Record<string, unknown>,
  score: number | null,
  model: string,
  source: "auto" | "ondemand"
): Promise<AnalysisOutput> {
  const index = row.disclosure_index as string;
  let cached: string | null = null;
  try {
    cached = await env.kapi_ai_cache.get(kvKey(index));
  } catch {}
  if (cached) {
    try {
      return JSON.parse(cached) as AnalysisOutput;
    } catch {
      try { await env.kapi_ai_cache.delete(kvKey(index)); } catch {}
    }
  }
  const existing = await env.kapi_db
    .prepare(
      `SELECT summary_tr, impact_analysis, key_numbers, sentiment, chatbot_context, confidence
       FROM kap_analysis
       WHERE disclosure_index = ? AND summary_tr IS NOT NULL
         AND source IN ('auto', 'ondemand')`
    )
    .bind(index)
    .first();
  if (existing) {
    let keyNumbers = "[]";
    try {
      keyNumbers = (existing.key_numbers as string | null) ?? "[]";
      JSON.parse(keyNumbers);
    } catch {
      keyNumbers = "[]";
    }
    const out = {
      summary_tr: existing.summary_tr as string,
      impact_analysis: (existing.impact_analysis as string | null) ?? "",
      key_numbers: JSON.parse(keyNumbers) as string[],
      sentiment: ((existing.sentiment as string) ?? "neutral") as AnalysisOutput["sentiment"],
      chatbot_context: (existing.chatbot_context as string | null) ?? "",
      confidence: Number((existing.confidence as number | null) ?? 0.5),
    };
    return out;
  }
  const tickers = await getTickers(env, index);
  const output = await analyzeWithGemini(
    env.GEMINI_API_KEY,
    SYSTEM_PROMPT,
    buildAnalysisPrompt(toAnalysisInput(row, tickers, score)),
    { model }
  );
  await persistAnalysis(env, index, output, model, source);
  const ttl = Number(env.KV_TTL_SECONDS ?? "86400");
  await env.kapi_ai_cache.put(kvKey(index), JSON.stringify(output), { expirationTtl: ttl });
  return output;
}

async function handleAuto(
  env: Env,
  notification: Record<string, unknown>,
  classification?: AutoRequest["classification"],
  layer?: 2 | 3
): Promise<Response> {
  const index = notification?.disclosure_index as string | undefined;
  if (!index) return Response.json({ error: "disclosure_index gerekli" }, { status: 400 });
  const score = Number(classification?.importanceScore ?? notification?.importance_score ?? 0);
  const isBist100 = Number(notification.is_bist100) === 1;
  if (!isBist100 || score < 5) {
    return Response.json({ skipped: true, reason: "otomatik kapsam dışı (BIST100 skor>=5 gerekli)" });
  }
  try {
    const model = modelForLayer(env, score, layer);
    const output = await runAnalysis(env, notification, score, model, "auto");
    return Response.json({ ok: true, model, layer: layer ?? null, ...output });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/** S11-3: /daily — gün sonu sentez (KV cache gün bazlı, retry 2 deneme). */
async function dailySynthesis(
  env: Env,
  trDay: string,
  rawBody?: { force?: boolean }
): Promise<DailySynthesis> {
  const cacheKey = `ai:daily:${trDay}`;
  if (!rawBody?.force) {
    try {
      const cached = await env.kapi_ai_cache.get(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached) as DailySynthesis;
        } catch {
          try { await env.kapi_ai_cache.delete(cacheKey); } catch {}
        }
      }
    } catch {}
  }

  const range = trDayRange(trDay);
  if (!range) throw new Error("geçersiz tarih formatı (YYYY-MM-DD)");
  const [start, end] = range;

  const rows = (await env.kapi_db
    .prepare(
      `SELECT n.disclosure_index, n.subject, n.title, n.publish_date, n.is_bist100,
              a.importance_score, a.category, a.summary_tr,
              GROUP_CONCAT(nc.ticker) AS tickers
       FROM kap_analysis a
       JOIN kap_notifications n ON n.disclosure_index = a.disclosure_index
       LEFT JOIN notification_companies nc ON nc.disclosure_index = n.disclosure_index
       WHERE a.summary_tr IS NOT NULL AND a.importance_score IS NOT NULL
         AND n.publish_date >= ? AND n.publish_date < ?
       GROUP BY n.disclosure_index
       ORDER BY a.importance_score DESC`
    )
    .bind(start, end)
    .all()) as unknown as { results: Array<Record<string, unknown>> };
  const raw = rows.results ?? [];
  if (raw.length === 0) {
    throw new Error(`Gün için analiz yok (${trDay})`);
  }

  const items: DailyItemInput[] = raw.map((r) => ({
    disclosureIndex: r.disclosure_index as string,
    tickers: String(r.tickers ?? "")
      .split(",")
      .filter(Boolean),
    companyTitle: (r.title as string) ?? "",
    subject: (r.subject as string) ?? "",
    score: Number(r.importance_score ?? 0),
    category: (r.category as string) ?? "UNKNOWN",
    summaryTr: (r.summary_tr as string) ?? "",
    publishDate: (r.publish_date as string) ?? null,
    isBist100: Number(r.is_bist100) === 1,
  }));

  const { headline, overlooked } = selectDaily(items);

  const output = await callGemini(
    env.GEMINI_API_KEY,
    DAILY_SYSTEM_PROMPT,
    buildDailyPrompt(trDay, headline, overlooked),
    { model: env.MODEL_LOW ?? "gemini-2.5-flash", temperature: 0.5, maxOutputTokens: 4096 }
  );
  const synthesis = validateDaily(output);
  synthesis.date = trDay;

  const ttl = Number(env.KV_TTL_SECONDS ?? "86400");
  await env.kapi_ai_cache.put(cacheKey, JSON.stringify(synthesis), { expirationTtl: ttl });
  return synthesis;
}

// ============================== sınıflandırma (eski kapi-classify) ==============================

interface IngestionResult {
  processed: number;
  w3_triggered: number;
  w3_failed: number;
  w3_skipped: number;
  errors: number;
  byCategory: Record<string, number>;
  w3_error?: string;
}

async function ingest(env: Env): Promise<IngestionResult> {
  const limit = Number(env.BATCH_LIMIT ?? "100");
  const pending = (await env.kapi_db
    .prepare(
      `SELECT n.disclosure_index, n.mkk_member_id, n.title, n.subject,
              n.disclosure_class, n.disclosure_type, n.disclosure_category,
              n.summary, n.is_late, n.is_bist100,
              (n.pdf_text IS NOT NULL AND n.pdf_text != '') AS has_pdf
       FROM kap_notifications n
       LEFT JOIN kap_analysis a ON a.disclosure_index = n.disclosure_index
       WHERE a.disclosure_index IS NULL
          OR (a.source = 'auto' AND a.summary_tr IS NULL AND a.importance_score >= 5 AND n.is_bist100 = 1)
       ORDER BY n.publish_date ASC
       LIMIT ?`
    )
    .bind(limit)
    .all()) as unknown as { results: Array<Record<string, unknown>> };
  const rows = pending.results ?? [];

  const result: IngestionResult = {
    processed: 0,
    w3_triggered: 0,
    w3_failed: 0,
    w3_skipped: 0,
    errors: 0,
    byCategory: {},
  };

  const stmt = env.kapi_db.prepare(
    `INSERT INTO kap_analysis
       (disclosure_index, importance_score, category, time_horizon, needs_review,
        summary_tr, impact_analysis, source, analyzed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(disclosure_index) DO UPDATE SET
       importance_score = excluded.importance_score,
       category         = excluded.category,
       time_horizon     = excluded.time_horizon,
       needs_review     = excluded.needs_review,
       summary_tr       = COALESCE(excluded.summary_tr, kap_analysis.summary_tr),
       impact_analysis  = COALESCE(excluded.impact_analysis, kap_analysis.impact_analysis),
       source           = CASE WHEN excluded.source = 'template' AND kap_analysis.source != 'auto'
                               THEN excluded.source ELSE kap_analysis.source END,
       analyzed_at      = excluded.analyzed_at,
       updated_at       = datetime('now')`
  );

  const statements: D1PreparedStatement[] = [];
  for (const row of rows) {
    try {
      const classification = classify({
        disclosureClass: (row.disclosure_class as string) ?? null,
        disclosureCategory: (row.disclosure_category as string) ?? null,
        subject: (row.subject as string) ?? null,
        title: (row.title as string) ?? null,
        summary: (row.summary as string) ?? null,
        isLate: Boolean(row.is_late),
        hasPdfText: Boolean(row.has_pdf),
      });

      const tpl = matchTemplate({
        subject: row.subject as string | null,
        title: row.title as string | null,
        summary: row.summary as string | null,
      });
      const source = tpl ? "template" : "auto";

      statements.push(
        stmt.bind(
          row.disclosure_index as string,
          Math.round(classification.importanceScore),
          tpl?.category ?? classification.category,
          classification.timeHorizon,
          classification.needsReview ? 1 : 0,
          tpl?.summary_tr ?? null,
          tpl?.impact_analysis ?? null,
          source
        )
      );
      result.byCategory[CATEGORY_LABELS[classification.category]] =
        (result.byCategory[CATEGORY_LABELS[classification.category]] ?? 0) + 1;

      const isBist100 = Number(row.is_bist100) === 1;
      const hasEscalation = countEscalationHits({
        subject: row.subject as string | null,
        title: row.title as string | null,
        summary: row.summary as string | null,
      }) > 0;
      if (tpl) {
        result.w3_skipped += 1;
      } else if (isBist100 && (classification.importanceScore >= 5 || hasEscalation)) {
        const layer = computeLayer(
          {
            subject: row.subject as string | null,
            title: row.title as string | null,
            summary: row.summary as string | null,
          },
          classification
        );
        try {
          // İç çağrı: /auto mantığı (HTTP/binding yok — aynı worker).
          const res = await handleAuto(env, row as Record<string, unknown>, classification, layer);
          if (res.status === 200) result.w3_triggered += 1;
          else result.w3_failed += 1;
        } catch (err) {
          result.w3_failed += 1;
          result.w3_error = err instanceof Error ? err.message : String(err);
        }
      } else {
        result.w3_skipped += 1;
      }
      result.processed += 1;
    } catch (err) {
      console.error("ingest satır hatası:", row.disclosure_index, err);
      result.errors += 1;
    }
  }
  if (statements.length) await env.kapi_db.batch(statements);
  return result;
}

// ============================== worker ==============================

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const d = new Date();
    const utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
    // TR 18:30 = UTC 15:30 — gün sonu sentezi önceden üret (iç çağrı, KV cache).
    if (utcMinutes >= 925 && utcMinutes <= 940) {
      ctx.waitUntil(
        dailySynthesis(env, trToday()).catch((err) => {
          console.error("kapi daily hata:", err);
        })
      );
      return;
    }
    ctx.waitUntil(
      triggerRefresh(env).catch((err) => {
        console.error("kapi scheduled hata:", err);
      })
    );
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/health") {
        return Response.json({
          status: "ok",
          service: "kapi",
          hasGemini: Boolean(env.GEMINI_API_KEY),
        });
      }

      if (url.pathname === "/ingest" && request.method === "POST") {
        if (request.headers.get("x-classify-secret") !== env.CLASSIFY_SECRET) {
          return Response.json({ error: "yetkisiz" }, { status: 401 });
        }
        try {
          return Response.json(await ingest(env));
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : String(err) },
            { status: 500 }
          );
        }
      }

      if (url.pathname === "/auto" && request.method === "POST") {
        if (request.headers.get("x-w3-secret") !== env.W3_SECRET) {
          return Response.json({ error: "yetkisiz" }, { status: 401 });
        }
        let body: AutoRequest;
        try {
          body = (await request.json()) as AutoRequest;
        } catch {
          return Response.json({ error: "geçersiz JSON body" }, { status: 400 });
        }
        return handleAuto(env, body.notification ?? {}, body.classification, body.layer);
      }

      if (url.pathname === "/analyze" && request.method === "POST") {
        let body: { disclosure_index?: string };
        try {
          body = (await request.json()) as { disclosure_index?: string };
        } catch {
          return Response.json({ error: "geçersiz JSON body" }, { status: 400 });
        }
        const index = body?.disclosure_index;
        if (!index) return Response.json({ error: "disclosure_index gerekli" }, { status: 400 });

        if (await rateLimited(env)) {
          return Response.json({ error: "günlük analiz limitine ulaşıldı" }, { status: 429 });
        }
        const row = await fetchNotification(env, index);
        if (!row) return Response.json({ error: "bildirim bulunamadı" }, { status: 404 });

        const score = (row.importance_score as number | null) ?? null;
        const model = modelForScore(env, score ?? 0);
        const output = await runAnalysis(env, row, score, model, "ondemand");
        return Response.json({ ok: true, model, ...output });
      }

      if (url.pathname === "/daily" && request.method === "POST") {
        if (request.headers.get("x-w3-secret") !== env.W3_SECRET) {
          return Response.json({ error: "yetkisiz" }, { status: 401 });
        }
        let body: { date?: string; force?: boolean } = {};
        try {
          body = (await request.json()) as { date?: string; force?: boolean };
        } catch {}
        const trDay = body.date ?? url.searchParams.get("date") ?? trToday();
        try {
          const synthesis = await dailySynthesis(env, trDay, body);
          return Response.json({ ok: true, ...synthesis });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const notFound = msg.includes("analiz yok");
          return Response.json({ error: msg }, { status: notFound ? 404 : 500 });
        }
      }

      if (url.pathname === "/trigger") {
        if (url.searchParams.get("secret") !== env.FETCH_SECRET) {
          return Response.json({ error: "yetkisiz" }, { status: 401 });
        }
        return triggerRefresh(env);
      }

      if (url.pathname === "/trigger-daily") {
        if (url.searchParams.get("secret") !== env.FETCH_SECRET) {
          return Response.json({ error: "yetkisiz" }, { status: 401 });
        }
        try {
          const synthesis = await dailySynthesis(env, trToday());
          return Response.json({ ok: true, ...synthesis });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return Response.json({ error: msg }, { status: 500 });
        }
      }

      return Response.json({ error: "not found" }, { status: 404 });
    } catch (err) {
      console.error("[kapi] beklenmeyen hata:", err);
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 }
      );
    }
  },
};

export { ingest, handleAuto, dailySynthesis };