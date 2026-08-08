# S7 — Operasyon ve Yayın

- Durum: başlamadı
- Bağımlılık: S1-S6 (tümü)
- Repo: kap + hono

## 1. Amaç
Sistemin canlıda güvenilir çalışmasını sağlamak: cron/senkron düzeni, izleme, log yönetimi, maliyet kontrolü ve yayınlanma. Pazar kapanışı sonrası verilerin tam ve zamanında taze kalması hedef.

## 2. Kapsam Dışı
- Yeni özellikler (ikinci iterasyona)
- Mastge yeniden tasarım

## 3. Fazlar

### Faz 1 — Cron / senkron düzeni
- W1 polling takvimi (pazar saati 3 dk, dışı 15 dk).
- BIST100 listesi haftalık tazeleme.
- Kaplama kontrolü: iki ayrı zamanlayıcıda aynı iş çalışmaz (lock).
- Doğrulama: 1 hafta boyunca kesintisiz toplama.

### Faz 2 — Monitoring ve alarm
- Health endpoint'leri (W1, W2, W3, D1).
- Hata oranı / bildirim sayısı / token maliyeti metrikleri (Cloudflare Analytics + FastAPICloud logları).
- Alarm kuralları: polling durdu, AI skor dağılımı anormal, W3 retry yüksek.
- Doğrulama: kritik alarmlar mail/telegrama düşüyor.

### Faz 3 — Canlı yayın
- Custom domain / route: hono.jetborsa.com altındaki /api/notifications*.
- CORS güncellemesi (jetborsa.com), rate limit, KV cache süreleri.
- A/B test: önce geliştirmede, sonra canlıda kademeli açılış.
- Doğrulama: canlı sayfalar çalışıyor, hatalar izleniyor.

### Faz 4 — Dokümantasyon ve runbook
- README güncelle (kap repo + hono bölümler).
- Runbook: nasıl çalışır, acil durum adımları (API değişimi, skor revizyonu).
- API değişiklik takvimi (KAP API değişirse W1'de ne yapılır).
- Doğrulama: ikinci kişi dokümanla sistemi başlatabilir.

## 4. Görev Listesi
- [ ] S7-1 Cron/lock düzeni (W1+CF cron) — test haftası
- [ ] S7-2 Metrik + alarm kurulumu
- [ ] S7-3 Canlı yayın (domain, CORS, kademeli)
- [ ] S7-4 Runbook + README + bakım dokümanı
- [ ] S7-5 Maliyet raporu (AI token, D1, Workers)

## 5. Kararlar
- Alarm kanalı: e-posta + (opsiyonel) Telegram.
- Canlı yayın öncesi 1 hafta pilot (geliştirme + canlı kademeli).

## 6. Kabul Kriterleri
- [ ] 1 haftalık kesintisiz toplama, hiçbir bildirim kaçmadı (örnek karşılaştırma)
- [ ] Health endpoint'leri tüm servisler için yeşil
- [ ] Token maliyeti aylık bütçe içinde (rapor eklendi)
- [ ] Runbook tamamlandı, ikinci kişi başlatabiliyor