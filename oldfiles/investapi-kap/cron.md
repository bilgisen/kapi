# Cron / Scheduler Planı (Borsa Kapanışı Sonrası)

Bu doküman, borsa kapanışı sonrası (TR saatine göre) veri çekimlerinin ve türetilmiş metrik üretimlerinin nasıl zamanlanacağını ve farklı altyapı seçenekleriyle (GitHub Actions, Cloudflare, cron-job.org vb.) nasıl çalıştırılacağını özetler.

## Hedef

- Günlük veri çekimlerini **borsa kapandıktan sonra** (örn. TR ~18:00 civarı) çalıştırmak.
- Gün içinde gecikmeli/geri-düzeltmeli yayınlar olabildiği için **son N günü yeniden upsert** ederek eksik günleri tolere etmek.
- Job’lar idempotent olmalı (tekrar çalıştırmak sorun çıkarmamalı).

## Önerilen zamanlama

- **Kapanış sonrası ana batch:** her iş günü TR saatiyle **18:05** (veya 18:10).
- **Opsiyonel ikinci koşu:** TR **19:30** (bazı kaynaklarda gecikme olursa).
- **Haftalık türetilmiş veriler:** Pazar gecesi / Pazartesi sabahı düşük trafikte.

Not: BIST kapanış saati ve veri sağlayıcı güncellemeleri dönemsel değişebilir. Bu yüzden “kapanış + 5-10 dk” yaklaşımı güvenli.

## Cron Job Kataloğu (tümü)

### A) Günlük: İş Yatırım HisseTekil (fiyat + PD/HAO_PD vb.)

Amaç:
- `isyatirim_hisse_tekil_daily` + `price_bars` tablolarını günlük güncellemek.
- Valuation hesaplarında market cap gibi alanların güncel kalması.

Komut (günlük incremental, önerilen):

```bash
python3 scripts/ingest_isyatirim_hisse_tekil.py --xu100 --incremental-days 7
```

Komut (backfill / ilk kurulum):

```bash
python3 scripts/ingest_isyatirim_hisse_tekil.py --xu100 --startdate 01-01-2024
```

### B) Günlük: Market Snapshot (market_snapshots tablosu)

Amaç:
- `market_snapshots` tablosunu güncellemek (son fiyat, hacim, equity vb.).

Not:
- Script farklı provider’larla çalışabiliyor: `price_bars` (default), `isyatirim`, `mynet`, `yfinance`.
- `--also-upsert-price-bars` verilmezse script sadece `market_snapshots` upsert eder.

Komut (kapanış sonrası, IsYatirim ile, sadece market_snapshots):

```bash
python3 scripts/ingest_market_snapshots.py --provider isyatirim --batch-size 50 --sleep-seconds 1.0
```

Komut (kapanış sonrası, IsYatirim ile, market_snapshots + price_bars):

```bash
python3 scripts/ingest_market_snapshots.py --provider isyatirim --batch-size 50 --sleep-seconds 1.0 --also-upsert-price-bars
```

Linux cron örneği (TR=UTC+3 varsayımıyla sunucu TZ ayarlıysa):

```cron
10 18 * * 1-5 APP_ENV=prod /usr/bin/python3 /path/to/repo/scripts/ingest_market_snapshots.py --provider isyatirim --batch-size 50 --sleep-seconds 1.0 --also-upsert-price-bars >> /var/log/investapi/market_snapshots.log 2>&1
```

Komut (daha "konservatif" sadece DB'deki bar'dan snapshot üretmek):

```bash
python3 scripts/ingest_market_snapshots.py --provider price_bars
```

### C) Günlük/Haftalık: Price Bars (alternatif kaynaklarla backfill)

Amaç:
- `price_bars` için alternatif backfill (Yahoo/Mynet).

Komut (örnek):

```bash
python3 ingest_price_bars.py --days 400
```

Not:
- Günlük çalıştırılacaksa kapanış sonrası çalıştırmak mantıklı; ancak HisseTekil zaten `price_bars`’ı beslediği için bu job genelde "yedek" olarak düşünülmeli.

### D) Günlük/Haftalık: Endeks fiyatları (index_price_bars + index_quotes)

Amaç:
- Endeks serilerini (`index_price_bars`) ve anlık quote’ları (`index_quotes`) güncellemek.

Komut (örnek):

```bash
python3 scripts/ingest_index_prices.py --days 370
```

Komut (günlük incremental, kapanış sonrası; son birkaç günü çekip sadece eksikleri ekler):

