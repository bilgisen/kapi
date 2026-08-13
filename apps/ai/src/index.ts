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

import { analyzeWithGemini } from "./gemini";
import {
  buildAnalysisPrompt,
  SYSTEM_PROMPT,
  type AnalysisInput,
  type AnalysisOutput,
} from "./prompt";

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "kapi-ai", hasGemini: Boolean(env.GEMINI_API_KEY) });
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