import { describe, expect, it } from "vitest";
import {
  selectDaily,
  buildDailyPrompt,
  validateDaily,
  type DailyItemInput,
} from "../src/daily";

function mk(partial: Partial<DailyItemInput>): DailyItemInput {
  return {
    disclosureIndex: "i1",
    tickers: [],
    companyTitle: "Şirket",
    subject: "Bildirim",
    score: 5,
    category: "SPECIAL_EVENT",
    summaryTr: "özet",
    publishDate: "2026-08-14T10:00:00Z",
    isBist100: false,
    ...partial,
  };
}

describe("selectDaily — deterministik seçim", () => {
  const items = [
    mk({ disclosureIndex: "a", score: 9, tickers: ["THYAO"] }),
    mk({ disclosureIndex: "b", score: 7, tickers: ["ASELS"] }),
    mk({ disclosureIndex: "c", score: 6, tickers: ["GARAN"] }),
    mk({ disclosureIndex: "d", score: 5, tickers: ["SISE"] }),
    mk({ disclosureIndex: "e", score: 5, publishDate: "2026-08-14T09:00:00Z" }),
    mk({ disclosureIndex: "f", score: 4, tickers: ["KCHOL"] }),
    mk({ disclosureIndex: "g", score: 4 }),
    mk({ disclosureIndex: "h", score: 3 }),
    mk({ disclosureIndex: "i", score: 2 }),
    mk({ disclosureIndex: "j", score: 8 }),
  ];

  it("skor DESC sıralar, headline 5, overlooked 5", () => {
    const { headline, overlooked } = selectDaily(items);
    expect(headline.map((h) => h.disclosureIndex)).toEqual(["a", "j", "b", "c", "d"]);
    expect(overlooked.length).toBe(5);
    expect(overlooked.every((o) => o.score <= 5)).toBe(true);
  });

  it("skor>=7 her zaman headline'a girer (küçük listede)", () => {
    const small = items.slice(0, 3);
    const { headline, overlooked } = selectDaily(small);
    expect(headline.map((h) => h.disclosureIndex)).toEqual(["a", "b", "c"]);
    expect(overlooked.length).toBe(0);
  });

  it("boş liste güvenli", () => {
    expect(selectDaily([])).toEqual({ headline: [], overlooked: [] });
  });
});

describe("buildDailyPrompt — damıtılmış girdi", () => {
  it("one-liner liste üretir", () => {
    const p = buildDailyPrompt("2026-08-14", [mk({ tickers: ["THYAO"], score: 9 })], []);
    expect(p).toContain("2026-08-14");
    expect(p).toContain("[THYAO]");
    expect(p).toContain("9/10");
  });
});

describe("validateDaily", () => {
  it("geçerli şemayı kabul eder", () => {
    const out = validateDaily({
      date: "2026-08-14",
      headline: "Gün olumlu",
      items: [
        { ticker: "THYAO", neOldu: "X", nedenOnemli: "Y", yon: "olumlu" },
      ],
      overlooked: ["[SISE] özet"],
    });
    expect(out.items.length).toBe(1);
  });
  it("bozuk item reddedilir", () => {
    expect(() =>
      validateDaily({ date: "x", headline: "h", items: [{ ticker: 1 }], overlooked: [] })
    ).toThrow();
  });
});
