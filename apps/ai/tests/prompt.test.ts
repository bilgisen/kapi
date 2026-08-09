import { describe, expect, it } from "vitest";
import {
  buildAnalysisPrompt,
  extractJson,
  SYSTEM_PROMPT,
  validateAnalysis,
  type AnalysisInput,
} from "../src/prompt";

const valid = {
  summary_tr: "Şirket 2. çeyrek kârını açıkladı.",
  impact_analysis: "Kâr beklentileri aştı, hisse üzerinde olumlu etki beklenebilir.",
  key_numbers: ["2. çeyrek", "1,2 milyar TL"],
  sentiment: "positive",
  chatbot_context: "Bu bildirim, şirketin ikinci çeyrek finansal sonuçlarını açıkladığını gösteriyor. Kâr beklentilerin üzerinde gerçekleşti...",
  confidence: 0.85,
};

describe("buildAnalysisPrompt", () => {
  it("şirket, konu, tarih, özet ve pdf metnini içerir", () => {
    const input: AnalysisInput = {
      tickers: ["THYAO"],
      companyTitle: "Türk Hava Yolları A.O.",
      subject: "Finansal Rapor",
      publishDate: "2026-08-09T10:00:00Z",
      summary: "2. çeyrek sonuçları",
      pdfText: "Uzun metin ".repeat(1000),
    };
    const p = buildAnalysisPrompt(input);
    expect(p).toContain("THYAO");
    expect(p).toContain("Finansal Rapor");
    expect(p).toContain("2026-08-09");
    expect(p).toContain("2. çeyrek sonuçları");
    expect(p.length).toBeLessThan(60_000); // pdf 4K tavanı
  });

  it("pdf yoksa metin mevcut değil der", () => {
    const p = buildAnalysisPrompt({ companyTitle: "X", subject: "Y" });
    expect(p).toContain("bildirim metni mevcut değil");
  });
});

describe("validateAnalysis", () => {
  it("geçerli çıktıyı kabul eder", () => {
    expect(() => validateAnalysis(valid)).not.toThrow();
  });

  it("eksik alan -> hata", () => {
    const { summary_tr: _drop, ...rest } = valid;
    expect(() => validateAnalysis(rest)).toThrow(/Eksik alanlar/);
  });

  it("hatalı sentiment -> hata", () => {
    expect(() => validateAnalysis({ ...valid, sentiment: "bullish" })).toThrow(/sentiment/);
  });

  it("hatalı confidence -> hata", () => {
    expect(() => validateAnalysis({ ...valid, confidence: 3 })).toThrow(/confidence/);
  });

  it("key_numbers dizi değilse -> hata", () => {
    expect(() => validateAnalysis({ ...valid, key_numbers: "1,2" })).toThrow(/key_numbers/);
  });
});

describe("extractJson", () => {
  it("düz JSON parse eder", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("fenced JSON bloğunu ayıklar", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("öncesi/sonrası metinli JSON'u ayıklar", () => {
    expect(extractJson('Açıklama:\n{"a":1}\nEOF')).toEqual({ a: 1 });
  });

  it("JSON yoksa -> hata", () => {
    expect(() => extractJson("metin metin")).toThrow();
  });
});

describe("SYSTEM_PROMPT", () => {
  it("JSON şeması ve Türkçe kurallar içerir", () => {
    expect(SYSTEM_PROMPT).toContain("summary_tr");
    expect(SYSTEM_PROMPT).toContain("chatbot_context");
    expect(SYSTEM_PROMPT).toContain("confidence");
    expect(SYSTEM_PROMPT).toContain("JSON");
  });
});