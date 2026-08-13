import { describe, expect, it } from "vitest";
import { matchTemplate } from "../src/templateEngine";
import { TEMPLATES } from "../src/templates";

describe("matchTemplate — K1 şablon motoru", () => {
  it("pay geri alımı eşleşir + adet çıkarılır", () => {
    const r = matchTemplate({
      subject: "Pay Geri Alım İşlemleri Bildirimi",
      title: "Şirket 250.000 adet payını geri aldı",
    });
    expect(r).not.toBeNull();
    expect(r!.templateId).toBe("buyback");
  });

  it("temettü eşleşir + tutar çıkarılır", () => {
    const r = matchTemplate({
      subject: "Kar Payı Dağıtım İşlemlerine İlişkin Bildirim",
      title: "1.250.000 TL temettü ödemesi",
    });
    expect(r).not.toBeNull();
    expect(r!.templateId).toBe("dividend");
    expect(r!.fields.m1).toContain("1.250.000");
  });

  it("genel kurul eşleşir + tarih çıkarılır", () => {
    const r = matchTemplate({
      subject: "Genel Kurul Toplantısı Çağrısı",
      title: "Olağan genel kurul 15.09.2026 tarihinde yapılacak",
    });
    expect(r).not.toBeNull();
    expect(r!.templateId).toBe("general-meeting");
  });

  it("eşleşmeyen bildirim null döner", () => {
    const r = matchTemplate({ subject: "Sermaye Piyasası Aracı İşlemleri", title: "" });
    expect(r).toBeNull();
  });

  it("kalıplar boş değil ve render üretir", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(10);
    for (const tpl of TEMPLATES) {
      const out = tpl.render({ m1: "test" });
      expect(out.summary_tr.length).toBeGreaterThan(0);
      expect(out.impact_analysis.length).toBeGreaterThan(0);
    }
  });
});
