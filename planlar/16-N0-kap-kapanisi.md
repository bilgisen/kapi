# N0 — KAP Sistem Kapanışı

- Durum: aktif (2026-08-14)
- Bağımlılık: S0-S13 (tamamlandı)
- Repo: kap

## 1. Amaç
KAP bildirim platformunun v1 geliştirmesini resmi olarak kapatmak: durum dokümanı, metrikler, bilinen sınırlamalar ve fine tuning backlog'u netleştirmek. KAP "bakım modu"na girer; yeni geliştirmeler N4'te planlanır.

## 2. Çıktılar
- [x] `docs/KAP-SISTEMI-DURUMU.md` — mimari, veri modeli, canlı metrikler, sınırlamalar, operasyonel notlar
- [x] ANA-PLAN güncellemesi (S durumları + N şemsiye satırları)
- [x] Şemsiye plan dosyaları (17-N1, 18-N2, 19-N3, 20-N4)

## 3. Fine Tuning Backlog (N4'te işlenecek, öncelik sıralı)
| # | Konu | Durum | Not |
|---|---|---|---|
| FT-1 | Şablon kapsamı %42 → %50 hedefi (yeni kalıplar) | açık | BIST100 dışı gürültü azalır |
| FT-2 | S9 örneklem sonucu (50, yanlış eşleşme ≤ %5) | kullanıcı kontrolünde | dosya: planlar/dogrulama/S9_orneklem_50_template.txt |
| FT-3 | S10-6 örneklem sonucu (5 K2 + 3 K3) | kullanıcı kontrolünde | dosya: planlar/dogrulama/S10_orneklem_K2_K3.txt |
| FT-4 | K3 (pro) katmanı kullanımı (7 günde 3 analiz) | açık | skor≥8 eşiği — okunma verisiyle yeniden değerlendir |
| FT-5 | BIST100 dışı özetsiz kartlar (S10 maliyet kararı) | açık | okunma raporu karar verecek |
| FT-6 | Okunma kalibrasyonu (clicks verisi ≥100 tık sonra) | açık | scripts/okunma_raporu.py |
| FT-7 | "JSON bloğu bulunamadı" model bozuk çıktıları | izleniyor | W2 self-heal (K25) yeterli güvence |

## 4. Kabul Kriterleri
- [x] Doküman commit'lenir; KAP üzerinde yeni özellik çalışması durdurulur (N4 hariç)
- [x] Tüm açık işler backlog'da kayıtlı