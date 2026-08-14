/**
 * S3-3/4/5/6: kapi-ai Worker (Cloudflare).
 *
 * - POST /auto     -> W2 (kapi-classify) çağırır: is_bist100=1 ve skor>=5 kayıtlar.
 *                     skor >= 8 -> MODEL_HIGH (pro), 5-7 -> MODEL_LOW (flash).
 * - POST /analyze  -> On-demand (K11): herkes; KV cache-first (24sa); global günlük limit.
 * - GET  /health   -> durum
 *
 * Auth: /analyze halka açık (K11), /auto X-W3-Secret ile korunur.
 */

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
  MODEL_HIGH?: string;
  MODEL_LOW?: string;
  DAILY_ANALYZE_LIMIT?: string;
  KV_TTL_SECONDS?: string;
}

interface AutoRequest {
  notification: Record<string, unknown>;
  classification?: { importanceScore?: number; category?: string } | null;
  /** S10-2: 2 = kısa AI (flash), 3 = derin (pro). Yoksa skor >= 8 -> pro. */
  layer?: 2 | 3;
}

const KV_PREFIX = "ai:analyze:";
const RATE_PREFIX = "ai:rate:";
const RATE_TTL_SECONDS = 86400;

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function kvKey(index: string): string {
  return `${KV_PREFIX}${index}`;
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

/** S10-2: layer varsa o karar verir; yoksa eski skor eşiği (>=8 -> pro) korunur. */
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
      // Bozuk cache: sil ve yeniden üret (self-heal)
      try { await env.kapi_ai_cache.delete(kvKey(index)); } catch {}
    }
  }
  const existing = await env.kapi_db
    .prepare(
      `SELECT summary_tr FROM kap_analysis
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

/** S11-3: TR günü -> UTC aralığı. TR = UTC+3, gün sınırı 21:00 UTC. */
function trDayRange(trDay: string): [string, string] | null {
  const start = new Date(`${trDay}T00:00:00+03:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return [start.toISOString(), end.toISOString()];
}

function trToday(): string {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "kapi-ai", hasGemini: Boolean(env.GEMINI_API_KEY) });
    }

    // --- /daily: gün sonu sentez (S11) — Hono tarafı X-W3-Secret ile çağırır ---
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

    // --- /auto: W2 tetiklemesi (yalnız BIST100 skor>=5) ---
    if (url.pathname === "/auto" && request.method === "POST") {
      if (request.headers.get("x-w3-secret") !== env.W3_SECRET) {
        return Response.json({ error: "yetkisiz" }, { status: 401 });
      }
      const body = (await request.json()) as AutoRequest;
      const row = body.notification;
      const index = row?.disclosure_index as string | undefined;
      if (!index) return Response.json({ error: "disclosure_index gerekli" }, { status: 400 });

      const score = Number(body.classification?.importanceScore ?? row?.importance_score ?? 0);
      const isBist100 = Number(row.is_bist100) === 1;
      if (!isBist100 || score < 5) {
        return Response.json({ skipped: true, reason: "otomatik kapsam dışı (BIST100 skor>=5 gerekli)" });
      }
      try {
        const model = modelForLayer(env, score, body.layer);
        const output = await runAnalysis(env, row, score, model, "auto");
        return Response.json({ ok: true, model, layer: body.layer ?? null, ...output });
      } catch (err) {
        return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
      }
    }

    // --- /analyze: on-demand (K11) — cache-first, günlük limit ---
    if (url.pathname === "/analyze" && request.method === "POST") {
      try {
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
      } catch (err) {
        console.error(`[analyze] Hata:`, err);
        return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
      }
    }

    return Response.json({ error: "not found" }, { status: 404 });
  },
};