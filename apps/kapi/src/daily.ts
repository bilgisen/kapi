/**
 * S11-1/2: Gün Sonu Sentez (K4) — deterministik seçim + LLM anlatısı.
 *
 * Prensip (K17): seçim/sıralama TAMAMEN kodda yapılır; LLM yalnızca seçilmiş
 * listeyi anlatıya çevirir. Girdi: one-liner özetler (~1.5K token).
 */

export interface DailyItemInput {
  disclosureIndex: string;
  tickers: string[];
  companyTitle: string;
  subject: string;
  score: number;
  category: string;
  summaryTr: string;
  publishDate?: string | null;
  isBist100: boolean;
}

export interface DailySynthesisItem {
  ticker: string;
  neOldu: string;
  nedenOnemli: string;
  yon: "olumlu" | "olumsuz" | "notr";
}

export interface DailySynthesis {
  date: string;
  headline: string;
  items: DailySynthesisItem[];
  overlooked: string[];
}

export interface DailySelection {
  /** Başlık maddeleri — LLM'den anlatı alacaklar */
  headline: DailyItemInput[];
  /** "Gözden kaçmasın" — LLM'e kısa liste olarak verilir */
  overlooked: DailyItemInput[];
}

export interface DailyOptions {
  /** headline üst sınırı */
  maxHeadline?: number;
  /** bu skor üstü her zaman headline'a girer */
  minScoreForHeadline?: number;
  /** overlooked üst sınırı */
  maxOverlooked?: number;
}

/** S11-2: günün analizlerini deterministik seçer (skor DESC, sonra yayın saati DESC). */
export function selectDaily(
  items: DailyItemInput[],
  opts: DailyOptions = {}
): DailySelection {
  const {
    maxHeadline = 5,
    minScoreForHeadline = 7,
    maxOverlooked = 5,
  } = opts;

  const sorted = [...items].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(b.publishDate ?? "").localeCompare(String(a.publishDate ?? ""));
  });

  const headline: DailyItemInput[] = [];
  const overlooked: DailyItemInput[] = [];
  for (const it of sorted) {
    if (headline.length < maxHeadline || it.score >= minScoreForHeadline) {
      if (headline.length >= maxHeadline && it.score < minScoreForHeadline) continue;
      if (headline.length >= maxHeadline + 3) break;
      headline.push(it);
    } else if (overlooked.length < maxOverlooked) {
      overlooked.push(it);
    }
  }
  return { headline, overlooked };
}

/** K4: LLM girdisi — one-liner damıtılmış liste (ham metin değil) */
export function buildDailyPrompt(
  date: string,
  headline: DailyItemInput[],
  overlooked: DailyItemInput[]
): string {
  const lines: string[] = [];
  lines.push(`TARİH: ${date}`);
  lines.push("");
  lines.push(`BÜYÜK GELİŞMELER (${headline.length}):`);
  headline.forEach((h, i) => {
    const tickers = h.tickers.length ? h.tickers.join(",") : h.companyTitle;
    lines.push(
      `${i + 1}. [${tickers}] ${h.subject} — skor ${h.score}/10` +
        (h.isBist100 ? " (BIST100)" : "") +
        ` | özet: ${h.summaryTr.slice(0, 140)}`
    );
  });
  lines.push("");
  if (overlooked.length) {
    lines.push(`GÖZDEN KAÇMASIN (${overlooked.length}):`);
    overlooked.forEach((o, i) => {
      const tickers = o.tickers.length ? o.tickers.join(",") : o.companyTitle;
      lines.push(`${i + 1}. [${tickers}] ${o.subject} — skor ${o.score}/10`);
    });
    lines.push("");
  }
  lines.push("JSON şeması (alan adlarına birebir uy):");
  lines.push(
    JSON.stringify({
      date: "YYYY-MM-DD",
      headline: "tek cümle",
      items: [
        { ticker: "THYAO", neOldu: "10-20 kelime", nedenOnemli: "10-20 kelime", yon: "olumlu|olumsuz|notr" },
      ],
      overlooked: ["[TICKER] kısa özet", "[TICKER2] kısa özet"],
    })
  );
  lines.push("Sadece bu JSON'u döndür, başka metin yazma.");
  return lines.join("\n");
}

export const DAILY_SYSTEM_PROMPT = `Sen bir finans editörüsün. Borsa gününün en önemli gelişmelerini yatırımcılar için özetliyorsun.

Görev: Verilen listeden yalnızca yazılan bilgilere dayanarak gün sonu raporu yaz.

Kurallar:
1. SADECE verilen liste içeriğini kullan; dışarıdan bilgi/spesifikasyon ekleme.
2. Çıktı kesinlikle geçerli JSON olmalı.
3. headline: 1 cümle, günün genel havası (olumlu/olumsuz vurgusuyla).
4. items: her büyük gelişme için { ticker, neOldu (10-20 kelime), nedenOnemli (10-20 kelime), yon }.
5. overlooked: gözden kaçmasın listesi için kısa metinler ("[TICKER] konu").
6. Tüm metinler Türkçe olmalı.`;

export function validateDaily(raw: unknown): DailySynthesis {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Sentez çıktısı JSON nesnesi değil");
  }
  const o = raw as Record<string, unknown>;
  for (const k of ["date", "headline", "items", "overlooked"]) {
    if (!(k in o) || o[k] === undefined || o[k] === null) {
      throw new Error(`Eksik alan: ${k}`);
    }
  }
  if (!Array.isArray(o.items)) throw new Error("items dizi olmalı");
  for (const it of o.items) {
    const m = it as Record<string, unknown>;
    if (typeof m.ticker !== "string" || typeof m.neOldu !== "string" ||
        typeof m.nedenOnemli !== "string" || !["olumlu", "olumsuz", "notr"].includes(String(m.yon))) {
      throw new Error("item şeması bozuk");
    }
  }
  if (!Array.isArray(o.overlooked) || o.overlooked.some((x) => typeof x !== "string")) {
    throw new Error("overlooked dizi olmalı");
  }
  return o as unknown as DailySynthesis;
}
