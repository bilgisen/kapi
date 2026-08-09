/**
 * S2-1/2: Taksonomi + kural motoru (saf TS, bağımlılıksız — testsiz çalıştırılabilir).
 *
 * Deterministik: aynı girdi → aynı çıktı. LLM yok, maliyetsiz.
 * Kategoriler: İngilizce key + Türkçe etiket (kararlar.md S2-karar-1).
 */

export type CategoryKey =
  | "FINANCIAL_REPORT"
  | "DIVIDEND"
  | "CAPITAL_INCREASE"
  | "CAPITAL_DECREASE"
  | "BOND_ISSUE"
  | "MERGER_ACQUISITION"
  | "SHARE_BUYBACK"
  | "OWNERSHIP_CHANGE"
  | "BOARD_DECISION"
  | "GENERAL_MEETING"
  | "SPECIAL_EVENT"
  | "INSIDER_TRADING"
  | "MAJOR_SHAREHOLDER"
  | "PRODUCTION_SALES"
  | "TENDER"
  | "LEGAL"
  | "CREDIT_RATING"
  | "AUDIT"
  | "CORRECTION"
  | "ROUTINE"
  | "UNKNOWN";

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  FINANCIAL_REPORT: "Finansal Rapor",
  DIVIDEND: "Temettü",
  CAPITAL_INCREASE: "Sermaye Artırımı",
  CAPITAL_DECREASE: "Sermaye Azaltımı",
  BOND_ISSUE: "Tahvil İhracı",
  MERGER_ACQUISITION: "Birleşme/Devralma",
  SHARE_BUYBACK: "Geri Alım",
  OWNERSHIP_CHANGE: "Ortaklık Değişikliği",
  BOARD_DECISION: "YK Kararı",
  GENERAL_MEETING: "Genel Kurul",
  SPECIAL_EVENT: "Özel Durum",
  INSIDER_TRADING: "Pay Alım Satım",
  MAJOR_SHAREHOLDER: "Büyük Ortaklık",
  PRODUCTION_SALES: "Üretim/Satış",
  TENDER: "İhale",
  LEGAL: "Hukuki",
  CREDIT_RATING: "Kredi Notu",
  AUDIT: "Denetim",
  CORRECTION: "Düzeltme",
  ROUTINE: "Rutin",
  UNKNOWN: "Belirsiz",
};

export type TimeHorizon = "SHORT" | "MEDIUM" | "LONG" | null;

export type ScoreLabel = "KRİTİK" | "ÇOK_ÖNEMLİ" | "ÖNEMLİ" | "RUTİN";

export interface Rule {
  category: CategoryKey;
  /** disclosure_class kodları (KAP: FR, DG, ODA, STT, ...) */
  classes?: string[];
  /** subject içinde aranan anahtar kelimeler (normalize edilmiş) */
  subjects?: string[];
  /** title/summary/body içinde aranan ek anahtar kelimeler */
  keywords?: string[];
  baseImportance: number;
  timeHorizon: TimeHorizon;
}

export interface NotificationInput {
  disclosureClass?: string | null;
  disclosureCategory?: string | null;
  subject?: string | null;
  title?: string | null;
  summary?: string | null;
  disclosureBody?: string | null;
  isLate?: boolean | number | null;
  hasPdfText?: boolean;
}

export interface Classification {
  category: CategoryKey;
  importanceScore: number;
  timeHorizon: TimeHorizon;
  scoreLabel: ScoreLabel;
  needsReview: boolean;
  matchedRule: string | null;
}

/** ASCII normalizasyon: küçük harf + aksan sökme + Türkçe karakter eşleme (keyword eşleşmesi için) */
export function normalize(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("ı", "i")
    .replaceAll("ş", "s")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/\s+/g, " ")
    .trim();
}

