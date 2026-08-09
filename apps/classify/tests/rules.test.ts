import { describe, expect, it } from "vitest";
import {
  adjustImportance,
  classify,
  normalize,
  scoreToLabel,
  CATEGORY_LABELS,
} from "../src/rules";

describe("normalize", () => {
  it("Türkçe karakterleri eşler", () => {
    expect(normalize("TEMETTÜ ÖDENMESİ")).toBe("temettu odenmesi");
  });
});

describe("scoreToLabel sınırları (5/7/9)", () => {
  it("1..4 -> RUTİN", () => {
    expect(scoreToLabel(1)).toBe("RUTİN");
    expect(scoreToLabel(4)).toBe("RUTİN");
  });
  it("5..6 -> ÖNEMLİ", () => {
    expect(scoreToLabel(5)).toBe("ÖNEMLİ");
    expect(scoreToLabel(6)).toBe("ÖNEMLİ");
  });
  it("7..8 -> ÇOK_ÖNEMLİ", () => {
    expect(scoreToLabel(7)).toBe("ÇOK_ÖNEMLİ");
    expect(scoreToLabel(8)).toBe("ÇOK_ÖNEMLİ");
  });
  it("9..10 -> KRİTİK", () => {
    expect(scoreToLabel(9)).toBe("KRİTİK");
    expect(scoreToLabel(10)).toBe("KRİTİK");
  });
});

describe("adjustImportance", () => {
  it("isLate +1, hasPdfText +0.5, üst sınır 10", () => {
    expect(adjustImportance(9, { isLate: true, hasPdfText: true })).toBe(10);
    expect(adjustImportance(5, { isLate: true })).toBe(6);
    expect(adjustImportance(5, { hasPdfText: true })).toBe(5.5);
    expect(adjustImportance(1, {})).toBe(1);
  });
});

describe("classify — belirli konular", () => {
  it("FR + Finansal Rapor -> FINANCIAL_REPORT, skor 7", () => {
    const r = classify({
      disclosureClass: "FR",
      subject: "Finansal Rapor",
    });
    expect(r.category).toBe("FINANCIAL_REPORT");
    expect(r.importanceScore).toBe(7);
    expect(r.timeHorizon).toBe("SHORT");
    expect(r.needsReview).toBe(false);
  });

  it("Temettü -> DIVIDEND", () => {
    expect(classify({ subject: "Kâr Payı Dağıtım Kararı" }).category).toBe("DIVIDEND");
  });

  it("Sermaye artırımı -> CAPITAL_INCREASE, skor 9", () => {
    const r = classify({ subject: "Bedelli Sermaye Artırımı" });
    expect(r.category).toBe("CAPITAL_INCREASE");
    expect(r.importanceScore).toBe(9);
  });

  it("Genel kurul -> GENERAL_MEETING", () => {
    expect(classify({ subject: "Genel Kurul Toplantısı Gündemi" }).category).toBe("GENERAL_MEETING");
  });

  it("ODA class fallback -> SPECIAL_EVENT", () => {
    const r = classify({ disclosureClass: "ODA", subject: "Özel Durum Açıklaması (Genel)" });
    expect(r.category).toBe("SPECIAL_EVENT");
  });

  it("Devre kesici (DKB) -> SPECIAL_EVENT, skor 6", () => {
    const r = classify({ disclosureClass: "DKB", subject: "Pay Bazında Devre Kesici Bildirimi" });
    expect(r.category).toBe("SPECIAL_EVENT");
    expect(r.importanceScore).toBe(6);
    expect(r.needsReview).toBe(false);
  });

  it("BIST100 eşiği: skor>=5 (W3 adayı)", () => {
    const r = classify({ subject: "Finansal Rapor" });
    expect(r.importanceScore).toBe(7);
    expect(r.scoreLabel).toBe("ÇOK_ÖNEMLİ");
  });
});

describe("classify — fallback", () => {
  it("eşleşme yok -> UNKNOWN, skor 3, needs_review", () => {
    const r = classify({ subject: "XYZ Ltd. Şti. bülten" });
    expect(r.category).toBe("UNKNOWN");
    expect(r.importanceScore).toBe(3);
    expect(r.needsReview).toBe(true);
  });

  it("deterministik: aynı girdi -> aynı çıktı", () => {
    const a = classify({ subject: "Bedelli Sermaye Artırımı", isLate: true });
    const b = classify({ subject: "Bedelli Sermaye Artırımı", isLate: true });
    expect(a).toEqual(b);
  });
});

describe("kategori etiketleri", () => {
  it("tüm kategorilerin Türkçe etiketi var", () => {
    expect(CATEGORY_LABELS.UNKNOWN).toBe("Belirsiz");
    expect(CATEGORY_LABELS.FINANCIAL_REPORT).toBe("Finansal Rapor");
  });
});