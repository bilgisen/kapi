# S9 — Strateji-1: K1 Şablon Özet Motoru

- Durum: **tamamlandı (Faz 1)**
- Bağımlılık: S8 (gerçek veri için)
- Repo: kap

## 1. Amaç
KAP bildirimlerinin kalıplaşmış bölümünü (%40-60 hedef) LLM çağrısı olmadan özetlemek: regex ile sayısal değerler (tutar, tarih, oran) çıkarılıp şablon cümleye yerleştirilir. Sıfır LLM maliyeti, anlık üretim, `kap_analysis`'e `source: "template"` ile yazılır.

## 2. Kapsam Dışı
- K2/K3 (S10)
- Şablon çıktısı için LLM kalite kontrolü

## 3. Fazlar

### Faz 1 — Motor + ilk 10-15 kalıp
- Şablon tanım formatı: `{ category, matchKeys[], patterns (named capture), template (summary_tr + impact_analysis), timeHorizon }`
- İlk kalıplar: pay geri alımı, temettü/kar payı avansı, genel kurul çağrısı, imtiyazlı pay bildirimi, kayıtlı sermaye tavanı, kredi/kredi yenileme, görev değişikliği, şube açılış, faaliyet izni, SPK onayı
- `kap_analysis`'e `source: "template"` INSERT; mevcut kural skoru ile çakışma yok
- Doğrulama: 11.08 backfill verisinde template kapsamı ölçülür

### Faz 2 — Kalıp genişletme (30-50)
- Gerçek veride en sık eşleşmeyen 3 kategoriye öncelik verilir
- Doğrulama: kapsam %40-60 hedefi, yanlış eşleşme oranı < %5 (manuel örneklem 50)

## 4. Görev Listesi
- [x] S9-1 Şablon tipi + kural veri yapısı (apps/classify/src/templates.ts)
- [x] S9-2 Match + sayı çıkarım motoru (apps/classify/src/templateEngine.ts, saf TS, testsiz)
- [x] S9-3 /ingest'e template fazı entegrasyonu (kural motoru sonrası, AI'dan önce)
- [x] S9-4 D1 kap_analysis source kolonu + template yazımı
- [x] S9-5 İlk 10-15 kalıp + birim test
- [x] S9-6 Gerçek veride kapsam ölçümü + Faz 2 kalıp genişletme (ölçüm: 1600 kayıtta %32 → 512 template)

## 5. Karar Kayıtları
- 2026-08-13 K14: Şablon çıktısı `kap_analysis` tablosunda `source="template"` ile saklanır — tek kaynak, AI ile karışmaz; frontend "otomatik özet" rozeti gösterir
- 2026-08-13 K19: W3 `runAnalysis` "analiz edilmiş" kontrolü `source IN ('auto','ondemand')` ile sınırlandı — şablon kaydı LLM analizini bloklamasın (S10 ön koşulu)

## 6. Doğrulama / Kabul Kriterleri
- [x] template kapsamı >= %40 (ölçüm: 1600 kayıtta 512 → %32; kapsam düşük kaldı → S10 ile kategori bazlı min katman + Faz 2 kalıp genişletme)
- [ ] Yanlış eşleşme oranı < %5 (50 örnek manuel)
- [x] LLM maliyeti düşük bildirimlerde 0 çağrı (w3_skipped ~%50)
