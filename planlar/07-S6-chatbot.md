# S6 — Chatbot Entegrasyonu

- Durum: başlamadı
- Bağımlılık: S4 (context endpoint'leri), S5 (sayfalar)
- Repo: hono + tanstack

## 1. Amaç
Chatbot'un KAP bildirimleri bağlamını kullanmasını sağlamak: genel feed context'i ("bugün ne oldu?") ve şirket sayfasına özel context (`sirket:X:bildirimler`). Kullanıcılar bildirimler hakkında soru sorabilir, AI yanıtlarını bildirimlerden besler.

## 2. Kapsam Dışı
- Yeni AI üretimi (S3 zaten context üretiyor)
- JetToken metering tasarımı (bu planda sadece entegrasyon)

## 3. Fazlar

### Faz 1 — Context akışı
- Hono ai-chat.js: `sirket:${TICKER}:bildirimler` context tipi tanı -> KAPI context endpoint'ini çağır.
- Genel feed sayfasında context `kap:feed` (yeni tip) -> feed context endpoint.
- On-demand analizler (K11) de context'e dahil edilir (analiz varsa özeti kullanılır).
- Context string'i system prompt'a eklenir (özet + önemli bildirimler).
- Doğrulama: sohbet oturumunda bildirim bilgisi sorulan soruya cevap veriyor.

### Faz 2 — Suggestion'lar
- `src/lib/pageContextSuggestions.ts`: `bildirimler` ve feed için suggestion örnekleri:
  - "Bugün hangi şirketler önemli bildirim yayınladı?"
  - "Bu şirketin son bildirimleri ne?"
- ChatPanel `tryNavigateFromSuggestion`'a /bildirimler yönlendirmesi ekle.
- Doğrulama: öneri tıklanınca doğru sayfa/context.

### Faz 3 — Yönlendirmeler ve function calling
- "bildirim", "temettü", "genel kurul" anahtar kelimelerinde KAP context'i öncelikli.
- İstenirse function calling eklenmek (Şirket bildirim listesi çağrısı) — opsiyonel.
- Doğrulama: kullanıcı sorusu "YKBNK son bildirimler" -> şirket context'i kullanılıyor.

### Faz 4 — Usage/metering (opsiyonel)
- `usage` alanı zaten döner; metering (JetToken) tasarımı Hono auth/credits ile.
- Doğrulama: ücretli tier'da çalışıyor, public'te kısıtlı.

## 4. Görev Listesi
- [ ] S6-1 Hono context tipleri (bildirimler / kap:feed)
- [ ] S6-2 Context endpoint çağrıları ai-chat.js'ye
- [ ] S6-3 pageContextSuggestions güncellemesi
- [ ] S6-4 ChatPanel navigate güncellemesi
- [ ] S6-5 Function calling (opsiyonel) + testler
- [ ] S6-6 JetToken metering (opsiyonel)

## 5. Kararlar
- Context tipleri mevcut formatla uyumlu: `sirket:TICKER:bildirimler`, `kap:feed`.
- S6-4/5/6 opsiyonel — ilk yayında atlanabilir.

## 6. Kabul Kriterleri
- [ ] "Bugün ne oldu?" sorusuna önemli bildirimlerle cevap
- [ ] Şirket sayfası sekmesinde chatbot bildirim bağlamına sahip
- [ ] Suggestion'lardan bildirim sayfalarına geçiş çalışıyor