```bash
python3 scripts/ingest_index_prices.py --days 7
```

Komut (günlük incremental, sadece belirli endeksler):

```bash
python3 scripts/ingest_index_prices.py --codes XU100,XU030 --days 7
```

Linux cron örneği (TR=UTC+3 varsayımıyla sunucu TZ ayarlıysa):

```cron
15 18 * * 1-5 APP_ENV=prod /usr/bin/python3 /path/to/repo/scripts/ingest_index_prices.py --codes XU100,XU030 --days 7 >> /var/log/investapi/index_prices.log 2>&1
```

Not:
- `--codes` veya `--codes-file` ile kapsam kontrol edilir.

### E) Çeyreklik / Dönemsel: İş Yatırım mali tablolarını DB’ye çekme

Amaç:
- Yeni bilanço dönemlerinde mali tablo verisini DB’ye yazmak.
- TTM hesapları için (prev Q4 dahil) 4 dönem setini almak.

Komut (örnek, yıl + Q1/Q2/Q3 yayınlandıkça güncellenir):

```bash
python3 scripts/fetch_isyatirim_periods.py --year 2025 --months 3,6,9 --include-prev-q4 --currency TL --auto-financial-group
```

Not:
- Bu job "günlük" değil; dönemsel olarak tetiklenmesi daha doğru.

### F) Haftalık: Sektör benchmark / istatistik hesapları

Amaç:
- Sektör karşılaştırmalarında kullanılan istatistikleri/percentile’ları üretmek.

Komut:
- Bu script uzun olduğu için parametrelerini ve çağrım şeklini kendi içinde belirliyor; genelde haftalık/aylık çalıştırmak mantıklı.

```bash
python3 scripts/calculate_sector_benchmarks.py
```

### G) Haftalık/Günlük: Company ratio materialization (company_ratio_values)

Amaç:
- UI/API tarafında hızlı sorgu için ratio değerlerini materialize etmek.

Komut (örnek):

```bash
python3 scripts/materialize_company_ratios.py --period-key 2025Q3_TTM --report-type standart --currency TL --mode upsert
```

Not:
- Hangi `period-key` aktifse ona göre schedule edilir.

### H) Haftalık: SWOT raporlarını yenileme (cache TTL = 7 gün)

Amaç:
- `company_swot_reports` cache’ini haftalık yenilemek.
- UI tarafında istek anında hesap yükünü azaltmak.

Uygulama seçenekleri:
- **HTTP ile tetikleme:** backend’de `/api/swot/{ticker}/generate` endpoint’i var.
- **Plan:** (ileride) bir internal endpoint ile "tüm tickers" için generate tetiklenebilir.

Mevcut en basit yaklaşım (örnek, tek ticker):

```bash
curl -X POST "https://<BACKEND_HOST>/api/swot/ISMEN/generate?period_key=2025Q3_TTM"
```

Not:
- Toplu üretim için pratikte bir "batch runner" (internal endpoint veya python script) eklemek gerekebilir.

### I) Saatlik/Günlük: KAP Bildirimleri Senkronizasyonu (kap_disclosures cache)

Amaç:
- MKK VYK API üzerinden KAP bildirim metadata’sını çekip `kap_disclosures` tablosuna **incremental** olarak yazmak.
- UI tarafında ticker bazlı filtre + sayfalama ile hızlı listeleme yapmak.

Notlar:
- Job idempotent olacak şekilde tasarlandı: `(ticker, disclosure_index)` unique.
- İlk koşuda geriye dönük bir pencere tarar; sonraki koşularda `kap_disclosure_sync_state.last_disclosure_index` üzerinden ilerler.
- Attachment indirilmez; sadece link/subject/summary/time saklanır.

Komut (önerilen, belirli ticker’lar):

```bash
python3 scripts/sync_kap_disclosures.py --tickers AEFES,BIMAS --max-items 200 --concurrency 2
```

Komut (tüm DB’deki tickers, daha konservatif):

```bash
python3 scripts/sync_kap_disclosures.py --max-items 100 --concurrency 2
```

Linux cron örneği (TR=UTC+3 varsayımıyla sunucu TZ ayarlıysa):

```cron
0 * * * * /usr/bin/python3 /path/to/repo/scripts/sync_kap_disclosures.py --max-items 100 --concurrency 2 >> /var/log/investapi/kap_sync.log 2>&1
```

### J) Günlük/Haftalık: Sermaye Artırımları & Temettüler (Matriks)

