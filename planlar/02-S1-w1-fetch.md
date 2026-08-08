# S1 — W1 Fetch Servisi (kapi-fetch, Python FastAPI @ FastAPICloud)

- Durum: başlamadı
- Bağımlılık: S0
- Repo: kap (apps/fetch)

## 1. Amaç
KAP kaynağından (A/B sonucuna göre public JSON ve/veya MKK VYK) **tüm piyasa bildirimlerini** çeken, XU100 üyelerini etiketleyen (BIST100), gerektiğinde PDF indirip parse eden ve D1'e (kapi-db) yazan backend servisini yazmak.

## 2. Kapsam Dışı
- Sınıflandırma / skorlama (S2 — ayrı worker)
- AI analiz (S3)
- Hono / frontend entegrasyonu (S4-S5)

## 3. Fazlar

### Faz 1 — KAP client katmanı
- `kap_client.py`: liste/detay çağrıları (public API) + `mkk_vyk_client.py` referansı (oldfiles'tan uyarla, VY olursa).
- **Tüm piyasa çekimi**: `byCriteria` gövdesinde `mkkMemberOidList: []` (FFFF) — BIST100 OID filtrelemesi YOK (K2 revizyonu).
- Pencere: 1-2 gün (2000 kayıt tavanı; spike: 614/gün) — pazar saatinde 3dk / dışı 15dk tekrar.
- Oturum warmup, rate-limit, timeout (KAP WAF: 666).
- Doğrulama: 2 günlük pencere sorgusu çalışıyor, kayıt sayısı < 2000.

### Faz 2 — XU100 etiketleme listesi
- XU100 üyelik listesi (KAP endeks excel veya Hono index-constituents) `bist100_members` tablosuna yazılır — **fetch filtresi değil, etiket** (kap_notifications.is_bist100).
- Aylık/çeyrek tazeleme görevi.
- Doğrulama: 100 civarı kod; AEBES/BIMAS üyeliği mevcut; bildirim yazımında bayrak doğru set ediliyor.

### Faz 3 — D1 şema + yazma katmanı
- Schemas: kap_notifications (is_bist100 bayrağı dahil), kap_analysis, notification_companies, kap_sync_state, bist100_members (benzer Claude önerisi).
- Python -> Cloudflare D1 HTTP API yazma katmanı (batch UPSERT, idempotent dokunma; OAuth access+refresh token auto-renew, client_id 54d11594-...).
- Doğrulama: bir satır yazıldı, tekrar çalışınca dup yok.

### Faz 4 — Polling orkestrasyonu
- Pazar saati (TR): 3 dk aralık, 30 dk pencere; dışı: 15 dk / 60 dk.
- APScheduler / process loop; tek instance garantisi (lock).
- Doğrulama: log kayıtları, false positive yok.

### Faz 5 — PDF pipeline
- İndirme: önce temiz `/en/api/BildirimPdf/{index}` (spike 1.4 — wrapper yok); başarısızsa `/file/download/{objId}` Java byte[] wrapper (offset 27) -> pdfminer.six cp1252 -> metin (ilk 8K).
- Sadece yüksek öncelikli konular için PDF çek (Temettü, Finansal Rapor, Özel Durum, Sermaye Artırımı, Birleşme, Genel Kurul, DKB).
- Doğrulama: 2-3 örnek PDF'ten ekstrakte edilebilen metin.

### Faz 6 — Tekil/dup/düzeltme yönetimi
- disclosure_index UNIQUE; isChanged / relatedDisclosure varsa orijinale bağla, is_late flag.
- Doğrulama: aynı bildirimin iki kez gelmesi ikinci kez yazmaz.

### Faz 7 — Deploy (FastAPICloud) + health
- FastAPI uygulaması, /health, /api/cron/refresh, /sync-state endpointleri.
- migrate şema (D1 HTTP), env (secrets), error loglar.
- Doğrulama: remote health OK, log rotasyonu.

## 4. Görev Listesi
- [x] S1-1 KAP client (tüm piyasa list/detay/PDF) + VYK client (referans uyarlama)
- [x] S1-2 XU100 etiketleme haritası + bist100_members (etiket amaçlı)
- [x] S1-3 D1 şema + Python->D1 HTTP API katmanı (OAuth refresh; canlı doğrulandı: 14/14 yazıldı, idempotent, UTC dönüşümü)
- [x] S1-4 Polling orkestrasyonu (pazar saatleri 3dk/15dk, O_EXCL lock + stale, backoff)
- [x] S1-5 PDF pipeline (BildirimPdf temiz yol + file/download wrapper offset 27; lokalde CRFA örneklerden 24.8K/112.8K karakter doğrulandı)
- [x] S1-6 Duplicate / düzeltme işleme (disclosure_index UNIQUE idempotent; detay çekimi yalnız yeni kayıtlarda — disclosure_body işaretçisi; mkk_member_oid 14/14 doğrulandı)
- [ ] S1-7 FastAPICloud deploy + health/log
- [ ] S1-8 Requirements + Dockerfile + CI taslağı

## 5. Kararlar
- K1 bu planda kesinleşir (A/B raporu S0-4'ten).
- PDF çekme matrisi: Claude notundaki tablo temel alınacak.

## 6. Kabul Kriterleri
- [ ] Yeni bildirimler D1'e otomatik yazılıyor
- [ ] PDF'li bildirimlerde pdf_text dolu, olmayanlarda null
- [ ] BIST 100 dışı bildirimler eleniyor
- [ ] Sağlık endpoint'i ve cron dışı tetikleme çalışıyor