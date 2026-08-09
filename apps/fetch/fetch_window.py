"""S1-3: Pencere ingest — KAP'tan çek, D1'e idempotent yaz (S1-3 doğrulaması).

Kullanım:
    python fetch_window.py --days 1            # bugün+dün
    python fetch_window.py --from 2026-08-06 --to 2026-08-07
    python fetch_window.py --no-write          # sadece çek, yazma (dry-run)
"""
from __future__ import annotations

import argparse
import sys
from datetime import UTC, date, datetime, timedelta, timezone

try:
    from apps.fetch.d1_client import D1Client
    from apps.fetch.kap_client import KapClient
except ImportError:
    from d1_client import D1Client
    from kap_client import KapClient

MAX_WINDOW_DAYS = 2  # 2000 kayıt tavanı; spike: 6144/gün → 1-2 gün güvenli


def parse_date(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


def to_utc_iso(raw: str | None) -> str | None:
    """KAP zamanını UTC ISO'ya çevirir.

    KAP formatı: "dd.MM.yyyy HH:mm:ss" (Türkiye saati, UTC+3).
    Bilinmeyen format aynen bırakılır.
    """
    if not raw:
        return None
    try:
        dt = datetime.strptime(raw, "%d.%m.%Y %H:%M:%S")
    except ValueError:
        try:
            dt = datetime.fromisoformat(raw)
        except ValueError:
            return raw
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone(timedelta(hours=3)))
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def normalize_stocks(item: dict) -> list[str]:
    """KAP'ta stockCodes string ("IEYHO" veya "A,B") olarak gelebilir."""
    val = item.get("stockCodes")
    if isinstance(val, list):
        return [str(s).upper() for s in val if str(s).strip()]
    if isinstance(val, str) and val.strip():
        return [s.strip().upper() for s in val.split(",") if s.strip()]
    return []


UPSERT_SQL = """
INSERT INTO kap_notifications (
    disclosure_index, mkk_member_id, title, subject, disclosure_class,
    disclosure_type, disclosure_category, summary, publish_date,
    is_late, attachment_count, modify_status, is_bist100, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
ON CONFLICT(disclosure_index) DO UPDATE SET
    title             = excluded.title,
    subject           = excluded.subject,
    disclosure_class  = excluded.disclosure_class,
    disclosure_type   = excluded.disclosure_type,
    disclosure_category = excluded.disclosure_category,
    summary           = excluded.summary,
    publish_date      = excluded.publish_date,
    is_late           = excluded.is_late,
    attachment_count  = excluded.attachment_count,
    modify_status     = excluded.modify_status,
    is_bist100        = excluded.is_bist100,
    updated_at        = datetime('now')
"""

COMPANY_SQL = """INSERT OR IGNORE INTO notification_companies (disclosure_index, ticker)
VALUES (?, ?)"""


def upsert_notification(
    d1: D1Client, item: dict, member_tickers: set[str]
) -> list[str]:
    idx = str(item.get("disclosureIndex") or "")
    if not idx:
        raise ValueError("disclosureIndex eksik")

    tickers = normalize_stocks(item)
    is_bist100 = 1 if any(t in member_tickers for t in tickers) else 0

    d1.execute(
        UPSERT_SQL,
        [
            idx,
            item.get("mkkMemberOid"),
            item.get("kapTitle"),
            item.get("subject"),
            item.get("disclosureClass"),
            item.get("disclosureType"),
            item.get("disclosureCategory"),
            item.get("summary"),
            to_utc_iso(item.get("publishDate")),
            1 if bool(item.get("isLate")) else 0,
            int(item.get("attachmentCount") or 0),
            item.get("modifyStatus"),
            is_bist100,
        ],
    )
    for t in tickers:
        d1.execute(COMPANY_SQL, [idx, t])
    return tickers


