# S12 — Strateji-4: Takip Listesi

- Durum: başlamadı
- Bağımlılık: S10 (analiz altyapısı)
- Repo: hono + tanstack

## 1. Amaç
Kullanıcının portföyündeki hisselere özel akış + vurgu: "hissemi etkiler mi" sorusunu doğrudan çözmek. Anonim başlar (localStorage); push kanalı kullanıcı sistemi gerektirdiğinden kapsam dışı.

## 2. Kapsam Dışı
- Hesap sistemi, login, push bildirim (ileride)
- Portföy değerleme/kar hesaplama

## 3. Fazlar

### Faz 1 — Takip listesi (localStorage)
- Takip ekle/çıkar (hisse kodu), `localStorage`'ta saklama (kap:takip)
- "Takipte" sekmesi: yalnız takip edilen ticker'ların bildirimleri
- Doğrulama: sekmeler + kalıcılık (refresh sonrası)

### Faz 2 — Feed vurgusu
- Takip edilen hisselerin bildirimleri feed'de vurgulu (chip/kenarlık)
- "Takipte" filtresi mevcut filtrelerle birleşir
- Doğrulama: karışık feed'de vurgu görünüyor

### Faz 3 — İzleme (opsiyonel)
- Tıklama oranı loglama altyapısı (kategori/skor bazlı) → S10 kalibrasyon girdisi
- Doğrulama: veri toplanıyor

## 4. Görev Listesi
- [ ] S12-1 localStorage takip hook'u (tanstack)
- [ ] S12-2 Takipte sekmesi + filtre
- [ ] S12-3 Feed vurgu bileşeni
- [ ] S12-4 (ops) tıklama logu endpoint'i

## 5. Karar Kayıtları
- 2026-08-13 K18: Takip listesi anonim localStorage ile başlar; push/login ayrı faz

## 6. Doğrulama / Kabul Kriterleri
- [ ] Takip ekle/çıkar + kalıcılık
- [ ] Takipte sekmesi yalnız ilgili bildirimleri gösterir
- [ ] Feed'de vurgu görünür