Amaç:
- `company_corporate_actions` tablosunu güncellemek.
- Bedelli/bedelsiz/temettü aksiyonlarını UI tarafında tarihçeli gösterebilmek.

Notlar:
- Job idempotent: `(ticker, action_date, source)` unique ile upsert.
- Bazı ticker’larda Matriks zaman zaman 500 döndürebiliyor; script retry/backoff uygular.

Komut (tüm tickers, kapanış sonrası):

```bash
python3 scripts/ingest_matriks_dividends.py --all --concurrency 2 --sleep-seconds 0.2 --fail-on-error
```

Komut (smoke test / sınırlı):

```bash
python3 scripts/ingest_matriks_dividends.py --all --limit 50 --concurrency 2 --sleep-seconds 0.2 --fail-on-error
```

Linux cron örneği (TR=UTC+3 varsayımıyla sunucu TZ ayarlıysa):

```cron
10 18 * * 1-5 /usr/bin/python3 /path/to/repo/scripts/ingest_matriks_dividends.py --all --concurrency 2 --sleep-seconds 0.2 --fail-on-error >> /var/log/investapi/matriks_corporate_actions.log 2>&1
```

## Yöntemler

### Seçenek A) GitHub Actions (Schedule)

Artıları:
- Kolay yönetim, versiyon kontrollü.
- Loglar GitHub’da.

Eksileri:
- Repo secrets ve DB erişimi ayarlamak gerekir.
- GitHub runner’ın DB’ye erişebilmesi gerekir (public DB önerilmez; VPN/allowlist veya yönetilen DB + IP allowlist).

Öneri:
- `cron: '5 15 * * 1-5'` gibi bir schedule ile UTC üzerinden ayarla.
  - TR (UTC+3) 18:05 = UTC 15:05.

Örnek (taslak):
- `.github/workflows/ingest-isyt.yml`
  - schedule: `15 5` değil, `15 15` gibi UTC’ye göre.
  - `DATABASE_URL` vb. secrets.
  - `python3 -m venv` + deps kurulumu + script çalıştır.

Not: Bu repo içinde workflow dosyası henüz oluşturulmadı; sadece plan.

### Seçenek B) Cloudflare Workers Cron Triggers

Artıları:
- “Her gün şu saatte HTTP çağrısı” modeli kolay.
- Uptime yüksek.

Eksileri:
- Worker doğrudan python script çalıştırmaz.

Uygulama yaklaşımı:
- Cloudflare cron tetikleyicisi -> bir HTTP endpoint çağırır.
- Bu endpoint:
  - Ya backend’inizde bir “/internal/cron/ingest?key=...” gibi korumalı endpoint olur.
  - Ya da bir queue (örn. Cloudflare Queues) üzerinden worker job tetikler.

Güvenlik:
- Secret key header (örn. `X-Cron-Token`) zorunlu.

### Seçenek C) cron-job.org (HTTP ping)

Artıları:
- Kurulumu çok hızlı.

Eksileri:
- Yine python script çalıştırmaz; HTTP endpoint tetikler.

Uygulama:
- cron-job.org -> sizin backend’de korumalı bir endpoint’i çağırır.
- Endpoint server-side script’i tetikler (subprocess değilse bile içeride job başlatır) veya mevcut batch mekanizmanızı çağırır.

### Seçenek D) Sunucu üzerinde system cron (Linux) / launchd (macOS)

Artıları:
- En basit/klasik yöntem.
- Python script’i direkt çalıştırır.

Eksileri:
- Sunucu yönetimi gerekir.

Linux cron örneği (TR=UTC+3 varsayımıyla sunucu TZ ayarlıysa):

```cron
5 18 * * 1-5 /usr/bin/python3 /path/to/repo/scripts/ingest_isyatirim_hisse_tekil.py --xu100 --incremental-days 7 >> /var/log/investapi/ingest.log 2>&1
```

macOS launchd yaklaşımı:
- `StartCalendarInterval` ile 18:05 ve `ProgramArguments` ile script.

## Önerilen mimari notları

- Üretimde en sürdürülebilir yaklaşım:
  - HTTP ile tetiklenen (Cloudflare/cron-job) + backend içinde job runner.
  - Ya da doğrudan sunucuda cron.
- Günlük incremental için **son 7 gün** yaklaşımı şimdilik iyi.
- İleride “hangi ticker kaç satır geldi / kaç upsert oldu / hata oranı” gibi metrikler ayrı bir tablo veya log agregasyonu ile izlenebilir.
