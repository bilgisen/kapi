import { describe, expect, it } from "vitest";
import { classify, computeLayer, countEscalationHits } from "../src/rules";

describe("computeLayer — S10 hibrit eşik", () => {
  it("eskalasyon kelimesi düşük skorda bile K3 verir", () => {
    const c = classify({ subject: "Yönetim kurulu istifa bildirimi", title: "", summary: "" });
    const layer = computeLayer(
      { subject: "Yönetim kurulu istifa bildirimi", title: "", summary: "" },
      c
    );
    expect(layer).toBe(3);
  });

  it("skor >= 8 -> K3", () => {
    const c = classify({
      subject: "Sermaye artırımı",
      title: "Bedelli sermaye artırımı",
      summary: "",
    });
    expect(c.importanceScore).toBeGreaterThanOrEqual(8);
    expect(computeLayer({ subject: "Sermaye artırımı", title: "", summary: "" }, c)).toBe(3);
  });

  it("finansal rapor -> kategori zorunlu K2", () => {
    const c = classify({ subject: "Finansal Rapor", title: "", summary: "" });
    expect(computeLayer({ subject: "Finansal Rapor", title: "", summary: "" }, c)).toBe(2);
  });

  it("kredi notu kategorisi -> zorunlu K3", () => {
    const c = classify({ subject: "Kredi notu düşürüldü", title: "", summary: "" });
    const layer = computeLayer({ subject: "Kredi notu düşürüldü", title: "", summary: "" }, c);
    expect(layer).toBe(3);
  });

  it("rutin düşük skor -> K2", () => {
    const c = classify({ subject: "Sorumluluk beyanı", title: "", summary: "" });
    expect(computeLayer({ subject: "Sorumluluk beyanı", title: "", summary: "" }, c)).toBe(2);
  });

  it("escalation hit sayısı doğru sayar", () => {
    expect(
      countEscalationHits({
        subject: "Kayyum ataması ve haciz bildirimi",
        title: "",
        summary: "",
      })
    ).toBeGreaterThanOrEqual(2);
  });
});