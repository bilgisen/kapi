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