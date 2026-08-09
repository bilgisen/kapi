# S2 — W2 Sınıflandırma Worker (kapi-classify, Cloudflare Worker TS)

- Durum: kısmen tamam — S2-1/2/3/5 [x], S2-4 [~] (W3 URL env'si S3'te doldurulacak, tetikleyici kod hazır)
- Bağımlılık: S0, S1 (kısmen — ingest endpoint'i için W1'in D1 şeması gerekir)
- Repo: kap (apps/classify)

## 1. Amaç
W1'den gelen ham bildirimleri kural tabanlı sınıflandırmak: kategori + önem skoru (1-10) + zaman ufku + duyarlılık ipucu. LLM çağrısı yok — deterministik, ucuz, hızlı. **TÜM bildirimler skorlanır** (K3); BIST100 skor>=5 olanlar W3'e (AI) tetiklenir, diğerleri KAP özeti + on-demand buton (K11) ile ilerler.

## 2. Kapsam Dışı
- AI özet/analiz (S3)
- PDF parse (S1)
- Frontend/Hono (S4-S5)

## 3. Fazlar

### Faz 1 — Taksonomi + kural motoru
- Kategoriler: FİNANSAL_RAPOR, TEMETTÜ, SERMAYE_ARTIRIMI, SERMAYE_AZALTIMI, TAHVİL_İHRACI, BİRLEŞME_DEVİRALMA, GERİ_ALIM, ORTAKLIK_DEĞİŞİKLİĞİ, YK_KARAR, GENEL_KURUL, ÖZEL_DURUM, PAY_ALIM_SATIM, BÜYÜK_ORTAKLIK, ÜRETİM_SATIŞ, İHALE, HUKUKİ, KREDİ_NOTU, DENETİM, DÜZELTME, RUTİN, BELİRSİZ.
- `CLASSIFICATION_RULES` (matchSubjects + matchKeywords + baseImportance + timeHorizon).
- Doğrulama: unit testler, 50 örnek bildirimde doğru kategori.

### Faz 2 — Skor ayarlayıcılar + fallback
- `adjustImportance`: isLate +1, hasPdfText +0.5, üst sınır 10.
- `scoreToLabel`: KRİTİK/ÇOK_ÖNEMLİ/ÖNEMLİ/RUTİN.
- Eşleşme yoksa UNKNOWN (skor 3) + `needs_review` flag.
- Doğrulama: sınır değerler test ediliyor (5/7/9).

### Faz 3 — Ingest endpoint + D1 yazımı
- POST /ingest (W1 çağırır): raw bildirim al, sınıflandır, kap_analysis'e yaz, notification_companies bağla.
- W1 için auth (paylaşılan secret).
- Doğrulama: curl ile ingest sonrası D1'de satır.

### Faz 4 — W3 tetikleme + batch/retry
- **Sadece is_bist100=1 VE skor >= 5** için W3'e tetik (queue veya HTTP callback). Diğerleri W3'ün on-demand endpoint'ine hazır bekler.
- Retry mantığı (3 deneme, backoff), hata logları.
- Doğrulama: BIST100 skor 5+ bildirim W3 tarafından işlendi; BIST100 dışı işlenmedi.

## 4. Görev Listesi
- [x] S2-1 Taksonomi + kural motoru + unit testler (15/15 geçti)
- [x] S2-2 Skor ayarlayıcılar + UNKNOWN/needs_review fallback
- [x] S2-3 Ingest endpoint + D1 yazımı + auth (X-Classify-Secret; canlı 14/14 analiz)
- [x] S2-4 W3 tetikleme + retry/backoff (CLASSIFY_W3_URL+SECRET set; W1→W2→W3 zinciri canlı doğrulandı)
- [x] S2-5 wrangler.jsonc + deploy konfigürasyonu (https://kapi-classify.paraanaliz.workers.dev)

## 5. Kararlar
- Kategoriler Claude notundaki enum temel alındı (kısaltma/İngilizce key, Türkçe etiket).
- Ingest güvenliği: paylaşılan secret header.

## 6. Kabul Kriterleri
- [ ] Kural motoru deterministik (aynı girdi -> aynı çıktı)
- [ ] Skor dağılımı makul (çoğunluk düşük skor)
- [ ] Ingest sonrası D1'de veri, W3 tetikleme çalışıyor