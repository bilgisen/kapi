# S8 — Strateji-0: Operasyonel Sağlamlaştırma

- Durum: devam ediyor
- Bağımlılık: S7 (kısmen), S1-S3
- Repo: kap

## 1. Amaç
Veri akışının kesintisiz ve veri bütünlüğünün tam olması: backfill boşluğunu kapatmak, token kalıcılığını çözmek ve strateji fazlarının (S9+) gerçek veri üzerinde ölçülebilmesini sağlamak.

## 2. Kapsam Dışı
- Yeni özellikler (S9+)
- Frontend değişiklikleri

## 3. Fazlar

### Faz 1 — Backfill tamamlama
- 10-11.08 kalan ~1100 bildirimi çek (12-13.08 W1 ile tamamlandı: 459 kayıt, sync-state 2026-08-12..13, last_success 1)
- Detay çekimi (isChanged/disclosureBody/audit) — body dolu kayıtlar skip (idempotent)
- Doğrulama: kap_notifications ~1580 kayıt, min/max publish tarihi 10.08..13.08

### Faz 2 — Token kalıcılığı + cron izleme
- W1 env: D1_ACCESS_TOKEN = CF API Token (OAuth yerine; refresh token kaldırılır)
- kapi-cron (`*/10 * * * *`) elle tetik testi: POST /trigger?secret=...
- Doğrulama: 24 saat boyunca sync-state güncellenmeye devam ediyor

### Faz 3 — Veri kalitesi ölçümü
- pdf_text / disclosure_body / KAP summary kapsam oranları (D1 sorguları)
- Sonuç: S9 şablon motoru ve S10 PDF stratejisi için girdi

## 4. Görev Listesi
- [x] S8-0a W1 deploy + health OK (kapi-7d527e98.fastapicloud.dev — db: ok)
- [x] S8-0b kapi-cron worker deploy (https://kapi-cron.paraanaliz.workers.dev, */10)
- [x] S8-0c W2 /ingest tetik testi (200, 100 kayıt işlendi)
- [ ] S8-1 Backfill 10-11.08 (no-detail + detay ayrı koşu)
- [ ] S8-2 D1 sayım doğrulaması (~1580)
- [ ] S8-3 W1 env API token'a geçiş (dashboard, kullanıcı)
- [ ] S8-4 Veri kalitesi ölçüm raporu

## 5. Karar Kayıtları
- 2026-08-13 K13: W1 auth — CF API Token (OAuth token rotation env'de bayat bırakıyor; API token 401 üretmez, refresh gerekmez)

## 6. Doğrulama / Kabul Kriterleri
- [ ] kap_notifications: 10-13.08 penceresi tam (1580)
- [ ] sync-state last_success=1, updated_at bugün
- [ ] Kapsam oranları raporu: body %X, summary %Y, pdf %Z
