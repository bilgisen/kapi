/**
 * S2-3/4: kapi-classify Worker (Cloudflare).
 *
 * - POST /ingest     -> W1 tarafından çağrılır: bekleyen bildirimleri D1'den okur,
 *                       sınıflandırır, kap_analysis'e yazar; BIST100 skor>=5 -> W3 tetiklenir.
 * - GET  /health     -> durum
 *
 * Auth: `X-Classify-Secret` header (CLASSIFY_SECRET env ile karşılaştırılır).
 * Retry: W3 çağrıları 3 deneme + exponential backoff (S2-4).
 */

import { classify, CATEGORY_LABELS, type Classification } from "./rules";

interface Env {
  kapi_db: D1Database;
  CLASSIFY_SECRET: string;
  /** W3 AI-analiz worker URL'si (S3'te doldurulacak; boşsa tetikleme atlanır) */
  CLASSIFY_W3_URL?: string;
  /** W3'e giden auth header değeri */
  CLASSIFY_W3_SECRET?: string;
  BATCH_LIMIT?: string;
}

interface IngestionResult {
  processed: number;
  w3_triggered: number;
  w3_failed: number;
  w3_skipped: number;
  errors: number;
  byCategory: Record<string, number>;
}

const MAX_W3_RETRIES = 3;

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function triggerW3(env: Env, notification: Record<string, unknown>, classification: Classification): Promise<boolean> {
  if (!env.CLASSIFY_W3_URL) return false;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (env.CLASSIFY_W3_SECRET) headers["x-w3-secret"] = env.CLASSIFY_W3_SECRET;

  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= MAX_W3_RETRIES; attempt++) {
    try {
      await fetchJson(env.CLASSIFY_W3_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ notification, classification }),
      });
      return true;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_W3_RETRIES) await sleep(250 * 2 ** attempt);
    }
  }
  console.error("W3 tetikleme başarısız:", notification.disclosure_index, lastErr?.message);
  return false;
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
       (disclosure_index, importance_score, category, time_horizon, needs_review, analyzed_at, source, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), 'auto', datetime('now'))
     ON CONFLICT(disclosure_index) DO UPDATE SET
       importance_score = excluded.importance_score,
       category         = excluded.category,
       time_horizon     = excluded.time_horizon,
       needs_review     = excluded.needs_review,
       analyzed_at      = excluded.analyzed_at,
       source           = excluded.source,
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
      statements.push(
        stmt.bind(
          row.disclosure_index as string,
          Math.round(classification.importanceScore),
          classification.category,
          classification.timeHorizon,
          classification.needsReview ? 1 : 0
        )
      );
      result.byCategory[CATEGORY_LABELS[classification.category]] =
        (result.byCategory[CATEGORY_LABELS[classification.category]] ?? 0) + 1;

      if (Number(row.is_bist100) === 1 && classification.importanceScore >= 5) {
        if (!env.CLASSIFY_W3_URL) {
          result.w3_skipped += 1;
        } else {
          const ok = await triggerW3(env, row as Record<string, unknown>, classification);
          if (ok) result.w3_triggered += 1;
          else result.w3_failed += 1;
        }
      }
      result.processed += 1;
    } catch (err) {
      result.errors += 1;
      console.error("ingest satır hatası:", row.disclosure_index, err);
    }
  }
  if (statements.length) await env.kapi_db.batch(statements);
  return result;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "kapi-classify" });
    }

    if (url.pathname === "/ingest" && request.method === "POST") {
      if (request.headers.get("x-classify-secret") !== env.CLASSIFY_SECRET) {
        return Response.json({ error: "yetkisiz" }, { status: 401 });
      }
      try {
        const result = await ingest(env);
        return Response.json(result);
      } catch (err) {
        return Response.json(
          { error: err instanceof Error ? err.message : String(err) },
          { status: 500 }
        );
      }
    }

    return Response.json({ error: "not found" }, { status: 404 });
  },
};

export { ingest };