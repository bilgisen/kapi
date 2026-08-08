# S0 — Keşif & Kurulum

- Durum: [x] tamamlandı
- Bağımlılık: -
- Repo: kap

## 1. Amaç
Yeni reponun temelini atmak: git kurulumu, plan altyapısı, referans kopyası (oldfiles), KAP API doğrulama spike'ı ve ortam/D1 hazırlığı. Sonraki tüm planlar bu aşamaya dayanır.

## 2. Kapsam Dışı
- Bildirim çekme mantığı (S1)
- AI çağrıları (S3)
- Frontend / Hono değişiklikleri (S4-S6)

## 3. Fazlar

### Faz 1 — Repo kurulumu
- Açıklama: /kap dizininde git repo oluştur, .gitignore + README yaz, GitHub bilgisen/kapi'ye push.
- Doğrulama: `git log` mevcut, uzak repo güncel.

### Faz 2 — Plan altyapısı
- Açıklama: planlar/ yapısı (00-ANA-PLAN, SABLON, kararlar.md + 8 alt plan).
- Doğrulama: tüm dosyalar var, görev listeleri takip edilebilir.

### Faz 3 — oldfiles referans kopyası
- Açıklama: investapi'deki KAP ile ilgili dosyalar kap/oldfiles altına kopyalanır (kaynak silinmez).
- Doğrulama: kopya dosyalar yerinde, kaynaklar bozulmamış.

### Faz 4 — KAP API A/B doğrulama spike
- Açıklama: KAP public JSON API ve MKK VYK API'sini test et: üyelik listesi, bildirim listesi, detay, özet alanı, PDF indirme. K1 kararını kesinleştir.
- Doğrulama: dokümante edilmiş test sonuçları + karar kaydı güncellenmiş.

### Faz 5 — D1 + env hazırlığı
- Açıklama: Cloudflare D1 kapi-db oluştur, Python->D1 HTTP API token, GEMINI_API_KEY, env şablonları, wrangler.jsonc iskeleti.
- Doğrulama: D1 HTTP API ile basit sorgu çalışıyor.

## 4. Görev Listesi
- [x] S0-1 Repo kurulumu: git init, .gitignore, README, GitHub push
- [x] S0-2 planlar/ yapısı (bu dosyaların oluşturulması)
- [x] S0-3 oldfiles/ kopyası (investapi -> kap/oldfiles)
- [x] S0-4 A/B spike: KAP public API test (kazandı) -> docs/spike-kap-api.md
- [x] S0-5 A/B spike: MKK VYK client test (gateway erişilemiyor -> raporlandı)
- [x] S0-6 D1 kapi-db sağlama + Python->D1 API token (wrangler OAuth: access+refresh token, HTTP API doğrulandı, client_id 54d11594-...)
- [x] S0-7 env şablonları (.env.example, wrangler.jsonc)

## 5. Kararlar
- K1: KAP public JSON API kazandı (spike raporu docs/spike-kap-api.md). MKK VYK opsiyonel fallback.
- XU100 üye listesi: Hono index-constituents.json + KAP indices excel (indirildi).
- oldfiles klasör adı netleştirildi: `oldfiles/`.

## 6. Kabul Kriterleri
- [x] Repo GitHub'da
- [x] KAP API spike raporu yazıldı, kaynak kararı verildi
- [x] D1 yazma/okuma test edildi