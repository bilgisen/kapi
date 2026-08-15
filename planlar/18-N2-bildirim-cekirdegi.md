# N2 — Kullanıcı Bildirim Çekirdeği (in-app)

- Durum: başlamadı (2026-08-14)
- Bağımlılık: N1 (takip eşleştirmesi sunucu listelerine bağlı)
- Repo: hono + tanstack

## 1. Amaç
Single inbox: tüm kullanıcı bildirimleri tek tabloda, topbar'da zil + rozet + dropdown, tam "Bildirimlerim" sayfası. İlk kaynak: KAP (takip eşleşmesi + skor≥8) + elle sistem duyurusu.

## 2. Kararlar (kullanıcı onayı 2026-08-14)
- Kanal: yalnız in-app (push/email → N3)
- "Bildirimlerim" ayrı sayfa (`/bildirimlerim`); KAP sayfası `/kap-bildirimleri`'ne taşınır (eski URL redirect)
- `user_notifications` jetmain D1'de (kullanıcı verisi üyelik DB'siyle aynı)

## 3. Fazlar

### Faz 1 — Veri + API (hono)
- `user_notifications` tablosu: id, user_id, type (kap_takip|sistem), title, body, disclosure_index, ticker, link, read_at, created_at; index (user_id, read_at)
- `GET /api/user/notifications` (sayfalama, unread filtresi), `GET /api/user/notifications/unread-count`, `POST /api/user/notifications/read` (toplu)
- `POST /api/user/notifications/announce` (secret'lı sistem duyurusu)

### Faz 2 — KAP eşleştirme motoru (hono cron)
- Hono'da cron/interval: son N dk yeni KAP bildirimleri (kapi-db) → takip eşleşmesi VEYA skor≥8 → her kullanıcının watchlist_items'ı ile eşleştir → user_notifications'a INSERT (jetmain)
- Aynı bildirim için kullanıcı başına tek kayıt (unique guard)
- Batch + retry; okunma → clicks'e ayrıca yazmaya gerek yok (bildirim read_at yeterli)

### Faz 3 — UI (tanstack)
- Topbar: Bell ikonu + unread badge (poll: 60s + focus refetch) + dropdown (son 6, "Tümünü gör")
- `/bildirimlerim` sayfası: liste, okundu/okunmadı, filtre (tümü/okunmamış), KAP detayına link
- `/bildirimler` → `/kap-bildirimleri` (route taşıma + redirect)

## 4. Görev Listesi
- [ ] N2-1 tablo + endpoints TAMAM (deploy 500ff4c0)
- [ ] N2-2 KAP eşleştirme motoru + duyuru endpoint'i TAMAM (cron entegre, idempotent; announce secret N2_NOTIFY_SECRET)
- [ ] N2-3 TanStack topbar + dropdown TAMAM (Bell + badge + 60s poll)
- [ ] N2-4 /bildirimlerim sayfası TAMAM
- [ ] N2-5 /kap-bildirimleri taşıma + redirect TAMAM (307 dogrulandi)
- [ ] N2-6 deploy + doğrulama (canlı KAP bildirimi → kullanıcı bildirimi) TAMAM (tanstack e3525995 / bec3cfa; announce 16 kullaniciya ulasti; KAP eslestirme: jetmain'de 0 takip oldugundan 0 insert - kullanici takip ekledikce devreye girer)

## 5. Kabul Kriterleri
- [ ] Takip hissesinde yeni skor≥5 bildirim → topbar rozeti artar
- [ ] Rozet okununca sıfırlanır; sayfa kalıcıdır
- [ ] Anonim kullanıcı zili görmez (login ister)
- [ ] /bildirimler eski linkleri çalışır (redirect)