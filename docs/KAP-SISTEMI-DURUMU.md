# KAP Bildirim Sistemi — Durum Dokümanı

- Son güncelleme: 2026-08-14
- Durum: **v1 tamamlandı, bakım modu** (yeni geliştirme N4'te)
- İlgili planlar: S0-S13 (tamamlandı), N0-N4 (şemsiye)

---

## 1. Özet

KAP kamu bildirimleri otomatik çekilir (tüm piyasa), kural motoruyla sınıflandırılıp 1-10 önem skoru alır, şablon/katmanlı AI ile özetlenir ve JetBorsa'da sunulur: canlı feed, detay + AI analiz, gün sonu sentez, takip listesi entegrasyonu, chatbot context.

**Canlı sayılar (14.08.2026):** 2.623 bildirim / 2.624 analiz (7 günde), kapsam %100 (son 24 saat 570/570 işlendi), şablon oranı son gün %42, BIST100 payı %10.6, AI özet kaybı 0 (self-heal ile).

---

## 2. Mimari

```
KAP public JSON API
   │ polling (kapi-cron tetikler: pazar saati 3dk, dışı 15dk; +30 15 UTC sentez)
   ▼
W1 kapi-fetch · Python FastAPI @ FastAPICloud (https://kapi-7d527e98.fastapicloud.dev)
   liste → detay → PDF çek/parse (java wrapper, cp1252, 8K truncate) → D1'e raw yaz
   ▼
W2 kapi-classify · CF Worker (https://kapi-classify.paraanaliz.workers.dev)
   POST /ingest: bekleyen bildirimleri sınıflandırır (skor 1-10, kategori, zaman ufku),
   şablon eşleşmesi varsa LLM'siz özet üretir (K1);
   BIST100 + skor≥5 → W3 tetikler (service binding KAPI_AI); self-heal (özetsiz otomatik yeniden işlenir)
   ▼
W3 kapi-ai · CF Worker (https://kapi-ai.paraanaliz.workers.dev)
   POST /auto: BIST100 skor≥5 → katmanlı AI (K2 gemini-2.5-flash / K3 gemini-3.1-pro-preview)
   POST /analyze: on-demand (cache-first, günlük limit)
   POST /daily: gün sonu sentez (deterministik seçim + LLM anlatım)
   KV cache: ai:<index>, ai:daily:<trDay>
   ▼
D1 kapi-db · Cloudflare D1 (38321f66-c11e-4ea0-82a8-cbcccf0ec4a4)
   kap_notifications, kap_analysis, notification_companies, clicks, sync_state
   ▼
Hono orchestrator (https://hono.paraanaliz.workers.dev · custom: https://hono.jetborsa.com)
   /api/notifications (feed/filtre/detay/AI), /api/daily, /api/clicks, KV cache (HONO_KV_CACHE)
   ▼
TanStack (https://tanstack.paraanaliz.workers.dev · jetborsa.com)
   /bildirimler (KAP feed), /bildirimler/$id (detay), /gunsonu (sentez), /takip-listesi,
   /hisse/$ticker/bildirimler, endeks/sektör bildirim sayfaları
```

Worker zinciri (her 5-10 dk, kapi-cron `*/10 * * * *` + sentez `30 15 * * *`):
`kapi-cron → W1 refresh (--days 2 --pdf --pdf-max 30) → W2 /ingest → (auto ise) W3 /auto`

---

## 3. Veri Modeli

| Tablo | Önemli alanlar | Not |
|---|---|---|
| kap_notifications | disclosure_index (PK), title, subject, disclosure_class/type/category, summary, disclosure_body, publish_date, is_late, is_changed, is_bist100, pdf_text, pdf_error, attachment_count, audit_json | 2.623 kayıt |
| kap_analysis | disclosure_index (PK), importance_score 1-10, category, time_horizon, summary_tr, impact_analysis, key_numbers, sentiment, chatbot_context, ai_model_used, confidence, needs_review, source (template/auto/ondemand), analyzed_at | 2.624 kayıt |
| notification_companies | disclosure_index + ticker (çoklu) | 2.492 eşleşme |
| clicks | id, disclosure_index, source (feed_card/detail/daily_view/daily_item), anon_id, clicked_at | S13 tıklama logu |

KV (kapi-ai): `ai:<index>` (analiz cache), `ai:daily:<trDay>` (sentez cache, 86400s)
KV (hono): `notifications:*` feed cache (5 dk pazar saati / 30 dk dışı)

---

## 4. Katmanlar (K0-K4)

| Katman | Mekanizma | Maliyet | Kapsam |
|---|---|---|---|
| K0 | Kural motoru (skor + kategori + eskalasyon) | 0 | tüm bildirimler |
| K1 | Şablon özet (regex kalıpları, LLM'siz) | 0 | son gün %42 |
| K2 | gemini-2.5-flash özet+etki | düşük | BIST100 skor≥5 |
| K3 | gemini-3.1-pro-preview derin analiz | yüksek | BIST100 skor≥8 (7 günde 3 analiz — az kullanım) |
| K4 | Gün sonu sentez (deterministik seçim + LLM anlatım) | günde 1 | /gunsonu |

Prensip (K17): seçim/sıralama deterministik kodda; LLM yalnız damıtılmış girdiden anlatı yazar.

---

## 5. Canlı Metrikler (2026-08-14)

| Metrik | Değer |
|---|---|
| Toplam bildirim / analiz | 2.623 / 2.624 |
| Son 7 gün kapsam | %100 (son 24h 570/570) |
| Şablon oranı (son gün) | %42.4 (hedef %40-50 ✓) |
| BIST100 payı | %10.6 (278/2.623) |
| Skorsuz analiz | 1/2.624 |
| AI özet kaybı (skor≥5 BIST100) | 0 (7 kayıp onarıldı + self-heal) |
| Feed yanıt süresi | ~1.1-1.3s (KV cache) |
| K3 (pro) kullanımı | 3 analiz / 7 gün |

---

## 6. Bilinen Sınırlamalar

1. **BIST100 dışı bildirimler LLM özeti almaz** (S10 maliyet kararı, K4/K5): feed'de subject gösterilir; şablon eşleşmeyenler özetsiz kalır. → FT-5
2. **K3 katmanı pratikte neredeyse hiç kullanılmıyor** (skor≥8 eşiği çok dar). → FT-4
3. Şablon kapsamı %42 — hedef %50'ye genişletilebilir. → FT-1
4. Feed ~1.1s (ilk miss) — kabul edilebilir, iyileştirilebilir.
5. Sentez maddelerinde disclosure_index yok (tıklama logu için eklenebilir).
6. İki eski kayıt (08-07/08-09) analizsiz — tarih sınırından kaynaklı, önemsiz.

---

## 7. Açık Doğrulamalar (kullanıcı kontrolünde)

- S9: 50 şablon eşleşmesi — `planlar/dogrulama/S9_orneklem_50_template.txt` (hedef yanlış ≤ %5)
- S10-6: 5 K2 + 3 K3 analiz — `planlar/dogrulama/S10_orneklem_K2_K3.txt`

---

## 8. Fine Tuning Backlog (N4)

| # | Konu | Öncelik |
|---|---|---|
| FT-1 | Şablon kapsamı %42 → %50 | orta |
| FT-2 | S9 örneklem sonucu → kalıp düzeltmeleri | yüksek (kullanıcı kontrolü sonrası) |
| FT-3 | S10-6 örneklem sonucu → prompt/skor kalibrasyonu | yüksek |
| FT-4 | K3 eşiği / kullanımı (okunma verisiyle) | düşük |
| FT-5 | BIST100 dışı özetsiz kartlar kararı | orta |
| FT-6 | Okunma kalibrasyonu (≥100 tık sonra) | orta |
| FT-7 | "JSON bloğu bulunamadı" geçici bozuk çıktılar | izleniyor (self-heal var) |

---

## 9. Operasyonel Notlar

- **Secret'lar (Cloudflare)**: W3_SECRET (kapi-ai, hono, kapi-cron), CLASSIFY_SECRET, FASTAPI_SECRET_KEY (W1), GEMINI_API_KEY (kapi-ai, hono)
- **Service bindings**: hono→kapi-ai (KAPI_AI), kapi-cron→kapi-ai (KAPI_AI), kapi-classify→kapi-ai (KAPI_AI) — workers arası HTTP 404+1042 (K23) nedeniyle binding zorunlu
- **W1 deploy**: FastAPICloud panelinden; doğrulama `GET /health`
- **Deploy**: `npx wrangler deploy` (kap/apps/{ai,classify,cron}, hono, tanstack root'tan)
- **Rapor**: `python scripts/okunma_raporu.py [gün]`
- **TR günü**: UTC+3; gün sınırı 21:00 UTC (trDayRange)
- **Kron**: kapi-cron `*/10 * * * *` (zincir) + `30 15 * * *` (sentez) + `/trigger-daily?secret=`
- D1 erişim: `apps/fetch/d1_client.py` (wrangler OAuth, otomatik refresh)

---

## 10. Route Haritası (Hono)

- `GET /api/notifications` — feed (filtre: importance/category/stock/bist100/index/sector/stocks, sayfalama)
- `GET /api/notifications/detail/:id` · `.../body/:id` · `.../:id/analyze` (on-demand) · `.../context/*`
- `GET /api/daily` — gün sonu sentez (KV cache)
- `POST /api/clicks` — tıklama logu (anonim)
- `GET /health`

---

## 11. TanStack Route Haritası (KAP ile ilgili)

- `/bildirimler` — KAP feed (N2'de `/kap-bildirimleri`'ne taşınacak)
- `/bildirimler/$disclosureId` — detay + AI analiz
- `/gunsonu` — gün sonu sentez
- `/hisse/$ticker/bildirimler`, `/endeksler/$id/bildirimler`, `/sektorler/*/bildirimler`
- `/takip-listesi` — localStorage takip listesi (N1'de sunucuya taşınacak)