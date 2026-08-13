# S10 — Strateji-2: Hibrit Eşik + Katmanlı AI (K2/K3)

- Durum: **tamamlandı (Faz 1-3 kod + deploy; S10-6 doğrulama kaldı)**
- Bağımlılık: S9 (template kapsamı), S8 (veri kalitesi)
- Repo: kap

## 1. Amaç
Kural motoruna güvenmeden önemli bildirimleri kaçırmayan, maliyeti kontrollü bir AI katmanı: kategori bazlı zorunlu minimum katman + kriz kelime listesi ile K3'e atlama + skor/sınıflandırmaya göre model seçimi (K2 flash / K3 pro+pdf).

## 2. Kapsam Dışı
- Kullanıcı davranışı geri beslemesi (S10 faz 3 opsiyon — ayrı plan gerektirirse ertelenir)
- Gün sonu sentez (S11)

## 3. Fazlar

### Faz 1 — Eşik kuralları (W2)
- Kategori bazlı zorunlu katman: FINANCIAL_REPORT, CAPITAL_INCREASE, DIVIDEND, MERGER_ACQUISITION, BOND_ISSUE, AUDIT, CREDIT_RATING → skor ne olursa olsun en az K2
- Eskalasyon kelime listesi → K3: iflas, SPK soruşturma, el koyma, işlem durdurma, yönetim kurulu istifa, kredi notu düşüşü, delist, pay devri (kontrol değişikliği)
- Çıktı: classification'a `layer: 2 | 3` alanı
- Doğrulama: backfill verisinde layer dağılımı raporu

### Faz 2 — W3 katman desteği
- /auto'ya `layer` parametresi: K2=flash+subject/body, K3=pro+pdf_text
- Mevcut kapsam (is_bist100 && skor>=5) yerine layer kararına geçiş
- Doğrulama: K2 ve K3 örnek analizler doğru model ve girdiyle üretiliyor

### Faz 3 — W1 otomatik PDF (K3 adayları)
- K3 eşiğini geçen bildirimler için W1 koşusunda `--pdf` davranışı tetiklenir (kategoriye göre)
- pdf_text 8K truncate (mevcut sınır), sayısal tablo özeti opsiyonel (Claude önerisi — ilk adımda ham metin)
- Doğrulama: K3 analizlerin %80+ pdf_text ile üretilmesi

## 4. Görev Listesi
- [x] S10-1 rules.ts'e layer hesaplama (kategori zorunluluğu + eskalasyon)
- [x] S10-2 eskalasyon kelime listesi (ilk ~20 terim)
- [x] S10-3 W2 /ingest çıktısına layer dahil
- [x] S10-4 W3 /auto layer parametresi + model/girdi seçimi
- [x] S10-5 W1 _run_refresh'te K3 adayları için PDF çekimi (--pdf idempotent)
- [ ] S10-6 Canlı örneklem doğrulama (10 bildirim: 5 K2, 5 K3)

## 5. Karar Kayıtları
- 2026-08-13 K15: Yanlış negatif (kaçırma) > yanlış pozitif (gereksiz analiz) — eşikler agresif
- 2026-08-13 K16: PDF tam metni değil, 8K karakter + (opsiyonel) sayısal özet prompt'a girer
- 2026-08-13 K20: `gemini-2.5-pro` yeni hesaplara kapalı (404) → K3 modeli `gemini-3.1-pro-preview` (MODEL_HIGH env güncellendi)
- 2026-08-13 K21: W2/W3 ara secret tutarlılığı — `W3_SECRET` ve `CLASSIFY_W3_SECRET` `w3s-kap-2026` olarak yeniden set edildi

## 6. Doğrulama / Kabul Kriterleri
- [ ] Layer dağılımı: K2 ~%20-30, K3 ~%10-15
- [ ] Kriz bildirimleri (manuel 10 örnek) K3'e düşüyor
- [ ] K3 analizlerin %80+ pdf_text girdili
