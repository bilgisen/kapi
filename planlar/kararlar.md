# Karar Kaydı (Decision Log)

Merkezi karar günlüğü. Her kritik karar tek satır + tarih + gerekçe.

| Tarih | Karar | Seçim | Gerekçe | Kaynak |
|---|---|---|---|---|
| 2026-08-08 | K1 Veri kaynağı | KAP public JSON API (auth'suz) kazandı; MKK VYK ulaşılamıyor (gateway apinizer hepsi OpenAPI spec döner, ücretli/üretim aboneliği gerekir) | Spike S0-4: tüm endpoint'ler doğrulandı, özet alanı dolu | docs/spike-kap-api.md |
| 2026-08-08 | K2 Kapsam | Yalnızca BIST 100 | Yatırımcıların çoğu ilgileniyor; maliyet/yük azalır | Kullanıcı kararı |
| 2026-08-08 | K3 Önem skoru | Kural tabanlı 1-10 | Deterministik, ucuz, debuggable | Claude notu sağlaması |
| 2026-08-08 | K4 Düşük skorlu özet | KAP'ın kendi summary metni | Sıfır AI maliyeti, resmi kaynak | Kullanıcı kararı |
| 2026-08-08 | K5 Yüksek skorlu AI | Gemini; skor>=8 pro model | Maliyet/tutarlılık dengesi | Claude notu sağlaması |
| 2026-08-08 | K6 DB | Cloudflare D1 (kapi-db) | Worker ekosistemi, ücretsiz seviye, KV desteği | Kullanıcı kararı |
| 2026-08-08 | K7 Barındırma | W1 FastAPICloud (Python), W2/W3 CF Workers | pdfminer Workers'da çalışmaz | Teknik kısıt |
| 2026-08-08 | K8 Repo | /kap monorepo + GitHub bilgisen/kap | Bağımsız geliştirme | Kullanıcı kararı |
| 2026-08-08 | K9 Chatbot | Ayrı alt plan (S6) | Karmaşıklığı ertelemek | Kullanıcı kararı |
| 2026-08-08 | K10 Frontend | PDF için KAP orijinal linki | Ziyaretçiler orijinali inceleyebilsin | Kullanıcı kararı |