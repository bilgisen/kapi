# Spike Raporu: KAP API A/B Doğrulama (S0-4)

- Tarih: 2026-08-08
- Durum: tamamlandı
- Sonuç: **KAP Public JSON API kazanıyor** (K1 kesinleşti)

## 1. KAP Public JSON API (https://www.kap.org.tr)

### 1.1 Doğrulanan endpoint'ler

| Endpoint | Yöntem | Sonuç |
|---|---|---|
| `/tr/bildirim-sorgu` | GET | 200 (sayfa, 1.1MB) — WAF warmup için kullanılır |
| `/tr/api/disclosure/members/byCriteria` | POST | ✅ bildirim listesi (JSON, auth'suz) |
| `/tr/api/member/filter/{ticker}` | GET | ✅ `mkkMemberOid` + `permaLink` (örn. AKBNK) |
| `/tr/api/notification/attachment-detail/{disclosureIndex}` | GET | ✅ detay + disclosureBody HTML + attachments |
| `/en/api/BildirimPdf/{disclosureIndex}` | GET | ✅ **temiz PDF** (application/pdf, wrapper YOK — PDF 1.4, 805KB) |
| `/tr/api/file/download/{objId}` | GET | ✅ ham ek PDF (Java byte[] wrapper — offset 27'de `%PDF`) |
| `/tr/api/company/indices/excel` | GET | ✅ endeks Excel (95KB) — XU100 üye listesi kaynağı |

### 1.2 Bildirim listesi davranışı

- `POST /tr/api/disclosure/members/byCriteria` gövdesi:
  ```json
  { "fromDate": "2026-08-07", "toDate": "2026-08-07", "mkkMemberOidList": [], "subjectList": [], "disclosureType": [], "disclosure": "FFFF" }
  ```
- Tek gün: **614 bildirim**, 472'sinde `summary` dolu (%77) → **K4 (KAP özeti) çalışır**.
- Aktif maddeler: DG, FR, ODA, CA, DUY (türler "disclosureType" filter'ı istenilen gibi çalışmıyor — client tarafında filtreleme yapılacak).
- `mkkMemberOidList` filtreleme çalışıyor: AKBNK OID → 1 kayıt.
- **Limit doğrulandı**: 30 gün → tam 2000 kayıt döner (üst sınır). Pencere 30-60dk tutulur.
- Örnek öğe alanı: `publishDate, kapTitle, disclosureClass, disclosureType, disclosureCategory, summary, subject, disclosureIndex, isLate, stockCodes, attachmentCount, modifyStatus`.

### 1.3 Detay endpoint'i (attachment-detail)

- İçerir: `disclosureBasic` (disclosureId, disclosureIndex, mkkMemberOid, isLate, isChanged, relatedDisclosureOid, publishDate), `disclosureBody` (HTML), `attachments` (objId + fileName + extension).
- Örnek: 1645913 (CRFSA Finansal Rapor) → 1 ek: `CSA SPK 30.06.2026.pdf`, objId `4028328d...`.
- **Warning**: `attachmentCount` herkese ve bazı bildirimlerde ek yok ama body dolu — ai özeti için disclosureBody HTML de kullanılabilir.

### 1.4 PDF indirme — iki yol

1. `/en/api/BildirimPdf/{index}` → **direkt temiz PDF** (KAP'ın ürettiği/özet PDF). En kolay, wrapper yok.
2. `/tr/api/file/download/{objId}` → Java serialized byte[] (`AC ED 00 05 75 72 ... 78 70 <be4B length>`) PDF offset 27'de başlar (Claude notunun 27 notu doğru). curl ile 1.29MB / 0.9s indirildi.

Öneri: **W1 önce BildirimPdf dener** (temiz, hızlı); başarısızsa file/download + wrapper ayrıştırma akışı kullanılır.

### 1.5 XU100 üye listesi

- KAP'ta `/api/endeks/XU100/members`- benzeri endpoint **yok** (404).
- Mevcut kaynaklar: (a) KAP `company/indices/excel` (95KB xlsx — endeks listesi, indirildi `docs/spike_endeksler.xlsx`); (b) Hono `src/lib/index-constituents.json` (XU100 hazır ~100 üye).
- Karar: XU100 listesi için birincil kaynak Hono index-constituents veya KAP excel; ileride çeyreklere tazeleme cron'u.

### 1.6 Kodlama

- JSON yanıtları UTF-8 ama bazı alanları ISO-8859-9/Windows-1254 biçimlerde (Türkçe karakterler) — client side decode gerekli olabilir.
- Terminal çıktısında `�` görülüyor — veri UTF-8 iken konsol codepage'i 1254/65001 değil. Python'da sorun olmaz (utf-8 bytes → str).

## 2. MKK VYK API (B kaynağı)

- URL (env'den): `https://apigwdev.mkk.com.tr/api/vyk?openapi=...` — bağlantı **gateway (apinizer)** üzerinden.
- Tüm istejilere auth'suz ve Basic auth'lu **hepsi OpenAPI spec** dönüyor (members → spec 60KB) — gerçek veri gateway'in izin vermediği görünüyor (produksyon hedefi / API anahtarı eksik).
- `api.mkk.com.tr` hostu DNS'te çözümlenmedi.
- Sonuç: **şu an MKK VYK çalıştırılamıyor** — production erişimi kurumsal/ücretli abonelik gerektirir. Eski investapi'nin `mkk_vyk_client.py`'si bu gateway'e bağlıydı ve aynı engeli yaşıyor (şu andaki aktif public KAP API yokken).

## 3. Karar (K1)

- **Kazanan: KAP Public JSON API** (auth'suz, özet alanı var, PDF iki yol, bilinen limit 2000).
- MKK VYK: opsiyonel fallback — API anahtarı sağlanırsa S1'de istemci uyarlanıp (oldfiles) devreye alınabilir.
- Detay: şirket bazlı filtreleme `mkkMemberOidList` ile (XU100 üyeleri listesinden OID'ler toplanır, pencere başına 1 istek).
- PDF: önce temiz BildirimPdf, kapalı ansa wrapper çöz.

## 4. Artifacts

- `docs/spike_bildirimpdf.pdf` (1645913, temiz PDF 805KB)
- `docs/spike_filedownload.bin` (Java wrapper bin, 1.29MB)
- `docs/spike_endeksler.xlsx` (KAP endeks Excel 95KB)