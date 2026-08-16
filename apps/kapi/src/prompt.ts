/**
 * S3-1: Prompt mimarisi + JSON çıktı şeması (saf, test edilebilir).
 */

export interface AnalysisInput {
  tickers?: string[];
  companyTitle: string;
  subject: string;
  disclosureClass?: string | null;
  publishDate?: string | null;
  summary?: string | null;
  isLate?: boolean;
  isBist100?: boolean;
  importanceScore?: number | null;
  categoryLabel?: string | null;
  isChanged?: boolean;
  pdfText?: string | null;
}

export interface AnalysisOutput {
  summary_tr: string;
  impact_analysis: string;
  key_numbers: string[];
  sentiment: "positive" | "negative" | "neutral";
  chatbot_context: string;
  confidence: number;
}

export const SYSTEM_PROMPT = `Sen bir sermaye piyasaları analistisin. KAP (Kamuyu Aydınlatma Platformu) bildirimlerini yatırımcılar için analiz ediyorsun.

Görev: Verilen bildirimi objektif, yatırımcı odaklı bir analize dönüştür.

Kurallar:
1. SADECE verilen bildirim içeriğine dayan; spekülasyon yapma.
2. Çıktı kesinlikle geçerli JSON olmalı, başka metin olmamalı.
3. summary_tr: 2-3 cümle Türkçe özet.
4. impact_analysis: bildirimin şirket ve hisseye olası etkisi (maddi/olumsuz nötr), 3-4 cümle.
5. key_numbers: bildirimde geçen sayısal veriler (tutarlar, tarihler, oranlar) en fazla 5 madde; yoksa boş liste.
6. sentiment: positive | negative | neutral (kesin emin değilsen neutral).
7. chatbot_context: 150-200 kelime arası, bir sohbet botunun bu bildirimi açıklarken kullanabileceği Türkçe açıklama.
8. confidence: 0.0-1.0 arası, elimizdeki bilgiye güven seviyesi.

JSON şeması:
{
  "summary_tr": "string",
  "impact_analysis": "string",
  "key_numbers": ["string"],
  "sentiment": "positive|negative|neutral",
  "chatbot_context": "string",
  "confidence": 0.0
}`;

/** S3-1: girdiden prompt metni üretir (subject, tür, şirket, tarih, özet, pdf ilk 4K) */
export function buildAnalysisPrompt(input: AnalysisInput): string {
  const lines: string[] = [];
  lines.push(`ŞİRKET: ${input.companyTitle || "Bilinmiyor"}`);
  if (input.tickers?.length) lines.push(`HİSSE KODLARI: ${input.tickers.join(", ")}`);
  lines.push(`KONU: ${input.subject || "Bilinmiyor"}`);
  if (input.disclosureClass) lines.push(`BİLDİRİM SINIFI: ${input.disclosureClass}`);
  if (input.publishDate) lines.push(`TARİH: ${input.publishDate}`);
  if (input.categoryLabel) lines.push(`KATEGORİ: ${input.categoryLabel}`);
  if (input.importanceScore != null) lines.push(`ÖNEM SKORU: ${input.importanceScore}/10`);
  lines.push(`DEĞİŞİKLİK: ${input.isChanged ? "Evet (güncellenmiş bildirim)" : "Hayır"}`);
  lines.push("");

  lines.push(`KAP ÖZETİ:`);
  lines.push(input.summary?.trim() || "(özet yok)");
  lines.push("");

  const pdf = input.pdfText?.trim() || "";
  if (pdf) {
    lines.push(`BİLDİRİM METNİ (ilk 4000 karakter):`);
    lines.push(pdf.slice(0, 4000));
  } else {
    lines.push("(bildirim metni mevcut değil)");
  }
  lines.push("");
  lines.push("Yukarıdaki bildirimi şemaya uygun JSON olarak analiz et.");
  return lines.join("\n");
}

/** S3-1: model çıktısını doğrular; geçersizse throws. */
export function validateAnalysis(raw: unknown): AnalysisOutput {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Analiz çıktısı JSON nesnesi değil");
  }
  const o = raw as Record<string, unknown>;
  const missing: string[] = [];
  for (const k of ["summary_tr", "impact_analysis", "key_numbers", "sentiment", "chatbot_context", "confidence"]) {
    if (!(k in o) || o[k] === undefined || o[k] === null) missing.push(k);
  }
  if (missing.length) throw new Error(`Eksik alanlar: ${missing.join(", ")}`);
  if (!Array.isArray(o.key_numbers) || o.key_numbers.some((k) => typeof k !== "string")) {
    throw new Error("key_numbers dizi olmalı");
  }
  if (!["positive", "negative", "neutral"].includes(String(o.sentiment))) {
    throw new Error("sentiment geçersiz");
  }
  if (!(typeof o.confidence === "number" && o.confidence >= 0 && o.confidence <= 1)) {
    throw new Error("confidence 0-1 aralığında olmalı");
  }
  return o as unknown as AnalysisOutput;
}

/** Model çıktısından fenced JSON bloğunu çıkarır (Gemini bazen ```json ... ``` sarar). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) {
    try {
      return JSON.parse(candidate);
    } catch {
      throw new Error("JSON bloğu bulunamadı");
    }
  }
  return JSON.parse(candidate.slice(start, end + 1));
}