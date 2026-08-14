/**
 * S7-1: kapi-cron Worker (Cloudflare) — W1 (kapi-fetch) tazeleme zamanlayıcısı.
 *
 * - scheduled (crons): her 10 dk'da POST https://kapi-7d527e98.fastapicloud.dev/api/cron/refresh
 *   (X-Fetch-Secret) ile 2 günlük pencereyi çektirir; W1 zinciri otomatik sürer:
 *   W1 fetch -> kapi-classify /ingest -> (skor>=5 is_bist100) kapi-ai /auto.
 * - GET /trigger?secret=... : elle tetikleme (test/operasyon).
 * - GET /health            : durum.
 *
 * Fetch secret env'den okunur (FETCH_SECRET — wrangler secret, dashboard'daki
 * FASTAPI_SECRET_KEY ile aynı değer).
 */

export interface Env {
  FETCH_URL: string;
  FETCH_SECRET: string;
}

/** W1 sync_state'te koşu sürüyorsa (RUNNING) tetiklemeyi atla — birikme önlenir. */
async function isBusy(env: Env): Promise<boolean> {
  try {
    const health = await fetch(env.FETCH_URL.replace(/\/api\/cron\/refresh$/, "/health"), {
      headers: { "X-Fetch-Secret": env.FETCH_SECRET },
    });
    if (!health.ok) return false;
    const body = (await health.json()) as {
      sync_state?: { last_error?: string | null } | null;
    };
    return body?.sync_state?.last_error === "RUNNING";
  } catch {
    return false;
  }
}

async function trigger(env: Env): Promise<Response> {
  if (await isBusy(env)) {
    return new Response(
      JSON.stringify({ status: 202, skipped: true, reason: "W1 koşusu sürüyor (RUNNING)" }),
      { status: 202, headers: { "content-type": "application/json" } }
    );
  }
  const resp = await fetch(env.FETCH_URL, {
    method: "POST",
    headers: {
      "X-Fetch-Secret": env.FETCH_SECRET,
    },
  });
  const body = await resp.text();
  return new Response(
    JSON.stringify({ status: resp.status, body }),
    { status: resp.status, headers: { "content-type": "application/json" } }
  );
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      trigger(env).catch((err) => {
        console.error("kapi-cron scheduled hata:", err);
      })
    );
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", service: "kapi-cron" }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname === "/trigger") {
      if (url.searchParams.get("secret") !== env.FETCH_SECRET) {
        return new Response("yetkisiz", { status: 401 });
      }
      return trigger(env);
    }
    return new Response("not found", { status: 404 });
  },
};
