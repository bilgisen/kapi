# S12 — Strateji-4: Takip Listesi

- Durum: tamamlandı (Faz 1-2, 2026-08-14; Faz 3 kapsam dışı)
- Bağımlılık: S10 (analiz altyapısı)
- Repo: hono + tanstack

## 1. Amaç
Kullanıcının portföyündeki hisselere özel akış + vurgu: "hissemi etkiler mi" sorusunu doğrudan çözmek. Anonim başlar (localStorage); push kanalı kullanıcı sistemi gerektirdiğinden kapsam dışı.

## 2. Kapsam Dışı
- Hesap sistemi, login, push bildirim (ileride)
- Portföy değerleme/kar hesaplama
- S12-4 tıklama logu (push/kullanıcı sistemi ile birlikte gelecek — K18 kararıyla aynı çizgi)

## 3. Fazlar

### Faz 1 — Takip listesi (localStorage) ✅
- Mevcut `useWatchlistStore` (Zustand + localStorage `hissepro_watchlists`) üzerine kuruldu — yeni hook `useTrackedSymbols()` (tüm listelerdeki hisse sembolleri Set'i)
- "Takipte" sekmesi: feed'de yalnız takip edilen ticker'ların bildirimleri (hono `stocks=` çoklu filtre)
- Doğrulama: `GET /api/notifications?stocks=THYAO,TUPRS` → yalnız eşleşenler ✓; sekme kalıcı (localStorage) ✓

### Faz 2 — Feed vurgusu ✅
- Takip edilen hisselerin bildirimleri feed'de "Takip" çipi + primary kenarlıkla vurgulanıyor
- "Takipte" filtresi mevcut filtrelerle (kategori/önem/BIST100) birleşiyor
- Doğrulama: karışık feed'de vurgu görünüyor ✓ (canlı deploy sonrası)

### Faz 3 — İzleme (kapsam dışı — ileride)

## 4. Görev Listesi
- [x] S12-1 localStorage takip hook'u (tanstack) — `useTrackedSymbols`
- [x] S12-2 Takipte sekmesi + filtre (hono `stocks=` + tanstack buton)
- [x] S12-3 Feed vurgu bileşeni (çip + kenarlık)
- [ ] S12-4 (ops) tıklama logu endpoint'i — kapsam dışı

## 5. Karar Kayıtları
- 2026-08-13 K18: Takip listesi anonim localStorage ile başlar; push/login ayrı faz
- 2026-08-14 K24: Feed yanıtına `tickers` alanı eklendi (sayfa-içi 25 bildirim için tek `IN` sorgusu) — kart vurgusu istemcide eşleştirilir; sunucu filtresi `stocks=` (json_each deseni, index/sector ile aynı)

## 6. Doğrulama / Kabul Kriterleri
- [x] Takip ekle/çıkar + kalıcılık (mevcut store)
- [x] Takipte sekmesi yalnız ilgili bildirimleri gösterir
- [x] Feed'de vurgu görünür

## 7. Deploy
- hono: f28f461a (stocks filtresi + tickers alanı)
- tanstack: b7c64168 (Takipte sekmesi + vurgu)
