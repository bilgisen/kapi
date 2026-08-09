# S4 — Hono Entegrasyonu (orchestrator endpoint'leri)

- Durum: tamamlandı (S4-1..S4-6 canlı, S4-7 auth/CORS mevcut yapı + analiz limiti W3'te)
- Bağımlılık: S1-S3 (veri hazır), S6 kısmen bu plana dayanır
- Repo: hono (mevcut repo, değişiklik burada yapılır)

## 1. Amaç
Mevcut Hono orchestrator'a KAP bildirim endpoint'lerini eklemek: feed, şirket bazlı liste, detay (AI analiz + PDF link) ve chatbot context uçları. KV cache, auth tier ve mevcut katkı kalıpları (withCache, env helpers) kullanılır.

## 2. Kapsam Dışı
- A (yazma) — Hono read-only
- AI üretimi (S3'te)
- Chatbot UI (S6)

## 3. Fazlar

### Faz 1 — D1 kapi-db binding
- wrangler.jsonc'ye `KAPI_DB` (D1) binding ekle.
- env.js'ye `getKapiDb(env)` helper.
- Doğrulama: basit SELECT çalışıyor.

### Faz 2 — Feed endpoint
- `GET /api/notifications?importance=&category=&stock=&bist100=&page=`
  - Birleştir: kap_notifications + kap_analysis (SUMMARY, skor, etiket) — **tüm bildirimler** (K2), `is_bist100` filtre/rozet için.
  - Sayfalama: sayfa bazlı (spark, 20-50 item).
  - Sıralama: publish_date DESC, importance DESC.
- KV cache: pazar saatinde 5dk, dışı 30dk.
- Doğrulama: filtre ve sayfalama testleri.

### Faz 3 — Şirket endpoint'i
- `GET /api/notifications/:ticker`
- Şirket sayfası sekmesi için: son 30-90 gün bildirimleri + son finansal rapor öne çıkar (overview kart).
- Doğrulama: örnek ticker (YKBNK, THYAO) dolu sonuç.

### Faz 4 — Detay + on-demand AI endpoint'leri
- `GET /api/notifications/detail/:disclosureId`
  - AI analiz alanları, anahtar rakamlar, KAP orijinal linki (kap_link), düzeltme zinciri bilgisi.
- `POST /api/notifications/:disclosureId/analyze` (K11)
  - W3'e yönlendirir: analiz varsa KV cache döner, yoksa üretir; günlük limit (herkese açık).
- Doğrulama: disclosureId ile tam dolu yanıt; analyze ikinci kez cache döner.

### Faz 5 — Chatbot context endpoint'leri
- `GET /api/notifications/context/feed` — son 24sa önemli bildirimler (skor>=7).
- `GET /api/notifications/context/:ticker` — son 30 gün şirket bildirimleri + son finansal rapor.
- KV cache + auth (tier) + JetToken metering burada (opsiyonel S6).
- Doğrulama: context string'i örneklendi, Chatbot ön izleme.

## 4. Görev Listesi
- [x] S4-1 D1 binding + env helper
- [x] S4-2 GET /api/notifications (feed)
- [x] S4-3 GET /api/notifications/:ticker
- [x] S4-4 GET /api/notifications/detail/:disclosureId
- [x] S4-5 POST /api/notifications/:disclosureId/analyze (K11 — cache-first + limit; W3'e KAPI_AI service binding, fallback public fetch)
- [x] S4-6 context endpoint'leri (+ cache)
- [x] S4-7 CORS/auth güncellemesi + testler

## 5. Kararlar
- D1 binding adı: KAPI_DB.
- Endpoint kökü: /api/notifications (mevcut route'larla çakışma yok).

## 6. Kabul Kriterleri
- [ ] Feed ve şirket sorguları frontend'de görüntülenebiliyor
- [ ] Detay AI alanları + PDF linki dolu
- [ ] Chatbot context string'leri (30 gün / 24 saat) üretiliyor