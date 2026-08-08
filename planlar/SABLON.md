# Alt Plan Şablonu (SABLON)

Her alt plan aynı şablonla yazılır. Kopyalayıp başlıkları güncelle.

```md
# SXX — <Plan Adı>

- Durum: [ ] başlamadı | [x] devam ediyor | [x] tamam
- Bağımlılık: <hangi planlar>
- Repo: <kap / hono / tanstack>

## 1. Amaç
<Bu planda ne tamamlanacak, neden önemli>

## 2. Kapsam Dışı
- <burada yapılmayacaklar>

## 3. Fazlar

### Faz 1 — <Faz adı>
- Açıklama: ...
- Doğrulama kriterleri: ...

### Faz 2 — <Faz adı>
...

## 4. Görev Listesi
- [ ] SXX-1 <görev> <bağımlılık: ->
> açıklama / not
- [ ] SXX-2 <görev>

## 5. Karar Kayıtları
- <tarih> K<no>:
  - Seçenekler: ...
  - Seçim: ...
  - Gerekçe: ...

## 6. Doğrulama / Kabul Kriterleri
- [ ] <kriter 1>
- [ ] <kriter 2>
```

## Kurallar
- Görev ID'leri plan kısaltması ile başlar: `S0-3`, `S1-5` vb.
- Durum işareti: `[x]` tamam, `[ ]` bekliyor.
- Her tamamlanan görev ayrı bir commit ile işaretlenir.
- Plan'a yeni görev eklenirse yeni ID'ler en alta eklenir (sıra bozulmaz).
- Kararlar her alt planın "Karar Kayıtları" bölümünde ve `kararlar.md` merkezinde tutulur.