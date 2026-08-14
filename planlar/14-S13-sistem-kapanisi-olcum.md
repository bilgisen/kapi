# S13 — Strateji-5: Sistem Kapanışı + Ölçüm

- Durum: faz 1-3 tamam, faz 2 doğrulaması kullanıcı kontrolünde (2026-08-14)
- Bağımlılık: S9-S12 (canlı zincir)
- Repo: kap + hono + tanstack

## 1. Amaç
Canlı sistemin sağlığını doğrulamak, açık doğrulamaları kapatmak ve okunma verisi toplamaya başlamak. Push kanalı (S14) bu veriyle yönlendirilecek.

## 2. Kapsam Dışı
- S14 Anonim Web Push (ayrı plan — tıklama verisi biriktikten sonra)
- BIST100 dışı LLM analizi (Yol C — kullanıcı davranışı sonrası)
- Hesap sistemi / çoklu cihaz

## 3. Fazlar

### Faz 1 — Sistem sağlık kontrolü ✅ (2026-08-14)
- D1: son 7 gün 2603 analiz, kapsam %100; template oranı %42 (hedef %40-50 ✓)
- Feed yanıtı 1.1-1.3s, KV cache çalışıyor (miss→kv)
- Skorsuz: 1/2603
- **Kritik bug bulundu ve onarıldı**: auto analizlerde özet kaybı
  - Semptom: BIST100 auto'ların yalnız ~%33'ü özetli (13.08: 28/121, 14.08: 24/72)
  - Kök neden: W2 /ingest önce D1'e özetsiz satır yazar, sonra W3'ü tetikler; W3 başarısızsa (rate limit/bozuk JSON, 3 kısa retry) satır kalıcı özetsiz kalır — W2 yalnız `disclosure_index IS NULL` olanları yeniden işler (yeniden deneme yok)
  - Kayıp boyutu: 7 kritik bildirim (ŞOK skor 9 birleşme, GS skor 8, ENERVA×3/TÜRKİŞ/OYAK skor 5)
  - Düzeltme 1 (kod): W2 pending sorgusuna self-heal koşulu eklendi — `(a.source='auto' AND a.summary_tr IS NULL AND a.importance_score>=5 AND n.is_bist100=1)` → başarısız auto'lar sonraki ingest'te yeniden işlenir (deploy fa8f9741)
  - Düzeltme 2 (veri): 7 kaybın tamamı W3 /auto ile backfill edildi (kayıp 0; ŞOK 301ch, GS 288ch)
  - Not: "JSON bloğu bulunamadı" geçici model bozuk çıktısı (yeniden deneme ile çözülüyor) — self-heal yeterli güvence
- Not: BIST100 dışı auto'lar bilinçli özetsiz (S10 maliyet kararı) — feed'de subject gösterilir

### Faz 2 — Açık doğrulamalar (kullanıcı kontrolü bekliyor)
- S9: 50 rastgele şablon eşleşmesi → `planlar/dogrulama/S9_orneklem_50_template.txt` (hedef yanlış eşleşme ≤ %5)
- S10-6: 5 K2 + 3 K3 (pro) → `planlar/dogrulama/S10_orneklem_K2_K3.txt`
- Bulgu: K3 (pro) katmanı pratikte neredeyse hiç kullanılmıyor (7 günde 3 analiz; yalnız skor≥8 BIST100) — maliyet açısından iyi, örneklem için az

### Faz 3 — Tıklama logu ✅ (2026-08-14)
- Hono: `POST /api/clicks` (anonim; `feed_card|detail|daily_view|daily_item`; disclosure_index opsiyonel yalnız daily_view için) → D1 `clicks` tablosu (deploy 14bfcc9a)
- TanStack: `getAnonId()` (localStorage `hissepro_anon_id`), `logKAPClick()` fire-and-forget
  - feed kart tıklaması → `feed_card`
  - detay sayfası mount → `detail`
  - /gunsonu açılışı → `daily_view` (item'larda disclosure_index yok — item logu atlandı)
- Doğrulama: POST 200 + D1 kaydı ✓; bundle'da marker'lar doğrulandı (ilk deploy build'sizdi — `npm run build` sonrası d479db10)
- Raporlama: D1 sorgularıyla (kategori/skor bazlı okunma) — kullanıcıya basit özet script'i sunulacak

### Faz 4 — Doküman ✅
- ANA-PLAN güncellendi (S9-S12 durumları + S13/S14 satırları)
- S14 push taslağı ayrı plan dosyasında

## 4. Görev Listesi
- [x] S13-1 Sağlık kontrolü (D1 metrikleri + feed perf + örnek okuma)
- [x] S13-2 W2 self-heal (başarısız auto yeniden işleme) + deploy
- [x] S13-3 7 kayıp backfill + doğrulama (kayıp 0)
- [x] S13-4 S9 örneklem (50) çıkar — kontrol kullanıcıda
- [x] S13-5 S10-6 örneklem (5 K2 + 3 K3) çıkar — kontrol kullanıcıda
- [x] S13-6 /api/clicks + D1 tablo + tanstack log entegrasyonu + deploy

## 5. Karar Kayıtları
- 2026-08-14 K25: W2 yalnız yeni bildirimleri değil, "özetsiz skor≥5 BIST100 auto" satırları da yeniden işler (self-heal); W3 başarısızlığı artık kalıcı kayıp değil
- 2026-08-14 K26: Tıklama logu anonim (localStorage id), hesap gerekmez; gün sonu madde tıklamaları için sentez item'larına disclosure_index eklenmesi gerektiğinde ayrı iş

## 6. Doğrulama / Kabul Kriterleri
- [x] Kayıp analiz = 0; feed'de özetler dolu
- [ ] S9 örneklem: yanlış eşleşme ≤ %5 (kullanıcı onayı bekliyor)
- [ ] S10-6 örneklem: K2/K3 kalite onayı (kullanıcı onayı bekliyor)
- [x] Clicks: canlı site tıklamaları D1'de birikiyor

## 7. Deploy
- kap (W2): fa8f9741 (self-heal)
- hono: 14bfcc9a (/api/clicks)
- tanstack: d479db10 (log entegrasyonu, build'li)

## 8. Sonraki Adım
- Kullanıcı S9/S10-6 kontrol sonuçları → varsa düzeltmeler
- 1-2 hafta tıklama verisi topladıktan sonra okunma raporu (script) → S14 push önceliği