export const CLASSIFICATION_RULES: Rule[] = [
  // --- Finansal raporlar (FR class + subject) ---
  {
    category: "FINANCIAL_REPORT",
    classes: ["FR"],
    subjects: ["finansal rapor", "faaliyet raporu", "dönem kari", "mali tablo", "ozet gelir tablosu"],
    baseImportance: 7,
    timeHorizon: "SHORT",
  },
  // --- Temettü ---
  {
    category: "DIVIDEND",
    subjects: ["temettü", "kari payi", "kar payi", "dividend", "kar payi avansi"],
    keywords: ["kar payi dagitim", "temettu odenmesi"],
    baseImportance: 7,
    timeHorizon: "SHORT",
  },
  // --- Sermaye artırımı ---
  {
    category: "CAPITAL_INCREASE",
    subjects: ["sermaye artirimi", "bedelli", "ruçhan hakki", "tahsisli"],
    keywords: ["sermaye artirima iliskin"],
    baseImportance: 9,
    timeHorizon: "MEDIUM",
  },
  // --- Sermaye azaltımı ---
  {
    category: "CAPITAL_DECREASE",
    subjects: ["sermaye azaltimi", "pay itfa", "iştirak paylarinin itfasi"],
    baseImportance: 9,
    timeHorizon: "MEDIUM",
  },
  // --- Tahvil / borçlanma ---
  {
    category: "BOND_ISSUE",
    subjects: ["tahvil ihraci", "borçlanma aracı", "kira sertifikasi", "sukuk", "eurobond"],
    baseImportance: 6,
    timeHorizon: "MEDIUM",
  },
  // --- Birleşme/devralma ---
  {
    category: "MERGER_ACQUISITION",
    subjects: ["birlesme", "devralma", "bölünme", "ortak girisim", "hisse devri yoluyla"],
    keywords: ["birlesme sozlesmesi", "devir alinmasi"],
    baseImportance: 9,
    timeHorizon: "LONG",
  },
  // --- Geri alım (buyback) ---
  {
    category: "SHARE_BUYBACK",
    subjects: ["pay geri alim", "geri alim", "buyback"],
    keywords: ["geri alim programi", "pay alim programi"],
    baseImportance: 6,
    timeHorizon: "SHORT",
  },
  // --- Ortaklık değişikliği ---
  {
    category: "OWNERSHIP_CHANGE",
    subjects: ["ortaklik yapisi", "ortaklik payi", "hisse devri", "hissedarlik yapisimda degisiklik"],
    baseImportance: 6,
    timeHorizon: "SHORT",
  },
  // --- YK kararları ---
  {
    category: "BOARD_DECISION",
    subjects: ["yonetim kurulu karari", "yk karari", "yonetim kurulu"],
    baseImportance: 5,
    timeHorizon: "SHORT",
  },
  // --- Genel kurul ---
  {
    category: "GENERAL_MEETING",
    subjects: ["genel kurul", "genel kurul tarih", "genel kurul toplantisi", "gündem"],
    keywords: ["genel kurul karari", "genel kurula davet"],
    baseImportance: 5,
    timeHorizon: "MEDIUM",
  },
  // --- Özel durum açıklaması (genel) — ODA class ---
  {
    category: "SPECIAL_EVENT",
    classes: ["ODA"],
    subjects: ["ozel durum aciklamasi", "ozel durum", "kamuoyu bilgilendirme"],
    baseImportance: 4,
    timeHorizon: null,
  },
  // --- Devre kesici (DKB) — fiyat limit hareketi ---
  {
    category: "SPECIAL_EVENT",
    classes: ["DKB"],
    subjects: ["devre kesici"],
    baseImportance: 6,
    timeHorizon: "SHORT",
  },
  // --- Yönetici/insider pay alım satımı ---
  {
    category: "INSIDER_TRADING",
    subjects: ["pay alim satim bildirimi", "yoneticilerin pay islemleri", "insider", "mudurluklerin pay"],
    baseImportance: 6,
    timeHorizon: "SHORT",
  },
  // --- Büyük ortaklık (kontrol değişikliği) ---
  {
    category: "MAJOR_SHAREHOLDER",
    subjects: ["oy hakki", "sermayede oy hakki", "kontrol kaybi", "halka arz", "kontrolun devri"],
    baseImportance: 8,
    timeHorizon: "MEDIUM",
  },
  // --- Üretim/satış ---
  {
    category: "PRODUCTION_SALES",
    subjects: ["uretim", "satis", "kapasite", "maddi duran varlik satimi", "uretim ve satislar"],
    keywords: ["uretim rakami", "satis rakamlari", "uretim bandi"],
    baseImportance: 5,
    timeHorizon: "SHORT",
  },
  // --- İhale ---
  {
    category: "TENDER",
    subjects: ["ihale", "sozlesme imzalanmasi", "sozlesme duyurusu"],
    baseImportance: 5,
    timeHorizon: "SHORT",
  },
  // --- Hukuki ---
  {
    category: "LEGAL",
    subjects: ["dava", "mahkeme karari", "soruşturma", "ceza", "haciz", "açilan dava", "vergi incelemesi"],
    baseImportance: 7,
    timeHorizon: "MEDIUM",
  },
  // --- Kredi notu ---
  {
    category: "CREDIT_RATING",
    subjects: ["kredi notu", "rating", "derecelendirme", "kredi derecelendirme"],
    baseImportance: 7,
    timeHorizon: "MEDIUM",
  },
  // --- Denetim ---
  {
    category: "AUDIT",
    subjects: ["denetim", "bagimsiz denetim raporu", "denetci gorusu", "denetim komitesi"],
    baseImportance: 5,
    timeHorizon: "MEDIUM",
  },
  // --- Düzeltme ---
  {
    category: "CORRECTION",
    subjects: ["duzeltme", "düzeltme", "duzeltilmis", "izahname duzeltme"],
    baseImportance: 3,
    timeHorizon: null,
  },
  // --- Rutin (sorumluluk beyanı, genel duyurular) ---
  {
    category: "ROUTINE",
    subjects: ["sorumluluk beyani", "genel aciklama", "duzeltme talebi", "bilgi formu", "kayitli elektronik", "faaliyet raporu"],
    baseImportance: 2,
    timeHorizon: null,
  },
];

