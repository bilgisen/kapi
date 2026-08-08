# S5 — Frontend (TanStack)

- Durum: başlamadı
- Bağımlılık: S4
- Repo: tanstack (mevcut repo, değişiklik burada yapılır)

## 1. Amaç
Bildirimler için iki ekran: genel feed sayfası (gerçek zamanlı "Bugünün önemli bildirimleri" + filtreler) ve şirket sayfasının "bildirimler" sekmesi. Her karta AI özet, skor etiketi, PDF linki; detay görünümünde tam AI analizi.

## 2. Kapsam Dışı
- Backend endpoint'leri (S4)
- Chatbot entegrasyonu (S6)
- E-posta/push bildirim sistemi (ilk aşamada)

## 3. Fazlar

### Faz 1 — API hook'ları ve tiplemeleri
- `src/lib/useKAPData.ts`: `useKAPFeed`, `useKAPCompany(ticker)`, `useKAPDetail`
- Tipler: KAPNotification, KAPAnalysis, KAPFilter.
- API_CONFIG'e kapi base (hono üzerinden /api/notifications).
- Doğrulama: hook'lar mock backend ile çalışıyor.

### Faz 2 — Genel feed sayfası
- Yol: `/bildirimler` (yeni route) + nav'a link.
- Üst banner: "Bugünün önemli bildirimleri" (BIST100, skor>=7, son 24sa).
- Filtreler: **Tümü / BIST100 chip**, önem, kategori, sektör, şirket arama.
- Kart: logo, ticker (BIST100 rozeti), tür, skor etiketi, özet, zaman, PDF link ikonu, **"AI analiz" butonu (K11 — analiz yoksa buton, tıklanınca sonuç kartı)**.
- Skeleton, boş durum, hata durumu, sayfalama/yükleme.
- Doğrulama: SSR + client tarafı filter'ları çalışıyor.

### Faz 3 — Şirket sayfası sekmesi
- Yol: `/hisse/:ticker/bildirimler` (TABS'e ekle + route dosyası).
- Şirket bildirim listesi, son finansal raporu öne çıkarılan kart.
- Düzeltme/geç bildirim etiketleri.
- Doğrulama: GARAN/THYAO gibi örnekler de dolu.

### Faz 4 — Detay görünümü
- Yol: `/bildirimler/:disclosureId` (veya modal).
- AI analizi: özet, etki analizi, anahtar rakamlar kartı, duyarlılık.
- "Orijinal PDF" linki (KAP) + kayıt bilgileri.
- Düzeltme zinciri görünümü (düzeltiyorum).
- Doğrulama: tüm alanlar render ediliyor, PDF linki yeni sekme.

### Faz 5 — Bileşen iyileştirmeleri
- Paylaşılan bileşenler: `KapNotificationCard`, `ImportanceBadge`, `KAPDetail`.
- SSR/tanstack query cache tracing, error boundary.
- Doğrulama: y akses testleri.

## 4. Görev Listesi
- [ ] S5-1 Hook'lar ve tipler
- [ ] S5-2 /bildirimler feed sayfası (tüm bildirimler + BIST100 chip + AI butonu) + nav linki
- [ ] S5-3 /hisse/:ticker/bildirimler sekmesi (TABS + route)
- [ ] S5-4 Detay görünümü (/bildirimler/:disclosureId)
- [ ] S5-5 Ortak bileşenler + durum/mobil iyileştirmeleri

## 5. Kararlar
- Route deseni: `/bildirimler` ve `/hisse/:ticker/bildirimler` (jetborsa.com/hisse/ykbnk/bildirimler hedefle).
- Detay: ayrı route (modal değil) — paylaşılabilirlik için.

## 6. Kabul Kriterleri
- [ ] Feed sayfasındaki filtreler sunucu ve client'ta çalışıyor
- [ ] Şirket sekmesi boş değil (yeni günden bildirim varsa)
- [ ] Detay sayfasında AI analiz + PDF linki + düzeltme bilgisi görünüyor
- [ ] Mobilde kartlar okunaklı, cdrıntıdar