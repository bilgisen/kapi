# N3 — Kanal Genişletme: Web Push + Email

- Durum: **AKTİF (2026-08-15, kullanıcı onayıyla erken başlatıldı — şart ≥100 tık gevşetildi)**
- Bağımlılık: N2 (in-app çekirdek canlı), S14 push taslağı devralındı
- Repo: hono + tanstack

## 1. Amaç
In-app bildirimlerin dış kanala taşınması: **Web Push (VAPID)** birinci kanal. Email ikincil — N3 sonunda veriyle karar verilir.

## 2. Kararlar
- Kanal önceliği: Web Push → (Email değerlendirilecek)
- Abonelik üyelikle birleşik: push_subs user_id'ye bağlı (anonim push yok)
- Tercih: push_subs kaydının varlığı = push açık (basit tut); in-app her zaman
- Push eşiği: başlangıçta in-app ile aynı (takip skor≥5, BIST100 skor≥8); okunma verisi geldikçe kalibre edilir

## 3. Fazlar

### Faz 1 — Altyapı (hono)
- VAPID P-256 anahtar çifti (Workers WebCrypto ile üretildi) → secret'lar VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY
- `push_subs` tablosu (jetmain): user_id, endpoint, keys(p256dh, auth), created_at
- `GET /api/user/push/public-key` (auth'suz), `POST /api/user/push/subscribe` (auth'lu), `POST /api/user/push/unsubscribe` (auth'lu)

### Faz 2 — Gönderim (hono)
- web-push entegrasyonu (nodejs_compat): syncKapNotifications'ta in-app insert sonrası push
- Push tıklaması → `/kap-bildirimleri/$disclosureId` (notification data'da link)

### Faz 3 — İstemci (tanstack)
- `public/sw.js`: push event → notification göster, tıklama → link'e git
- Zil dropdown'ında/`/bildirimlerim`'de "Tarayıcı Bildirimleri" aç/kapa (subscribe/unsubscribe + kayıt)
- İzin isteme akışı: kullanıcı tercihi açınca Notification.requestPermission

### Faz 4 — Email (değerlendirme)
- N2 verisiyle (okunma raporu) karar: günlük özet email'i vs anlık — ŞU AN YAPILMAZ

## 4. Görev Listesi
- [ ] N3-1 VAPID anahtar üretimi + secret + public-key endpoint TAMAM (VAPID uretildi + secret'lara eklendi; deploy 28fb3249)
- [ ] N3-2 push_subs tablosu + subscribe/unsubscribe endpoints TAMAM (push_subs jetmain'de; subscribe/unsubscribe/status/public-key)
- [ ] N3-3 web-push gönderim entegrasyonu (motor) TAMAM (syncKapNotifications'a push gonderimi eklendi; 404/410 temizligi)
- [ ] N3-4 TanStack sw.js + izin akışı + tercih UI TAMAM (public/sw.js + usePushNotifications + /bildirimlerim tercih karti; deploy 41e71dca)
- [ ] N3-5 deploy + test push doğrulama + commit BEKLIYOR (tarayici testi: izin + abonelik + gercek bildirim - kullanici da)

## 5. Kabul Kriterleri
- [ ] Üye tarayıcıda push izni verince /bildirimlerim'de "açık" görünür
- [ ] Takip hissesinde yeni skor≥5 bildirim → tarayıcı push bildirimi gelir (tarayıcı kapalıyken bile)
- [ ] Push tıklaması KAP detayını açar
- [ ] Kapatınca push durur (in-app devam)
- [ ] Anonim kullanıcı push açamaz