/**
 * S9-1: Şablon kalıpları (K1) — LLM'siz özet üretimi.
 *
 * Yapı: her kalıp `match` (normalize subject/title/summary'de aranan kalıplar)
 * + `patterns` (named-capture regex'ler: tutar/tarih/oran) + `render` (summary_tr
 * ve impact_analysis şablonları). Deterministik, maliyetsiz.
 *
 * Sıralama önemli: aynı bildirim birden çok kalıba uyabilir — motor İLK eşleşmeyi
 * kullanır (templates[] dizisinin sırası önceliği belirler).
 */

export interface TemplateMatch {
  /** normalizasyon sonrası aranacak anahtar kelimeler (veya kalıplar) */
  keys: string[];
  /** sayı/tarih çıkarımı için named-capture regex'ler (normalize metinde aranır) */
  patterns?: RegExp[];
}

export interface TemplateDef {
  id: string;
  category: string;
  /** Türkçe şablon: {field} yer tutucuları patterns'ten gelen capture'lar */
  render: (fields: Record<string, string>) => { summary_tr: string; impact_analysis: string };
  match: TemplateMatch;
}

const TL = "TL|₺|try|tl";

/** Tutar yakalama: 123.456.789 TL / 1,5 milyar TL / %12,5 */
const AMOUNT = new RegExp(`(\\d[\\d.,]*\\s*(?:milyar|milyon|bin)?)\\s*(${TL})`, "i");
const PERCENT = new RegExp("(%|yüzde)\\s*(\\d+(?:[.,]\\d+)?)", "i");
const DATE = new RegExp("(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})", "");
const SHARE = new RegExp("(\\d+(?:[.,]\\d+)?)\\s*(?:adet|pay)", "i");

const f = (fields: Record<string, string>, key: string, fallback = "—") =>
  fields[key]?.trim() ? fields[key].trim() : fallback;

