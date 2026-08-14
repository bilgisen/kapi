# N3 — Kanal Genişletme: Web Push + Email (TASLAK)

- Durum: taslak (2026-08-14) — N2 sonrası uygulanır
- Bağımlılık: N2 (in-app çekirdek), S14 push taslağı (planlar/15-S14-anonim-web-push-taslak.md)
- Repo: hono + tanstack

## 1. Amaç
In-app bildirimlerin dış kanallara taşınması: Web Push (VAPID, üyelikle birleşik — abonelik user_id'ye bağlanır) + email (opsiyonel). Kullanıcı tercih merkezi.

## 2. Kapsam
- `push_subs` tablosu (user_id, endpoint, keys, created_at); VAPID anahtarları (Workers WebCrypto)
- KAP eşleştirme motoru → kanal dağıtımı (in-app zorunlu, push/email tercihe bağlı)
- `user_notification_prefs`: kanal aç/kapa + skor eşiği
- Email: Resend benzeri servis; ani + günlük özet seçeneği
- Tıklama analizi: push tıklaması → detay (mevcut clicks altyapısı genişletilir)

## 3. Açık Sorular (N2 verisiyle)
- Hangi eşik push'lanmalı (okunma raporu karar verir)
- Günlük push limiti (kullanıcı başına)
- Sessiz saatler

## 4. Başlama Şartı
N2 canlı + okunma raporunda ≥100 tıklama verisi