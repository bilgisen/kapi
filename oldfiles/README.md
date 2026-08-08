# oldfiles/ — Referans Kaynaklar

Bu klasör, YENİ KAP platformunun geliştirilmesinde referans olarak kullanılan **eski investapi** kodlarının kopyalarını içerir. Orijinal dosyalar investapi repo'sunda duruyor — buradakiler yalnızca okuma/referans amaçlıdır.

## Dosyalar

| Dosya | Kaynak | İçerik |
|---|---|---|
| `mkk_vyk_client.py` | investapi/services | MKK VYK API istemcisi (token, members, disclosures) |
| `kap_service.py` | investapi/services | KAP bildirim iş mantığı (sync, incremental, sorgu) |
| `kap_provider.py` | investapi/providers | KAP şirket arama / endeks sorguları |
| `kap_financial_provider.py` | investapi/providers | KAP mali tablo (XBRL) çekme |
| `sync_kap_disclosures.py` | investapi/scripts | MKK VYK bildirim senkron CLI |
| `kap.py` | investapi/models | KAPAnnouncement pydantic modeli |
| `kap_models.py` | investapi/models | KAP ek modelleri |
| `kap.py` (router) | investapi/api/routers | KAP bildirim endpoint'leri |
| `database.py` | investapi | `kap_disclosures` + `kap_disclosure_sync_state` tabloları (satır ~519+) |
| `cron.md` | investapi/docs | KAP senkron cron tasarımı |
| `knowledge-log.md` | investapi/docs | Karar/keşif kayıtları |

Sırasıyla: S1'de yeni KAP client + MKK VYK entegrasyonu için, S4'te Hono yönlendirme desenleri için referans alınacak.