# S11 — Strateji-3: Gün Sonu Sentez (K4)

- Durum: başlamadı
- Bağımlılık: S10 (layer/analiz altyapısı)
- Repo: kap + hono + tanstack

## 1. Amaç
Günün en önemli gelişmelerini tek bir okunabilir rapora dönüştürmek. Prensip: **seçim/sıralama deterministik (kodda), LLM yalnızca anlatı yazar**. Girdi: günün zaten üretilmiş one-liner özetleri (~1-1.5K token), çıktı: yapılandırılmış DailySynthesis JSON.

## 2. Kapsam Dışı
- Push kanalı (S12/kullanıcı sistemi)
- Haftalık/aylık sentez (ileride)

## 3. Fazlar

### Faz 1 — W3 /daily endpoint
- Deterministik ön işleme: günün analizlerini (source=template + ai) skora göre sırala, sektöre grupla; ilk 5-10 "büyük gelişmeler", kalan "gözden kaçmasın"
- LLM: yalnız seçilmiş listeyi anlatıya çevir (DailySynthesis JSON: headline, maddeler {ticker, neOldu, nedenOnemli, yon})
- KV cache (gün bazlı), retry
- Doğrulama: POST /daily → geçerli JSON, madde sayısı beklendiği gibi

### Faz 2 — Hono /api/daily
- W3 /daily proxy + KV cache (Hono tarafı)
- Doğrulama: GET /api/daily 200 + cache davranışı

### Faz 3 — TanStack rapor kartı
- Akış üstü günlük rapor görünümü (banner/panel)
- Kategori/skor rozetleri, tıklayınca ilgili bildirime git
- Doğrulama: canlı sayfada rapor render

### Faz 4 — Cron tetik
- kapi-cron'a ikinci schedule (TR 18:30 = UTC 15:30)
- Doğrulama: gün sonunda rapor üretildi

## 4. Görev Listesi
- [ ] S11-1 W3 /daily endpoint + DailySynthesis tipi
- [ ] S11-2 Deterministik seçim modülü (saf TS)
- [ ] S11-3 KV cache + retry
- [ ] S11-4 Hono /api/daily
- [ ] S11-5 TanStack rapor kartı
- [ ] S11-6 kapi-cron schedule ekleme + test

## 5. Karar Kayıtları
- 2026-08-13 K17: Gün sonu sentezde seçim deterministik; LLM girdisi damıtılmış one-liner listesi (ham metin değil) — maliyet ~1.5K token günlük

## 6. Doğrulama / Kabul Kriterleri
- [ ] /api/daily 200 + yapılandırılmış JSON
- [ ] Cron saatinde rapor üretildi (log)
- [ ] Canlı sayfada rapor görünüyor, madde tıklamaları bildirime gidiyor
