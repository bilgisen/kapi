# Knowledge Log (Local) — investapi

Bu dosya, Byterover/MCP memory erişimi kapalıyken veya auth sorunlu iken, proje içinde kalıcı “karar / keşif / teknik borç / yapılacaklar” kaydı tutmak için kullanılır.

---

## 2026-02-11 — Temel Analiz (Rasyolar + Benchmark + Trend) mimari keşif ve riskler

### Kapsam
- UI: `investo/app/sirketler/[ticker]/temel-analiz/*`
- Next.js API proxy: 
  - `investo/app/api/ratios/compare/[ticker]/route.ts`
  - `investo/app/api/ratios/compare/[ticker]/trend/last/route.ts`
- FastAPI backend:
  - `api/routers/compare.py` (`/api/compare/{ticker}`, `/trend`, `/trend/last`)
- Core logic:
  - `services/compare_service.py`
  - ratio/benchmark scripts:
    - `scripts/calculate_sector_benchmarks.py`
    - `scripts/materialize_company_ratios.py`
- DB migrations:
  - `scripts/migrate_sector_ratio_stats.py`
  - `scripts/migrate_company_ratio_values.py`

### Veri akışı (özet)
1) `scripts/calculate_sector_benchmarks.py`
   - Şirket rasyolarını hesaplar (TTM + quarter)
   - `sector_ratio_stats` tablosuna (median/p25/p75/count) upsert eder
2) `api/routers/compare.py`
   - `services/compare_service.py` üzerinden compare/trend payload üretir
3) Next.js API routes
   - FastAPI’yi çağırır, Redis cache uygular, frontend formatına map eder
4) UI
   - `GostergelerTrendChartsClient.tsx` / `GostergelerTrendTableClient.tsx`
   - QoQ/YoY badge’leri ve sektör/endeks medyan kıyasları

### Kritik riskler / teknik borç
- **`sector_ratio_stats` şemasında `currency` ve `report_type` alanları yok**
  - API parametre kabul ediyor ama tablo tekil anahtarda bu boyutlar yok.
  - Şu an TL/standart varsayımıyla idare ediyor, genişleme için risk.
  - Kaynak: `scripts/migrate_sector_ratio_stats.py`

- **`services/compare_service.py` içinde revenue pattern listesinde bozuk/garip karakterli bir string satırı gözlendi**
  - Runtime/sessiz veri bozulması riski.
  - Temizlenmesi ve test ile korunması gerekiyor.

- **ROE/ROA hesapları average-balance yerine dönem sonu bilanço ile yapılıyor**
  - Teknik doğruluk sorunu (net_income_ttm / equity_end).
  - Düzeltme: (end + prev_end)/2 ortalama bilanço.
  - Kaynak: `scripts/calculate_sector_benchmarks.py` (calculate_company_ratios_ttm)

- **Quick ratio stok None ise 0 kabul ediyor**
  - İyimser bias.
  - Düzeltme: stok yoksa quick ratio None.

- **Benchmark istatistiklerinde std dev yok**
  - z-score, “kaç sigma sapma” yorumları yapılamıyor.

### Onaylanan geliştirme başlıkları (TODO)
- Kritik bugfix: `compare_service.py` bozuk pattern temizliği
- Doğruluk: ROE/ROA average-balance + quick ratio stok None
- Yeni metrik: ROIC (vergi/EBT mapping + hesaplama + katalog/UI)
- Benchmark upgrade: std dev/mean/min/max + `currency/report_type` kolonları
- Explainability: ratio method/coverage/warnings (AI context + UI rozet)

---

## 2026-02-11 — Uygulanan düzeltmeler: ROE/ROA doğruluğu + ROIC eklenmesi

### Değişiklikler
- `services/compare_service.py`
  - Sigorta prim gelirleri revenue fallback listesinde bozuk/garip karakterli pattern temizlendi.
  - `pretax_income_account_id` ve `tax_expense_account_id` eşlemesi eklendi.
  - `_resolve_account_ids()` dönüşüne bu iki ID eklendi.
  - `calculate_company_ratios_ttm/quarter` çağrılarına iki yeni argüman geçirildi.

- `scripts/calculate_sector_benchmarks.py`
  - **ROE**: `net_income_ttm / avg_equity` (avg equity = (end + prev_end)/2) olacak şekilde düzeltildi.
  - **ROA**: `net_income_ttm / avg_total_assets` (avg assets) olacak şekilde düzeltildi.
  - **Quick ratio**: stok (`inventory`) yoksa `0` varsaymak yerine `None` döndürür.
  - **ROIC** eklendi:
    - NOPAT ≈ `EBIT * (1 - effective_tax_rate)`
    - effective_tax_rate ≈ `tax_expense_ttm / pretax_income_ttm` (yoksa fallback %22)
    - Invested capital (basit) ≈ `equity + net_debt`
  - Script içindeki compute çağrılarına `net_interest_income_account_id`, bank loan/deposit/NPL ve **pretax/tax** argümanları geçirildi.

- `scripts/materialize_company_ratios.py`
  - ROIC için gerekli `pretax_income_account_id` ve `tax_expense_account_id` argümanları ratio compute çağrılarına eklendi.

- `api/ratios/ratio_catalog.json`
  - `roic` ratio meta eklendi (format=percent, ttm=true)
  - Finans sektörleri için applicability exclude: `bankacilik`, `sigorta`, `varlik-yonetim`, `fin-kiralama-ve-faktoring`

### Hızlı kontroller
- `python3 -m py_compile` ile ilgili dosyalar derleme kontrolünden geçirildi.

