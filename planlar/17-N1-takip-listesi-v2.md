# N1 — Takip Listesi v2 (Sunucu + Rol Limitleri)

- Durum: başlamadı (2026-08-14)
- Bağımlılık: N0; JetBorsa mevcut auth (Better Auth, jetmain D1, user_credits.tier)
- Repo: hono + tanstack

## 1. Amaç
Takip listesini localStorage'dan sunucuya taşımak: rol bazlı limitler (free/member/pro) ve kullanıcı bildirim eşleştirmesi (N2) için altyapı. Anonim deneyim bozulmaz.

## 2. Kararlar (kullanıcı onayı 2026-08-14)
- Limit matrisi: **free 1 liste / 10 öğe; member 3 / 30; pro 10 / 100** (tier adları uygulamada eşleşir)
- Anonim: localStorage çalışmaya devam; login'de sunucuya merge; logout'ta anonim görünüme dönülür
- S12 `useTrackedSymbols`: auth'luysa sunucu takibi, anonimse localStorage — ikisi de besler

## 3. Fazlar

### Faz 1 — Sunucu (hono)
- jetmain D1: `watchlists` + `watchlist_items` tabloları
- `GET /api/watchlists` (listeler + öğeler + limits), `POST /api/watchlists`, `DELETE /api/watchlists/:id`
- `POST /api/watchlists/:id/items`, `DELETE /api/watchlists/:id/items/:symbol`
- Limit kontrolü her yazımda; default liste silinemez
- Auth: authMiddleware `c.get('user').userId` (anonim → 401)

### Faz 2 — İstemci (tanstack)
- `useWatchlistStore`'a sunucu senkronu: login'de pull+merge, her değişiklikte API'ye yaz
- Limit aşımında kullanıcıya mesaj (limit bilgisi yanıtta)
- `useTrackedSymbols` iki kaynaktan beslenir

### Faz 3 — Yan bulgu düzeltmesi
- `ta.js` tier gating: `c.get('role')` hiç set edilmiyor → `c.get('user')?.role` kullanılacak

## 4. Görev Listesi
- [ ] N1-1 jetmain tier değerlerini doğrula + limit matrisi
- [ ] N1-2 D1 tabloları
- [ ] N1-3 Hono CRUD + limits
- [ ] N1-4 ta.js fix
- [ ] N1-5 TanStack senkron + merge
- [ ] N1-6 lint/typecheck/test + deploy + doğrulama

## 5. Kabul Kriterleri
- [ ] Üye login → takip listeleri sunucuda kalıcı; refresh sonrası korunur
- [ ] Anonim kullanıcı localStorage ile aynen çalışır
- [ ] Login sonrası anonim öğeler merge edilir (kayıp yok)
- [ ] Limit aşımı engellenir + mesaj gösterilir