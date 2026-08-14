# S11 — Strateji-3: Gün Sonu Sentez (K4)

- Durum: tamamlandı (Faz 1-4, 2026-08-14)
- Bağımlılık: S10 (layer/analiz altyapısı)
- Repo: kap + hono + tanstack

## 1. Amaç
Günün en önemli gelişmelerini tek bir okunabilir rapora dönüştürmek. Prensip: **seçim/sıralama deterministik (kodda), LLM yalnızca anlatı yazar**. Girdi: günün zaten üretilmiş one-liner özetleri (~1-1.5K token), çıktı: yapılandırılmış DailySynthesis JSON.

## 2. Kapsam Dışı
- Push kanalı (S12/kullanıcı sistemi)
- Haftalık/aylık sentez (ileride)

## 3. Fazlar

### Faz 1 — W3 /daily endpoint ✅
- Deterministik ön işleme: günün analizlerini (skor DESC, sonra yayın saati DESC) sırala; ilk 5 "büyük gelişmeler" + skor>=7'ler (max 8), kalan 5 "gözden kaçmasın"
- LLM: yalnız seçilmiş listeyi anlatıya çevir (DailySynthesis JSON: headline, maddeler {ticker, neOldu, nedenOnemli, yon})
- KV cache (`ai:daily:YYYY-MM-DD`, gün bazlı), retry (callGemini 3 deneme)
- Doğrulama: POST /daily → geçerli JSON ✓ (13.08 → 8 madde, 14.08 → 200 ok)

### Faz 2 — Hono /api/daily ✅
- W3 /daily proxy (service binding KAPI_AI + X-W3-Secret) + KV cache (10 dk)
- Doğrulama: GET /api/daily 200 + cache davranışı ✓ (`_cache: kv`)

### Faz 3 — TanStack rapor kartı ✅
- `/gunsonu` sayfası (tarih seçici, headline kartı, madde kartları + yön rozeti, gözden kaçmasın listesi)
- `bildirimler` sayfasında giriş kartı
- Doğrulama: canlı sayfada rapor render ✓

### Faz 4 — Cron tetik ✅
- kapi-cron'a ikinci schedule (TR 18:30 = UTC 15:30) — `30 15 * * *`
- Doğrulama: elle trigger + sentez üretimi ✓ (service binding ile)

## 4. Görev Listesi
- [x] S11-1 W3 /daily endpoint + DailySynthesis tipi
- [x] S11-2 Deterministik seçim modülü (saf TS)
- [x] S11-3 KV cache + retry
- [x] S11-4 Hono /api/daily
- [x] S11-5 TanStack rapor kartı
- [x] S11-6 kapi-cron schedule ekleme + test

## 5. Karar Kayıtları
- 2026-08-13 K17: Gün sonu sentezde seçim deterministik; LLM girdisi damıtılmış one-liner listesi (ham metin değil) — maliyet ~1.5K token günlük
- 2026-08-14 K23: kapi-cron'dan `*.workers.dev`'e HTTP fetch 404+1042 (Cloudflare kısıtı) — workers arası çağrı service binding (`KAPI_AI`) ile yapılıyor (hono'daki desen)

## 6. Doğrulama / Kabul Kriterleri
- [x] /api/daily 200 + yapılandırılmış JSON
- [x] Cron saatinde rapor üretildi (trigger ile sentez üretimi doğrulandı; saatli tetik 15:30 UTC'de ilk kez otomatik çalışacak)
- [x] Canlı sayfada rapor görünüyor (tanstack /gunsonu), madde tıklamaları hisse sayfasına gidiyor