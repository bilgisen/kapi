# S1 — W1 Fetch Servisi (kapi-fetch, Python FastAPI @ FastAPICloud)

- Durum: başlamadı
- Bağımlılık: S0
- Repo: kap (apps/fetch)

## 1. Amaç
KAP kaynağından (A/B sonucuna göre public JSON ve/veya MKK VYK) bildirimleri çeken, BIST 100'e filtreleyen, gerektiğinde PDF indirip parse eden ve D1'e (kapi-db) yazan backend servisini yazmak.

## 2. Kapsam Dışı
- Sınıflandırma / skorlama (S2 — ayrı worker)
- AI analiz (S3)
- Hono / frontend entegrasyonu (S4-S5)

## 3. Fazlar

### Faz 1 — KAP client katmanı
- `kap_client.py`: liste/detay çağrıları (public API) + `mkk_vyk_client.py` referansı (oldfiles'tan uyarla, VY olursa).
- Oturum warmup, rate-limit, timeout (KAP WAF: 666).
- Doğrulama: 30dk pencere sorgusu çalışıyor.

### Faz 2 — BIST 100 üyelik listesi
- XU100 üyelik listesini KAP endeks sorgusundan veya Hono index-constituents verisinden al, `bist100_members` tablosuna yaz.
- Aylık/çeyrek tazeleme görevi.
- Doğrulama: 100 civarı kod, örnek AEBES/BIMAS üyeliği mevcut.

### Faz 3 — D1 şema + yazma katmanı
- Schemas: kap_notifications, kap_analysis, notification_companies, kap_sync_state, bist100_members (benzer Claude önerisi).
- Python -> Cloudflare D1 HTTP API yazma katmanı (batch UPSERT, idempotent dokunma).
- Doğrulama: bir satır yazıldı, tekrar çalışınca dup yok.

### Faz 4 — Polling orkestrasyonu
- Pazar saati (TR): 3 dk aralık, 30 dk pencere; dışı: 15 dk / 60 dk.
- APScheduler / process loop; tek instance garantisi (lock).
- Doğrulama: log kayıtları, false positive yok.

### Faz 5 — PDF pipeline
- file/download {objId} -> Java byte[] wrapper çöz (offset 27, struct) -> pdfminer.six cp1252 -> metin (ilk 8K)
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
- [ ] S1-1 KAP client + VYK client (referans uyarlama)
- [ ] S1-2 BIST100 üyelik haritası + bist100_members
- [ ] S1-3 D1 şema + Python->D1 HTTP API katmanı
- [ ] S1-4 Polling orkestrasyonu (pazar saatleri, lock)
- [ ] S1-5 PDF pipeline (java wrapper, cp1252, truncate)
- [ ] S1-6 Duplicate / düzeltme işleme
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