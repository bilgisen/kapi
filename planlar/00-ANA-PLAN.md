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
| K2 | Kapsam | Yalnızca BIST 100 üyeleri (XU100 listesi KAP endeks API'den periyodik tazelenir) |
| K3 | Önem skoru | Kural tabanlı (taksonomi + isLate/PDF varlığı ayarlayıcıları), 1-10 |
| K4 | Düşük skorlu özet | KAP'ın kendi özeti (AI çağrısı yok); VYK'da özet yoksa "özet yok" etiketi |
| K5 | Yüksek skorlu AI | skor ≥ 5: Gemini; ≥ 8: daha güçlü model tier; PDF içeriği prompt'a eklenir |
| K6 | DB | Cloudflare D1 (kapi-db); Python W1 D1 HTTP API ile yazar |
| K7 | Servis barındırma | W1: FastAPICloud (Python, pdfminer ile PDF parse); W2/W3: Cloudflare Workers (TS) |
| K8 | Repo | /kap = monorepo kökü, git init + GitHub bilgisen/kapi'ye push; investapi KAP dosyaları oldfiles/ kopyası (silinmez) |
| K9 | Chatbot | Ayrı alt plan (S6); context: feed geneli + şirket sayfası özel |
| K10 | Frontend | /bildirimler feed sayfası + /hisse/$ticker/bildirimler sekmesi; PDF için KAP orijinal linki |

## 3. Mimari

```
KAP public JSON API  +  MKK VYK API        (A/B, W1 içinde)
        |  polling (pazar saati 3dk / dısı 15dk)
        v
W1  kapi-fetch · Python FastAPI @ FastAPICloud
    bildirim listesi -> detay -> PDF çek/parse (cp1252, java-wrapper) -> D1'e raw yaz
        |
        v
W2  kapi-classify · CF Worker (TS) — kural motoru: kategori + skor 1-10
        |
        v
W3  kapi-ai · CF Worker (TS) — skor>=5 için Gemini ozet/etki/rakamlar/context
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

## 5. Master Task Listesi

Durum işaretleri: [x] tamam / [ ] bekliyor

- [x] S0-1 Repo kurulumu: git init, GitHub push, .gitignore, README
- [x] S0-2 planlar/ yapısı + şablon dosyaları + karar kaydı
- [x] S0-3 investapi -> oldfiles/ referans kopyası
- [x] S0-4 KAP API A/B doğrulama spike (public JSON kazandı; PDF: BildirimPdf temiz + file/download wrapper) -> K1 kesinleşti
- [ ] S0-5 D1 kapi-db sağlama + Cloudflare token yetkileri + GEMINI_API_KEY
- [ ] S1-1 KAP client (list/detay/PDF) + VYK client (referans)
- [ ] S1-2 BIST100 üyelik listesi çekme + bist100_members tablosu
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
- [ ] S3-3 Trigger (cron/queue), retry, token bütçesi
- [ ] S3-4 Analiz KV cache + D1 yazımı
- [ ] S4-1 GET /api/notifications (filtre: önem/kategori/sektör/sirket, sayfalama)
- [ ] S4-2 GET /api/notifications/:ticker
- [ ] S4-3 GET /api/notifications/detail/:disclosureIndex (AI analiz + PDF link)
- [ ] S4-4 KV cache + CORS + auth tier
- [ ] S4-5 Chatbot context endpoint'leri (/api/notifications/context/feed, /context/:ticker) — S6 kullanır
- [ ] S5-1 /bildirimler feed sayfası (kartlar, filtreler, skeleton)
- [ ] S5-2 /hisse/$ticker/bildirimler sekmesi (TABS + route)
- [ ] S5-3 Detay görünümü (analiz, anahtar rakamlar, "Orijinal PDF" linki)
- [ ] S5-4 "Bugünün önemli bildirimleri" banner widget
- [ ] S5-5 Durum/mobil/boş durum iyileştirmeleri
- [ ] S6-1 sirket:X:bildirimler + feed context -> chatbot akışı
- [ ] S6-2 pageContextSuggestions + suggestion'lar
- [ ] S6-3 Sohbet yönlendirmeleri ("bugün ne oldu?", şirket soruları)
- [ ] S6-4 JetToken/usage metering (opsiyonel)
- [ ] S7-1 Cron senkronu + W1 polling
- [ ] S7-2 Monitoring: hata oranı, token maliyet, sync durumu
- [ ] S7-3 Canlı yayın (alan adı, CORS, ölçek)
- [ ] S7-4 Runbook + README + belgeleme

## 6. Riskler & Notlar

- KAP WAF: session warmup, HTTP 666; 2000 kayıt/istek limiti; pencere 30-60dk tutulur.
- PDF: Java byte[] wrapper (offset 27), cp1252 — pdfminer.six Workers'ta çalışmaz -> W1 (Python) içinde.
- VYK'da KAP özeti (summary.tr) yoktur -> K4 düşük skorlular "özet yok" davranır veya ucuz Gemini seçeneği.
- Hono'da mevcut JetToken metering yok; S6'da opsiyonel eklenir.
- D1'dan okuma: Worker'lar (W2/W3/Hono) doğrudan binding kullanır; W1 yazımı D1 HTTP API + API token.
- BIST 100 listesi her çeyrek güncellenir — periyodik tazeleme görevi şart.