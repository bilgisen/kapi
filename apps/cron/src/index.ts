/**
 * S7-1: kapi-cron Worker (Cloudflare) — W1 (kapi-fetch) tazeleme zamanlayıcısı.
 *
 * - scheduled (crons): her 10 dk'da POST https://kapi-7d527e98.fastapicloud.dev/api/cron/refresh
 *   (X-Fetch-Secret) ile 2 günlük pencereyi çektirir; W1 zinciri otomatik sürer:
 *   W1 fetch -> kapi-classify /ingest -> (skor>=5 is_bist100) kapi-ai /auto.
 * - S11-6: TR 18:30'da (UTC 15:30) gün sonu sentezini önceden üretir:
 *   kapi-ai /daily (X-W3-Secret) — KV cache'e yazar, akşam kullanıcı ilk açtığında hazırdır.
 * - GET /trigger?secret=... : elle tetikleme (test/operasyon).
 * - GET /health            : durum.
 *
 * Fetch secret env'den okunur (FETCH_SECRET — wrangler secret, dashboard'daki
 * FASTAPI_SECRET_KEY ile aynı değer).
 */

export interface Env {
  FETCH_URL: string;
  FETCH_SECRET: string;
  W3_URL: string;
  W3_SECRET: string;
  /** S11-6: workers.dev'e HTTP fetch kapi-cron'dan 404+1042 döndüğü için
   *  service binding ile gidiyoruz (hono'daki gibi). */
  KAPI_AI?: Fetcher;
}

/** W1 sync_state'te koşu sürüyorsa (RUNNING) tetiklemeyi atla — birikme önlenir.
 *  RUNNING bayrağı 12 dk'dan eskiyse "ölü koşu" sayılır (deploy/çökme sonrası
 *  yapışan bayrak) ve tetiklemeye izin verilir. */
const STALE_MS = 12 * 60 * 1000;

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

/** S11-6: TR gününün (UTC+3) sentezini kapi-ai'de üretir (KV cache'ler). */
async function triggerDaily(env: Env): Promise<Response> {
  const trDay = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
  if (!env.W3_SECRET) {
    return new Response(
      JSON.stringify({ status: 503, skipped: true, reason: "W3_SECRET tanimsiz" }),
      { status: 503, headers: { "content-type": "application/json" } }
    );
  }
  const target = env.W3_URL ?? "https://kapi-ai.jetborsa.workers.dev";
  const resp = env.KAPI_AI
    ? await env.KAPI_AI.fetch(target + "/daily", {
        method: "POST",
        headers: { "content-type": "application/json", "x-w3-secret": env.W3_SECRET },
        body: JSON.stringify({ date: trDay }),
      })
    : await fetch(target + "/daily", {
        method: "POST",
        headers: { "content-type": "application/json", "x-w3-secret": env.W3_SECRET },
        body: JSON.stringify({ date: trDay }),
      });
  const body = await resp.text();
  return new Response(
    JSON.stringify({ status: resp.status, date: trDay, body: body.slice(0, 300) }),
    { status: resp.status, headers: { "content-type": "application/json" } }
  );
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const cron = event.cron;
    // S11-6: TR 18:30 = UTC 15:30 — gün sonu sentezi önceden üret.
    // Tek cron (*/10) altında saat kontrolü ile ayrıştırılıyor (Free cron limiti).
    const d = new Date();
    const utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes();
    if (utcMinutes >= 925 && utcMinutes <= 940) {
      ctx.waitUntil(
        triggerDaily(env).catch((err) => {
          console.error("kapi-cron daily hata:", err);
        })
      );
      return;
    }
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
    if (url.pathname === "/trigger-daily") {
      if (url.searchParams.get("secret") !== env.FETCH_SECRET) {
        return new Response("yetkisiz", { status: 401 });
      }
      return triggerDaily(env);
    }
    return new Response("not found", { status: 404 });
  },
};
