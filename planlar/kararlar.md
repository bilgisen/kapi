# Karar Kaydı (Decision Log)

Merkezi karar günlüğü. Her kritik karar tek satır + tarih + gerekçe.

| Tarih | Karar | Seçim | Gerekçe | Kaynak |
|---|---|---|---|---|
| 2026-08-08 | K1 Veri kaynağı | KAP public JSON API (auth'suz) kazandı; MKK VYK ulaşılamıyor (gateway apinizer hepsi OpenAPI spec döner, ücretli/üretim aboneliği gerekir) | Spike S0-4: tüm endpoint'ler doğrulandı, özet alanı dolu | docs/spike-kap-api.md |
| 2026-08-08 | K2 Kapsam | **REVİZYON: Tüm KAP bildirimleri** çekilir + listelenir; BIST100 = etiket + öncelik katmanı (AI/otomatik analiz) | Min iş yükü: byCriteria zaten tam liste döner (614/gün spike), OID filtreleme ekstra iş; feed zenginleşir | Kullanıcı kararı |
| 2026-08-08 | K3 Önem skoru | **REVİZYON: Skor tüm bildirimlerde** hesaplanır (deterministik, maliyetsiz); BIST100 rozeti skorun yanında | Skor ucuz, tüm feed kullanıcıya değer üretir | Kullanıcı kararı |
| 2026-08-08 | K4 Düşük skorlu özet | KAP'ın kendi summary metni | Sıfır AI maliyeti, resmi kaynak | Kullanıcı kararı |
| 2026-08-08 | K5 Yüksek skorlu AI | **REVİZYON: BIST100 + skor>=5 otomatik Gemini Flash; >=8 pro model; kalanlar (BIST100 dışı, skor<5) on-demand butonla** | Maliyet kullanıcı tetikli; otomatik akış yüksek değerli BIST100 ile sınırlı (günlük ~100-200 çağrı) | Kullanıcı kararı |
| 2026-08-08 | K6 DB | Cloudflare D1 (kapi-db) | Worker ekosistemi, ücretsiz seviye, KV desteği | Kullanıcı kararı |
| 2026-08-08 | K7 Barındırma | W1 FastAPICloud (Python), W2/W3 CF Workers | pdfminer Workers'da çalışmaz | Teknik kısıt |
| 2026-08-08 | K8 Repo | /kap monorepo + GitHub bilgisen/kap | Bağımsız geliştirme | Kullanıcı kararı |
| 2026-08-08 | K9 Chatbot | Ayrı alt plan (S6) | Karmaşıklığı ertelemek | Kullanıcı kararı |
| 2026-08-08 | K10 Frontend | PDF için KAP orijinal linki | Ziyaretçiler orijinali inceleyebilsin | Kullanıcı kararı |
| 2026-08-08 | K11 On-demand AI | Her bildirimde **"AI ile analiz" butonu** (herkese açık); günlük/istek limiti + KV cache (her bildirim bir kez analiz edilir, tekrar istekte cache döner); JetToken opsiyonel üst limit | Kullanıcı talebi → maliyet tek hücrede, uygulama ek yükü az | Kullanıcı kararı |
| 2026-08-08 | K12 Veri saklama | Tüm bildirimler kalıcı tutulur (cleanup yok) — ~600/gün ≈ 4MB/yıl D1'de | D1 ücretsiz planda yıllarca sorun olmaz, arşiv değeri yüksek | Kullanıcı kararı |
| 2026-08-13 | K13 W1 auth | CF API Token (D1_ACCESS_TOKEN), OAuth refresh kaldırılır | OAuth token rotation env'de bayat kalıyor; API token 401 üretmez, refresh gerekmez | W1 canlı hata |
| 2026-08-13 | K14 Şablon çıktısı | `kap_analysis`'te `source="template"` ile saklanır; AI ile karışmaz; frontend "otomatik özet" rozeti | Tek kaynak, maliyet sıfır, denetlenebilir | Claude strateji |
| 2026-08-13 | K15 Yanlış negatif önceliği | Kaçırma > gereksiz analiz; eşikler agresif (eskalasyon listesi K3'e atlar) | Önemli bildirimi kaçırmak güven kaybı yaratır | Claude strateji |
| 2026-08-13 | K16 PDF kullanımı | Yalnız K3 + sayı-ağırlıklı kategoriler; 8K truncate + (ops) sayısal özet, ham metin değil | Token maliyeti ve kalite dengesi | Claude strateji |
| 2026-08-13 | K17 Sentez tasarımı | Seçim/sıralama deterministik (kodda); LLM girdi = damıtılmış one-liner listesi | Maliyet ~1.5K token/gün, deterministik doğruluk | Claude strateji |
| 2026-08-13 | K18 Takip listesi | Anonim localStorage ile başlar; push/login ayrı faz | Kullanıcı sistemi yok, hızlı değer | Kullanıcı kararı |
| 2026-08-13 | K19 W3 analiz kontrolü | "Analiz edilmiş" = `source IN ('auto','ondemand')`; template kayıtları LLM analizini bloklamaz | Şablon özeti dolu kayıt K2/K3'e ihtiyaç duyabilir | S9/S10 entegrasyon |
| 2026-08-13 | K20 K3 modeli | `gemini-2.5-pro` yeni hesaplara kapalı (404) → `gemini-3.1-pro-preview` (MODEL_HIGH) | Canlı 404 hatası | W3 layer testi |
| 2026-08-13 | K21 Ara secret | W2 `CLASSIFY_W3_SECRET` = W3 `W3_SECRET` = `w3s-kap-2026` | Tutarlılık + test edilebilirlik | W3 layer testi |
| 2026-08-13 | K22 W1 PDF otomatik | `_run_refresh` `--days 2 --pdf`; pdf_pipeline idempotent (pdf_text doluysa atla) | 10dk cron'da tekrar çekim önlemi | S10-5 |