# ANA PLAN — "Kapı" KAP Bildirimleri Platformu

- Oluşturulma: 2026-08-08
- Durum: aktif
- GitHub: https://github.com/bilgisen/kapi

## 1. Amaç

BIST 100 şirketlerinin KAP bildirimlerini otomatik çekip; kural bazlı sınıflandırarak 1-10 önem skoru veren, AI ile özetleyen ve JetBorsa'da (Hono + TanStack + Chatbot) sunan ayrı bir platform kurmak.

Ayırt edici değer: AI işleme + güzel tasnif + şirket sayfaları entegrasyonu + chatbot context.

## 2. Kararlar (kesinleşmiş)

| # | Karar | Seçim |
|---|---|---|
| K1 | Veri kaynağı | **Kesinleşti: KAP public JSON API** (auth'suz) — MKK VYK gateway erişilemiyor (spike raporu) |
| K2 | Kapsam | **Tüm KAP bildirimleri** (BIST100 = etiket + öncelik katmanı) |
| K3 | Önem skoru | Kural tabanlı (taksonomi + isLate/PDF varlığı ayarlayıcıları), 1-10 — **tüm bildirimlerde** |
| K4 | Düşük skorlu özet | KAP'ın kendi özeti (AI çağrısı yok); VYK'da özet yoksa "özet yok" etiketi |
| K5 | Yüksek skorlu AI | BIST100 + skor ≥ 8: pro model; BIST100 + 5-7: Flash; diğerleri: on-demand buton (K11) |
| K6 | DB | Cloudflare D1 (kapi-db); Python W1 D1 HTTP API ile yazar |
| K7 | Servis barındırma | W1: FastAPICloud (Python, pdfminer ile PDF parse); W2/W3: Cloudflare Workers (TS) |
| K8 | Repo | /kap = monorepo kökü, git init + GitHub bilgisen/kapi'ye push; investapi KAP dosyaları oldfiles/ kopyası (silinmez) |
| K9 | Chatbot | Ayrı alt plan (S6); context: feed geneli + şirket sayfası özel |
| K10 | Frontend | /bildirimler feed sayfası (tüm bildirimler + BIST100 chip) + /hisse/$ticker/bildirimler sekmesi; PDF için KAP orijinal linki |
| K11 | On-demand AI | Her bildirimde "AI ile analiz" butonu (herkese açık) — limit + KV cache, bir kez analiz |
| K12 | Veri saklama | Tüm bildirimler kalıcı (cleanup yok) |

## 3. Mimari

```
KAP public JSON API  +  MKK VYK API        (A/B, W1 içinde)
        |  polling (pazar saati 3dk / dısı 15dk)
        v
W1  kapi-fetch · Python FastAPI @ FastAPICloud
    bildirim listesi -> detay -> PDF çek/parse (cp1252, java-wrapper) -> D1'e raw yaz
        |
        v
W2  kapi-classify · CF Worker (TS) — kural motoru: kategori + skor 1-10 (TÜM bildirimler)
        |
        v
W3  kapi-ai · CF Worker (TS) — BIST100 skor>=5 otomatik + her bildirim için on-demand (K11)
        |
        v
D1  kapi-db (kap_notifications, kap_analysis, notification_companies, sync_state, bist100_members)
        ^
Hono orchestrator (mevcut repo): /api/notifications* + KV cache + auth + chatbot context
        ^
TanStack (mevcut repo): /bildirimler feed + /hisse/$ticker/bildirimler sekmesi + detay + chatbot
```

## 4. Alt Plan Haritası (sıralı)

| ID | Alt Plan | Bağımlılık | Fazlar | Repo |
|---|---|---|---|---|
| S0 | Keşif & Kurulum | - | 5 | kap |
| S1 | W1 Fetch Servisi (FastAPICloud) | S0 | 7 | kap |
| S2 | W2 Sınıflandırma Worker | S0, S1 (kısmen) | 4 | kap |
| S3 | W3 AI Analiz Worker | S0, S1, S2 | 4 | kap |
| S4 | Hono Entegrasyonu | S1-S3 | 5 | hono |
| S5 | Frontend (TanStack) | S4 | 5 | tanstack |
| S6 | Chatbot Entegrasyonu | S4, S5 | 4 | hono+tanstack |
| S7 | Operasyon & Yayın | tümü | 4 | kap+hono |
| S8 | Strateji-0: Operasyonel Sağlamlaştırma | S7 | 3 | kap |
| S9 | Strateji-1: Şablon Özet Motoru (K1) | S8 | 2 | kap |
| S10 | Strateji-2: Hibrit Eşik + Katmanlı AI (K2/K3) | S9 | 3 | kap |
| S11 | Strateji-3: Gün Sonu Sentez (K4) | S10 | 4 | kap+hono+tanstack |
| S12 | Strateji-4: Takip Listesi | S10 | 3 | hono+tanstack |
| S13 | Strateji-5: Sistem Kapanışı + Ölçüm | S9-S12 | 4 | kap+hono+tanstack |
| S14 | Strateji-6: Anonim Web Push (taslak) | S13 | - | hono+tanstack |

## 4b. Strateji Felsefesi (S8+)

Kaynak: Claude strateji danışmanlığı (2026-08-13). Prensip: "deterministik sınıflandırma → LLM yalnızca anlatım yapar" (KAP zincirinde de geçerli).

- **Katmanlı mimari:** K0 kural motoru (ücretsiz) → K1 şablon özet (LLM'siz, regex, ~%40-60 hacim) → K2 kısa AI özeti (flash, subject+body) → K3 derin analiz (pro, PDF'li, ~%10-15 hacim) → K4 gün sonu sentez (deterministik seçim + LLM anlatım).
- **Hibrit filtreleme:** kategori bazlı zorunlu min katman + kriz/eskalasyon kelime listesi (K3'e atlar) + sınır bölgesi (skor 4-6) için ucuz ikinci görüş (opsiyonel). Yanlış negatif (kaçırmak) > yanlış pozitif (gereksiz analiz).
- **PDF stratejisi:** yalnızca K3 ve yalnızca sayı-ağırlıklı kategoriler; ham PDF metni değil, ayıklanmış içerik/ilk 8K karakter LLM'e gider.
- **Kullanıcı davranışı geri beslemesi:** "AI analizi göster" tıklama oranı kategori/skor bazında loglanır; kural motoru periyodik yeniden kalibre edilir (S10 faz 3).

## 5. Master Task Listesi

Durum işaretleri: [x] tamam / [ ] bekliyor

- [x] S0-1 Repo kurulumu: git init, GitHub push, .gitignore, README
- [x] S0-2 planlar/ yapısı + şablon dosyaları + karar kaydı
- [x] S0-3 investapi -> oldfiles/ referans kopyası
- [x] S0-4 KAP API A/B doğrulama spike (public JSON kazandı; PDF: BildirimPdf temiz + file/download wrapper) -> K1 kesinleşti
- [x] S0-5 D1 kapi-db sağlama + Cloudflare token yetkileri (wrangler OAuth: access+refresh, HTTP API doğrulandı) + GEMINI_API_KEY (investapi'den var)
- [ ] S1-1 KAP client (list/detay/PDF; tüm piyasa "FFFF", pencere 1-2 gün) + VYK client (referans)
- [ ] S1-2 XU100 etiketleme listesi (bist100_members — fetch filtresi DEĞİL, etiket için; Hono constituents / KAP excel)
- [ ] S1-3 D1 şema + migrasyon + Python->D1 HTTP API yazma katmanı
- [ ] S1-4 Polling orkestrasyonu (warmup, rate-limit, pencere)
- [ ] S1-5 PDF parse pipeline (java wrapper, cp1252, 8K truncate)
- [ ] S1-6 Tekil/dup/düzeltme (isChanged/relatedDisclosure) yönetimi
- [ ] S1-7 FastAPICloud deploy + health + log
- [ ] S2-1 Taksonomi + kural motoru (Claude şeması temel alınır)
- [ ] S2-2 Skor ayarlayıcılar + needs_review/UNKNOWN fallback
- [ ] S2-3 Ingest endpoint (W1->W2) + D1 yazımı + W3 tetikleme
- [ ] S2-4 Batch/retry + kuyruk davranışı
- [ ] S3-1 Prompt mimarisi (summary_tr, site, key_numbers, sentiment, chatbot_context) JSON çıktı
- [ ] S3-2 Model tiering (>=8 pro / 5-7 flash); düşük skor -> KAP özeti (K4)
- [ ] S3-3 Trigger (cron/queue BIST100 skor>=5), retry, token bütçesi + on-demand analyze endpoint (K11, KV cache)
- [ ] S3-4 Analiz KV cache + D1 yazımı
- [ ] S4-1 GET /api/notifications (filtre: önem/kategori/sektör/sirket/BIST100, sayfalama)
- [ ] S4-2 GET /api/notifications/:ticker
- [ ] S4-3 GET /api/notifications/detail/:disclosureIndex (AI analiz + PDF link)
- [ ] S4-4 POST /api/notifications/:disclosureIndex/analyze (on-demand AI, K11 — limit + cache)
- [ ] S4-5 KV cache + CORS + auth tier
- [ ] S4-6 Chatbot context endpoint'leri (/api/notifications/context/feed, /context/:ticker) — S6 kullanır
- [ ] S5-1 /bildirimler feed sayfası (TÜM bildirimler; kartlar, BIST100 chip, filtreler, skeleton, AI-buton)
- [ ] S5-2 /hisse/$ticker/bildirimler sekmesi (TABS + route)
- [ ] S5-3 Detay görünümü (analiz, anahtar rakamlar, "Orijinal PDF" linki)
- [ ] S5-4 "Bugünün önemli bildirimleri" banner widget
- [ ] S5-5 Durum/mobil/boş durum iyileştirmeleri
- [ ] S6-1 sirket:X:bildirimler + feed context -> chatbot akışı
- [ ] S6-2 pageContextSuggestions + suggestion'lar
- [ ] S6-3 Sohbet yönlendirmeleri ("bugün ne oldu?", şirket soruları)
- [ ] S6-4 JetToken/usage metering (opsiyonel)
- [x] S7-1 Cron senkronu + W1 polling
- [x] S7-2 Monitoring: hata oranı, token maliyet, sync durumu
- [x] S7-3 Canlı yayın (alan adı, CORS, ölçek)
- [x] S7-4 Runbook + README + belgeleme
- [ ] S8-1 Backfill 10-13.08 tamamlama + doğrulama
- [ ] S8-2 Token kalıcılığı (API token) + cron izleme
- [x] S8-3 Veri kalitesi ölçümü (pdf_text/body/summary kapsamı) — 1600 kayıt, %100 body, 512 template
- [x] S9-1 Şablon motoru (W2) + ilk 10-15 kalıp
- [x] S9-2 Gerçek veride kapsam ölçümü + kalıp genişletme — %32 kapsam, Faz 2 ile hedef %40+
- [x] S10-1 Kategori bazlı zorunlu katman + eskalasyon listesi
- [x] S10-2 W3 layer parametresi (K2 flash / K3 pro+pdf)
- [x] S10-3 W1 otomatik PDF çekimi (K3 adayları)
- [x] S11-1 W3 /daily deterministik seçim + LLM anlatım
- [x] S11-2 Hono /api/daily + KV cache
- [x] S11-3 TanStack günlük rapor kartı
- [x] S11-4 Cron tetik (TR 18:30)
- [x] S12-1 localStorage takip listesi + Takipte sekmesi
- [x] S12-2 Feed vurgusu + "hissemi etkiler mi" filtre

## 6. Riskler & Notlar

- KAP WAF: session warmup, HTTP 666; 2000 kayıt/istek limiti; pencere 30-60dk tutulur.
- PDF: Java byte[] wrapper (offset 27), cp1252 — pdfminer.six Workers'ta çalışmaz -> W1 (Python) içinde.
- VYK'da KAP özeti (summary.tr) yoktur -> K4 düşük skorlular "özet yok" davranır veya ucuz Gemini seçeneği.
- Hono'da mevcut JetToken metering yok; S6'da opsiyonel eklenir.
- D1'dan okuma: Worker'lar (W2/W3/Hono) doğrudan binding kullanır; W1 yazımı D1 HTTP API + API token.
- BIST 100 listesi her çeyrek güncellenir — periyodik tazeleme görevi şart.