def fetch_detail_updates(client, d1, item) -> str | None:
    """Yeni bildirimin detayını çeker; mkk_member_id/is_changed/related/disclosure_body doldurur."""
    idx = str(item.get("disclosureIndex") or "")
    detail = client.attachment_detail(idx)
    if not detail:
        return None
    basic = detail.get("disclosureBasic") or {}
    changed = 1 if bool(basic.get("isChanged")) else 0
    d1.execute(
        """UPDATE kap_notifications
           SET mkk_member_id = ?, is_changed = ?, related_disclosure_oid = ?,
               disclosure_body = COALESCE(?, disclosure_body),
               updated_at = datetime('now')
           WHERE disclosure_index = ?""",
        [
            basic.get("mkkMemberOid"),
            changed,
            (detail.get("disclosureDetail") or {}).get("relatedDisclosureIndex")
            or basic.get("relatedDisclosureOid"),
            detail.get("disclosureBody") or "",
            idx,
        ],
    )
    return "changed" if changed else "ok"


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description="KAP pencere ingest")
    p.add_argument("--days", type=int, default=1)
    p.add_argument("--from-date", type=parse_date, dest="from_date")
    p.add_argument("--to", type=parse_date, dest="to_date")
    p.add_argument("--no-write", action="store_true", help="sadece çek, yazma")
    p.add_argument("--pdf", action="store_true", help="öncelikli konuların PDF'lerini çek+parse (S1-5)")
    p.add_argument("--no-detail", action="store_true", help="detay (isChanged/relatedDisclosure) çekimi atla (S1-6)")
    args = p.parse_args(argv)

    to = args.to_date or date.today()
    from_ = args.from_date or (to - timedelta(days=max(1, args.days - 1)))
    if (to - from_).days + 1 > MAX_WINDOW_DAYS:
        print(f"Uyarı: pencere {MAX_WINDOW_DAYS} günden büyük — tavan riski")

    client = KapClient()
    client.warmup()
    items = client.list_disclosures(from_, to)
    print(f"Pencere {from_}..{to}: {len(items)} bildirim")

    if args.no_write:
        return

    d1 = D1Client()
    try:
        members = {
            r["ticker"] for r in d1.execute("SELECT ticker FROM bist100_members WHERE is_active = 1").get("results", [])
        }
    except Exception:
        members = set()
        print("bist100_members okunamadı — is_bist100=0 yazılacak")

    wrote = 0
    last_err = None
    detail_status = {"ok": 0, "changed": 0, "skip": 0}
    for item in items:
        try:
            upsert_notification(d1, item, members)
            wrote += 1
            if not args.no_detail:
                idx = str(item.get("disclosureIndex") or "")
                exists = d1.execute(
                    "SELECT 1 FROM kap_notifications WHERE disclosure_index = ? AND disclosure_body IS NOT NULL",
                    [idx],
                ).get("results")
                if exists:
                    detail_status["skip"] += 1
                    continue  # zaten detay dolu — güncelleme yok
                status = fetch_detail_updates(client, d1, item)
                detail_status[status if status else "skip"] += 1
        except Exception as exc:  # noqa: BLE001
            last_err = exc

    if not args.no_detail:
        print(f"Detay: {detail_status}")

    if args.pdf:
        from pdf_pipeline import fetch_and_store

        pdf_client = KapClient()
        pdf_done = 0
        for item in items:
            if fetch_and_store(pdf_client, d1, item):
                pdf_done += 1
        print(f"PDF işlenen (öncelikli+başarılı): {pdf_done}/{len(items)}")

    print(f"D1'e yazılan: {wrote}/{len(items)}" + (f" — son hata: {last_err}" if last_err else ""))

    d1.execute(
        """INSERT INTO kap_sync_state (id, last_window_start, last_window_end,
           last_success, last_error, fetched_count, updated_at)
           VALUES (1, ?, ?, 1, ?, ?, datetime('now'))
           ON CONFLICT(id) DO UPDATE SET
             last_window_start = excluded.last_window_start,
             last_window_end   = excluded.last_window_end,
             last_success      = excluded.last_success,
             last_error        = excluded.last_error,
             fetched_count     = excluded.fetched_count,
             updated_at        = datetime('now')""",
        [from_.isoformat(), to.isoformat(), str(last_err) if last_err else None, len(items)],
    )


if __name__ == "__main__":
    sys.exit(main())