export const TEMPLATES: TemplateDef[] = [
  // --- Pay geri alımı (SHARE_BUYBACK) ---
  {
    id: "buyback",
    category: "SHARE_BUYBACK",
    match: {
      keys: ["pay geri alım", "geri alım", "geri alinim", "buyback", "pay geri alinim"],
      patterns: [SHARE, AMOUNT],
    },
    render: (fields) => ({
      summary_tr: `Şirket, kendi paylarını geri alım programı kapsamında ${f(fields, "m1", "bildirilen tutarda")} işlemi gerçekleştirdi.`,
      impact_analysis: `Geri alım genellikle hisse fiyatına destek sinyali olarak yorumlanır; programın kapsamı ve süresi yakından takip edilmeli.`,
    }),
  },
  // --- Temettü / kar payı (DIVIDEND) ---
  {
    id: "dividend",
    category: "DIVIDEND",
    match: {
      keys: ["temettü", "temettu", "kar payı", "kar payi", "kâr payı", "dividend", "kar payi avansi"],
      patterns: [AMOUNT, PERCENT, DATE],
    },
    render: (fields) => ({
      summary_tr: `Şirket, ${f(fields, "m1", "belirlenen tutarda")} temettü dağıtımına karar verdi.`,
      impact_analysis: `Temettü duyurusu yatırımcılar için olumlu bir gelir sinyalidir; ödeme tarihi ve hak kazanım takvimi önemlidir.`,
    }),
  },
  // --- Genel kurul çağrısı (GENERAL_MEETING) ---
  {
    id: "general-meeting",
    category: "GENERAL_MEETING",
    match: {
      keys: ["genel kurul", "genel kurulu", "olağan genel kurul", "oagk", "ogk", "genel kurul toplantı"],
      patterns: [DATE],
    },
    render: (fields) => ({
      summary_tr: `Şirket, genel kurul toplantısını ${f(fields, "m1", "belirlenen tarihte")} gerçekleştireceğini duyurdu.`,
      impact_analysis: `Genel kurul toplantısı, temettü ve yönetim değişiklikleri gibi kararların onaylanacağı önemli bir kurumsal etkinliktir.`,
    }),
  },
  // --- İmtiyazlı pay bildirimi ---
  {
    id: "privileged-share",
    category: "MAJOR_SHAREHOLDER",
    match: {
      keys: ["imtiyazlı pay", "imtiyazli pay", "oy hakkı", "imtiyaz"],
      patterns: [SHARE, PERCENT],
    },
    render: (fields) => ({
      summary_tr: `Şirket, imtiyazlı pay sahiplerine ilişkin bilgilendirme yaptı.`,
      impact_analysis: `İmtiyazlı pay yapısındaki değişiklikler yönetim kontrolü üzerinde etkili olabilir; detaylar incelenmeli.`,
    }),
  },
  // --- Kayıtlı sermaye tavanı ---
  {
    id: "registered-capital",
    category: "CAPITAL_INCREASE",
    match: {
      keys: ["kayıtlı sermaye", "kayitli sermaye", "sermaye tavanı", "sermaye tavani"],
      patterns: [AMOUNT],
    },
    render: (fields) => ({
      summary_tr: `Şirket, kayıtlı sermaye tavanını ${f(fields, "m1", "belirlenen tutara")} yükseltmek için SPK onayına başvurdu.`,
      impact_analysis: `Kayıtlı sermaye tavanının artırılması, ileride sermaye artırımı yapılmasına olanak tanır; kısa vadede doğrudan fiyat etkisi beklenmez.`,
    }),
  },
  // --- Kredi / borçlanma ---
  {
    id: "credit",
    category: "BOND_ISSUE",
    match: {
      keys: ["kredi", "kredi anlaşması", "borçlanma", "finansman", "kredi sözleşmesi"],
      patterns: [AMOUNT, PERCENT],
    },
    render: (fields) => ({
      summary_tr: `Şirket, ${f(fields, "m1", "belirlenen tutarda")} kredi/borçlanma anlaşması yaptı.`,
      impact_analysis: `Yeni borçlanma, şirketin finansman ihtiyacını ve faiz maliyetini artırır; kaldıraç oranı üzerindeki etkisi izlenmeli.`,
    }),
  },
  // --- Görev değişikliği (BOARD_DECISION) ---
  {
    id: "appointment",
    category: "BOARD_DECISION",
    match: {
      keys: ["görev değişikliği", "gorev degisikligi", "atama", "istifa", "yönetim kurulu üyesi", "genel müdür", "görevden ayrılma"],
      patterns: [DATE],
    },
    render: (fields) => ({
      summary_tr: `Şirkette üst düzey görev değişikliği yaşandı (${f(fields, "m1", "tarih")}).`,
      impact_analysis: `Üst yönetim değişiklikleri şirket yönetim kalitesi algısını etkileyebilir; özellikle CEO/CFO seviyesindeki değişimler önemlidir.`,
    }),
  },
  // --- Şube / mağaza açılışı ---
  {
    id: "branch-opening",
    category: "PRODUCTION_SALES",
    match: {
      keys: ["şube", "sube", "mağaza", "magaza", "mağazasını", "açılış", "acilis"],
      patterns: [AMOUNT],
    },
    render: (fields) => ({
      summary_tr: `Şirket yeni bir şube/mağaza açılışı gerçekleştirdi.`,
      impact_analysis: `Operasyonel genişleme, şirketin büyüme stratejisinin bir parçasıdır; satışlara katkısı ilerleyen dönemlerde ölçülür.`,
    }),
  },
  // --- SPK onayı / başvuru (CORRECTION/ROUTINE olmayan) ---
  {
    id: "spk-approval",
    category: "SPECIAL_EVENT",
    match: {
      keys: ["spk", "sermaye piyasası kurulu", "kayıt onayı", "başvuru onayı", "spk onayı"],
      patterns: [DATE, AMOUNT],
    },
    render: (fields) => ({
      summary_tr: `SPK, şirketin ${f(fields, "m1", "ilgili")} başvurusunu onayladı.`,
      impact_analysis: `SPK onayı, sermaye artırımı veya benzeri kurumsal işlemlerin önünü açar; sürecin tamamlanması hisse fiyatında hareketlilik yaratabilir.`,
    }),
  },
  // --- Finansal rapor (FINANCIAL_REPORT) ---
  {
    id: "financial-report",
    category: "FINANCIAL_REPORT",
    match: {
      keys: ["finansal rapor", "mali tablo", "dönem karı", "dönem kari", "gelir tablosu", "faaliyet raporu"],
      patterns: [AMOUNT, PERCENT],
    },
    render: (fields) => ({
      summary_tr: `Şirket, dönem finansal raporunu yayınladı (${f(fields, "m1", "belirtilen")}).`,
      impact_analysis: `Finansal rapor, şirketin kârlılığı ve büyümesi hakkında en kritik veriyi sunar; beklentilere göre fiyat hareketi yaratabilir.`,
    }),
  },
];