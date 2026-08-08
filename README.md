# Kapı — KAP Bildirimleri Platformu

BIST 100 şirketlerinin KAP bildirimlerini toplayıp sınıflandıran, AI ile özetleyen ve JetBorsa'da yayınlayan platform.

## Mimari

```
KAP public JSON API + MKK VYK API  ->  W1 kapi-fetch (Python FastAPI @ FastAPICloud)
                                       ->  W2 kapi-classify (CF Worker, kural bazlı skor 1-10)
                                       ->  W3 kapi-ai (CF Worker, Gemini özet+analiz)
                                       ->  D1 kapi-db
                                       ->  Hono /api/notifications* + KV cache + auth
                                       ->  TanStack frontend (/bildirimler + hisse sekmesi)
```

## Klasör Yapısı

```
/
├── planlar/        # ANA PLAN + 8 alt plan + şablon + kararlar (başlangıç noktası)
├── oldfiles/       # investapi eski KAP kodları (referans, okuma amaçlı)
├── apps/           # (planlanıyor) fetch / classify / ai worker'ları
└── docs/           # (planlanıyor) mimari dokümanları, spike raporları
```

## Başlarken

Planları oku: `planlar/00-ANA-PLAN.md` — tüm alt planlar ve görev listeleri orada.