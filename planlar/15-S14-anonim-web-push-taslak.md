# S14 — Strateji-6: Anonim Web Push (TASLAK — uygulanmadı)

- Durum: taslak (2026-08-14) — tıklama verisi 1-2 hafta biriktikten sonra uygulanacak
- Bağımlılık: S13 (ölçüm — push önceliği bu veriden belirlenir)
- Repo: hono + tanstack

## 1. Amaç
Kullanıcının cihazına anlık bildirim: takip listesindeki hissenin skor≥7 bildirimi gelince tarayıcı push'u. Hesap sistemi GEREKMEZ — Web Push (VAPID) tarayıcıda anonim abonelikle çalışır.

## 2. Kapsam Dışı
- Hesap sistemi / çoklu cihaz / e-posta (ayrı faz)
- Push'a tıklama analizi (clicks tablosu `push` source'uyla genişletilebilir)

## 3. Konsept
```
TanStack (tarayıcı):
  "Bildirimleri aç" butonu -> Notification.requestPermission()
  -> navigator.serviceWorker.register + pushManager.subscribe(VAPID)
  -> aboneliği hono'ya POST /api/push/subscribe (anonim id ile, D1 push_subs tablosu)

kapi-cron (her 5-10 dk):
  yeni bildirim taraması -> takip listeleri bilinmiyor (localStorage!) ->
  sunucuda takip listesi YOK -> push hangi hisselere?

SORUN: takip listesi tarayıcıda (localStorage). Sunucu push için abonelik + hisse tercihini
bilmelidir. Çözüm: subscribe sırasında kullanıcının takip listesi de gönderilir
(anonim, D1 push_subs.etiketler JSON) — localStorage değişince güncellenir
(sync periyodik ya da her takip değişikliğinde).
```

## 4. Fazlar

### Faz 1 — Abonelik altyapısı
- Hono: `POST /api/push/subscribe` (endpoint, anon_id, subscription JSON, takip ticker'ları) → D1 `push_subs`
- VAPID key üretimi (web-push paketi ya da ham RFC 8030: JWT + AES-GCM; Workers'ta WebCrypto ile yapılır)
- TanStack: sw.js (service worker) + "Bildirimleri aç" butonu (takip listesi sayfası + header)

### Faz 2 — Gönderim mantığı
- kapi-cron (ya da hono): her döngüde son N dakikanın yeni skor≥7 bildirimleri + takip eşleşmesi
- Push eşiği: skor≥7 ve (takip listesinde hisse VEYA BIST100 üstü?) — S13 okunma verisi karar verecek
- Rate limit: kullanıcı başına günlük max N push (örn. 10)
- Tıklama: push tıklaması → bildirim detayı (clicks'e `push` source'u)

### Faz 3 — Ölçüm
- Push'a tıklama oranı (clicks kaydı) → öncelik kalibrasyonu

## 5. Açık Sorular (S13 verisiyle yanıtlanacak)
- Hangi skor eşiği push'lanmalı? (okunma raporu: 8-10 bandı gerçekten okunuyor mu?)
- Hangi kategori? (sentez maddeleri mi, anlık mı?)
- Gün içi sessiz saatler?

## 6. Teknik Notlar
- Web Push RFC 8030: subscription endpoint'e POST (VAPID JWT + payload AES-128-GCM)
- Workers'ta: crypto.subtle ile imzalama + fetch — harici paket gerekmez
- KV yerine D1'de push_subs (sorgu gerekli: takip eşleşmesi)
- iOS Safari desteği sınırlı (16.4+ PWA) — masaüstü Chrome/Edge hedef

## 7. Kabul Kriterleri (uygulandığında)
- [ ] Tarayıcıda izin → takip hissesi skor≥7 bildirimi → push düşer
- [ ] Push tıklaması detaya gider
- [ ] Günlük push limiti çalışır
- [ ] Kullanıcı başına takip güncellemesi push hedefini etkiler

## 8. Başlama Şartı
S13 okunma raporunda ≥100 tıklama verisi (kategori/skor kırılımı) biriktiğinde
eşik kararı verilir ve bu taslak kesinleştirilir.