/** disclosure_class kodundan fallback kategori (subject eşleşmezse) */
function fromClass(code: string | null | undefined): CategoryKey | null {
  const c = (code ?? "").toUpperCase();
  if (c === "FR") return "FINANCIAL_REPORT";
  if (c === "ODA") return "SPECIAL_EVENT";
  return null;
}

function hasAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => n && haystack.includes(n));
}

/** Kural eşleştirme: sırasıyla subject → classes → keywords */
function matchRule(input: NotificationInput): Rule | null {
  const subject = normalize(input.subject);
  const bodyText = normalize(
    [input.title, input.summary, input.disclosureBody].filter(Boolean).join(" ")
  );
  for (const rule of CLASSIFICATION_RULES) {
    if (rule.subjects?.length && hasAny(subject, rule.subjects)) return rule;
    if (
      rule.classes?.length &&
      (rule.classes.includes((input.disclosureClass ?? "").toUpperCase()) ||
        rule.classes.includes((input.disclosureCategory ?? "").toUpperCase()))
    ) {
      return rule;
    }
    if (rule.keywords?.length && hasAny(bodyText, rule.keywords)) return rule;
  }
  return null;
}

export function scoreToLabel(score: number): ScoreLabel {
  if (score >= 9) return "KRİTİK";
  if (score >= 7) return "ÇOK_ÖNEMLİ";
  if (score >= 5) return "ÖNEMLİ";
  return "RUTİN";
}

/** Faz 2 — skor ayarlayıcılar: isLate +1, hasPdfText +0.5, üst sınır 10 */
export function adjustImportance(base: number, input: NotificationInput): number {
  let s = base;
  if (input.isLate) s += 1;
  if (input.hasPdfText) s += 0.5;
  return Math.min(10, Math.max(1, s));
}

export function classify(input: NotificationInput): Classification {
  const clsRule = fromClass(input.disclosureClass);
  const rule = matchRule(input) ?? (clsRule ? { category: clsRule, baseImportance: 5, timeHorizon: null } : null);

  if (!rule) {
    return {
      category: "UNKNOWN",
      importanceScore: adjustImportance(3, input),
      timeHorizon: null,
      scoreLabel: scoreToLabel(3),
      needsReview: true,
      matchedRule: null,
    };
  }

  const score = adjustImportance(rule.baseImportance, input);
  return {
    category: rule.category,
    importanceScore: score,
    timeHorizon: rule.timeHorizon,
    scoreLabel: scoreToLabel(score),
    needsReview: false,
    matchedRule: rule.category,
  };
}