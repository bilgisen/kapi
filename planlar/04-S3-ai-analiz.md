# S3 — W3 AI Analiz Worker (kapi-ai, Cloudflare Worker TS)

- Durum: başlamadı
- Bağımlılık: S0, S1, S2
- Repo: kap (apps/ai)

## 1. Amaç
Skor >= 5 olan **BIST100** bildirimleri için Gemini ile Türkçe özet, etki analizi, anahtar rakamlar, duyarlılık ve chatbot context üretip D1'e yazmak. Skor >= 8 için daha güçlü model tier. Skor < 5 / BIST100 dışı için otomatik AI çağrısı YOK (KAP özeti kullanılır); bunlar için **on-demand analyze endpoint'i** (POST → K11, herkese açık + limit + KV cache: bir bildirim bir kez analiz edildiğinde cache döner).

## 2. Kapsam Dışı
- Kural bazlı sınıflandırma (S2)
- PDF parse (S1, metin zaten D1'de)
- Chatbot UI (S6)

## 3. Fazlar

### Faz 1 — Prompt mimarisi
- SYSTEM_PROMPT: yatırımcı odaklı, JSON çıktı (summary_tr, impact_analysis, key_numbers, sentiment, video/chatbot_context, confidence).
- `buildAnalysisPrompt()`: subject, type, sirket, tarih, summary, pdf_text (ilk 4K).
- Doğrulama: örnek JSON şeması unit testi.

### Faz 2 — Model tiering
- **Otomatik (queue/cron):** yalnız is_bist100=1; skor >= 8: güçlü model (gemini-pro), 5-7: gemini flash.
- **On-demand (K11):** herhangi bir bildirim — POST tetikle; analiz varsa KV'den cache döner; yoksa flash ile üretilir ve cache+D1'e yazılır; günlük global limit.
- Düşük skor / BIST100 dışı: çağrı yok, KAP summary'si zaten listede.
- Doğrulama: 2 farklı skor grubunda çağrılar doğru modele gider; on-demand ikinci kez çağrılınca AI çağrısı yapılmaz.

### Faz 3 — Trigger + retry + token bütçesi
- Otomatik tetikleme: W2 call (queue veya scheduled cron) — **yalnız BIST100 skor>=5**.
- On-demand (K11): POST /analyze → analiz varsa cache, yoksa üret; retry 2-3, JSON fallback.
- Token bütçesi: günlük limit (otomatik + on-demand global), model call sanitasyonu.
- Doğrulama: hatalı çıktıda DB'ye düşmüyor, retry oluyor.

### Faz 4 — Cache + D1 yazımı
- kap_analysis alanları: summary_tr, impact_analysis, key_numbers (JSON), chatbot_context, ai_model_used, confidence, needs_review.
- KV cache: analiz sonucu 24sa (etag?), yeniden işleme guard'ı (disclosure_index already analyzed).
- Doğrulama: aynı bildirim ikinci kez işlenmez.

## 4. Görev Listesi
- [ ] S3-1 Prompt mimarisi + JSON şeması + unit testler
- [ ] S3-2 Gemini client (REST veya SDK — Hono gemini-client referansı)
- [ ] S3-3 Model tiering (>=8 / 5-7) env ile model adı
- [ ] S3-4 Trigger + retry + token bütçesi (yalnız BIST100 skor>=5 otomatik)
- [ ] S3-5 KV cache + D1 yazımı + idempotency
- [ ] S3-6 On-demand analyze endpoint (K11): POST tetik, cache-first, global limit
- [ ] S3-7 wrangler.jsonc + deploy + secret (GEMINI_API_KEY)

## 5. Kararlar
- Model adları env'den: MODL_HIGH, MODEL_LOW.
- Düşük skorlular S2 ile aynı listede görünür, analiz alanları boş kalıtlır.

## 6. Kabul Kriterleri
- [ ] Skor>=5 BIST100 bildirimler için D1'de analysis satırı var
- [ ] Skor>=8 daha güçlü model ile işleniyor
- [ ] Skor<5 / BIST100 dışı için AI çağrısı yok (log doğrulaması)
- [ ] On-demand: ilk istek üretir, ikinci istek cache döner (AI çağrısı yapılmaz)
- [ ] Chatbot_context 200 kelime altında, Türkçe, JSON alanları tutarlı