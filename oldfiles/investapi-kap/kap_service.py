"""
KAP service layer - handles business logic for KAP announcements
"""
from typing import Any, Dict, List, Optional
from datetime import datetime

from database import (
    get_db,
    KapDisclosure as DBKapDisclosure,
    KapDisclosureSyncState as DBKapDisclosureSyncState,
)
from models.kap import KAPAnnouncement
from services.mkk_vyk_client import MkkVykClient


def _parse_mkk_time(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.strptime(value.strip(), "%d.%m.%Y %H:%M:%S")
    except Exception:
        return None


async def refresh_company_kap_disclosures(
    ticker: str,
    limit: int = 50,
    disclosure_class: Optional[str] = None,
    disclosure_type: Optional[str] = None,
) -> int:
    client = MkkVykClient()
    db = next(get_db())
    try:
        members = await client.members()
        ticker_u = ticker.upper()

        company_id: Optional[int] = None
        for m in members:
            stock_code = str(m.get("stockCode") or "")
            codes = [c.strip().upper() for c in stock_code.replace(";", ",").split(",") if c.strip()]
            if ticker_u in codes:
                try:
                    company_id = int(m.get("id"))
                except Exception:
                    company_id = None
                break

        if company_id is None:
            return 0

        last_index = await client.last_disclosure_index()
        if last_index <= 0:
            return 0

        start_index = max(538004, last_index - max(limit * 2, 100))
        items = await client.disclosures(
            disclosure_index=start_index,
            disclosure_class=disclosure_class,
            disclosure_type=disclosure_type,
            company_id=company_id,
        )

        inserted_or_updated = 0
        for it in items[-limit:]:
            try:
                di = int(it.get("disclosureIndex"))
            except Exception:
                continue

            detail = await client.disclosure_detail(disclosure_index=di, file_type="data")

            subject = detail.get("subject") or {}
            summary = detail.get("summary") or {}
            published_at = _parse_mkk_time(detail.get("time"))
            kap_link = detail.get("link")
            sender_title = detail.get("senderTitle")

            db_row = (
                db.query(DBKapDisclosure)
                .filter(DBKapDisclosure.ticker == ticker_u)
                .filter(DBKapDisclosure.disclosure_index == di)
                .first()
            )
            if not db_row:
                db_row = DBKapDisclosure(ticker=ticker_u, disclosure_index=di)
                db.add(db_row)

            db_row.disclosure_class = str(detail.get("disclosureClass") or it.get("disclosureClass") or "") or None
            db_row.disclosure_type = str(detail.get("disclosureType") or it.get("disclosureType") or "") or None
            db_row.sender_title = sender_title
            db_row.subject_tr = subject.get("tr")
            db_row.summary_tr = summary.get("tr")
            db_row.published_at = published_at
            db_row.kap_link = kap_link
            db_row.company_id_mkk = company_id
            db_row.raw = detail
            inserted_or_updated += 1

        db.commit()
        return inserted_or_updated
    finally:
        db.close()
        await client.close()


async def sync_company_kap_disclosures_incremental_with_context(
    *,
    ticker: str,
    company_id: int,
    last_global: int,
    client: MkkVykClient,
    max_items: int = 200,
    disclosure_class: Optional[str] = None,
    disclosure_type: Optional[str] = None,
) -> int:
    db = next(get_db())
    try:
        ticker_u = ticker.upper()

        state = db.query(DBKapDisclosureSyncState).filter(DBKapDisclosureSyncState.ticker == ticker_u).first()
        if not state:
            state = DBKapDisclosureSyncState(ticker=ticker_u)
            db.add(state)
            db.flush()

        if int(last_global or 0) <= 0:
            return 0

        start_index = int(state.last_disclosure_index or 0)
        items: List[Dict[str, Any]] = []
        if start_index > 0:
            items = await client.disclosures(
                disclosure_index=start_index,
                disclosure_class=disclosure_class,
                disclosure_type=disclosure_type,
                company_id=company_id,
            )
        else:
            lookbacks = [1000, 2000, 5000, 10000, 20000]
            for lb in lookbacks:
                start_index = max(538004, int(last_global) - lb)
                items = await client.disclosures(
                    disclosure_index=start_index,
                    disclosure_class=disclosure_class,
                    disclosure_type=disclosure_type,
                    company_id=company_id,
                )
                if items:
                    break

        if not items and start_index > 0 and int(state.last_disclosure_index or 0) <= 0:
            lookbacks = [50000, 100000]
            for lb in lookbacks:
                start_index = max(538004, int(last_global) - lb)
                items = await client.disclosures(
                    disclosure_index=start_index,
                    disclosure_class=disclosure_class,
                    disclosure_type=disclosure_type,
                    company_id=company_id,
                )
                if items:
                    break

        inserted_or_updated = 0
        max_seen = int(state.last_disclosure_index or 0)
        for it in items[: max(1, int(max_items))]:
            try:
                di = int(it.get("disclosureIndex"))
            except Exception:
                continue

            if di > max_seen:
                max_seen = di

            detail = await client.disclosure_detail(disclosure_index=di, file_type="data")

            subject = detail.get("subject") or {}
            summary = detail.get("summary") or {}
            published_at = _parse_mkk_time(detail.get("time"))
            kap_link = detail.get("link")
            sender_title = detail.get("senderTitle")

            db_row = (
                db.query(DBKapDisclosure)
                .filter(DBKapDisclosure.ticker == ticker_u)
                .filter(DBKapDisclosure.disclosure_index == di)
                .first()
            )
            if not db_row:
                db_row = DBKapDisclosure(ticker=ticker_u, disclosure_index=di)
                db.add(db_row)

            db_row.disclosure_class = str(detail.get("disclosureClass") or it.get("disclosureClass") or "") or None
            db_row.disclosure_type = str(detail.get("disclosureType") or it.get("disclosureType") or "") or None
            db_row.sender_title = sender_title
            db_row.subject_tr = subject.get("tr")
            db_row.summary_tr = summary.get("tr")
            db_row.published_at = published_at
            db_row.kap_link = kap_link
            db_row.company_id_mkk = company_id
            db_row.raw = detail
            inserted_or_updated += 1

        state.last_disclosure_index = max_seen if max_seen > 0 else state.last_disclosure_index
        state.last_synced_at = datetime.utcnow()
        db.commit()
        return inserted_or_updated
    finally:
        db.close()


async def sync_company_kap_disclosures_incremental(
    ticker: str,
    max_items: int = 200,
    disclosure_class: Optional[str] = None,
    disclosure_type: Optional[str] = None,
) -> int:
    """Incrementally sync KAP disclosures for a ticker.

    Persists progress in kap_disclosure_sync_state, so subsequent runs only scan forward.
    """
    client = MkkVykClient()
    db = next(get_db())
    try:
        members = await client.members()
        ticker_u = ticker.upper()

        company_id: Optional[int] = None
        for m in members:
            stock_code = str(m.get("stockCode") or "")
            codes = [c.strip().upper() for c in stock_code.replace(";", ",").split(",") if c.strip()]
            if ticker_u in codes:
                try:
                    company_id = int(m.get("id"))
                except Exception:
                    company_id = None
                break

        if company_id is None:
            return 0

        state = db.query(DBKapDisclosureSyncState).filter(DBKapDisclosureSyncState.ticker == ticker_u).first()
        if not state:
            state = DBKapDisclosureSyncState(ticker=ticker_u)
            db.add(state)
            db.flush()

        last_global = await client.last_disclosure_index()
        if last_global <= 0:
            return 0

        start_index = int(state.last_disclosure_index or 0)
        items: List[dict] = []
        if start_index > 0:
            items = await client.disclosures(
                disclosure_index=start_index,
                disclosure_class=disclosure_class,
                disclosure_type=disclosure_type,
                company_id=company_id,
            )
        else:
            lookbacks = [1000, 2000, 5000, 10000, 20000]
            for lb in lookbacks:
                start_index = max(538004, last_global - lb)
                items = await client.disclosures(
                    disclosure_index=start_index,
                    disclosure_class=disclosure_class,
                    disclosure_type=disclosure_type,
                    company_id=company_id,
                )
                if items:
                    break

        if not items and start_index > 0 and int(state.last_disclosure_index or 0) <= 0:
            lookbacks = [50000, 100000]
            for lb in lookbacks:
                start_index = max(538004, last_global - lb)
                items = await client.disclosures(
                    disclosure_index=start_index,
                    disclosure_class=disclosure_class,
                    disclosure_type=disclosure_type,
                    company_id=company_id,
                )
                if items:
                    break

        inserted_or_updated = 0
        max_seen = int(state.last_disclosure_index or 0)
        for it in items[: max(1, int(max_items))]:
            try:
                di = int(it.get("disclosureIndex"))
            except Exception:
                continue

            if di > max_seen:
                max_seen = di

            detail = await client.disclosure_detail(disclosure_index=di, file_type="data")

            subject = detail.get("subject") or {}
            summary = detail.get("summary") or {}
            published_at = _parse_mkk_time(detail.get("time"))
            kap_link = detail.get("link")
            sender_title = detail.get("senderTitle")

            db_row = (
                db.query(DBKapDisclosure)
                .filter(DBKapDisclosure.ticker == ticker_u)
                .filter(DBKapDisclosure.disclosure_index == di)
                .first()
            )
            if not db_row:
                db_row = DBKapDisclosure(ticker=ticker_u, disclosure_index=di)
                db.add(db_row)

            db_row.disclosure_class = str(detail.get("disclosureClass") or it.get("disclosureClass") or "") or None
            db_row.disclosure_type = str(detail.get("disclosureType") or it.get("disclosureType") or "") or None
            db_row.sender_title = sender_title
            db_row.subject_tr = subject.get("tr")
            db_row.summary_tr = summary.get("tr")
            db_row.published_at = published_at
            db_row.kap_link = kap_link
            db_row.company_id_mkk = company_id
            db_row.raw = detail
            inserted_or_updated += 1

        state.last_disclosure_index = max_seen if max_seen > 0 else state.last_disclosure_index
        state.last_synced_at = datetime.utcnow()
        db.commit()
        return inserted_or_updated
    finally:
        db.close()
        await client.close()

async def get_company_kap_announcements(
    ticker: str,
    limit: int = 50,
    skip: int = 0,
    disclosure_class: Optional[str] = None,
    disclosure_type: Optional[str] = None,
) -> List[KAPAnnouncement]:
    """
    Get KAP announcements for a specific company
    """
    ticker_u = ticker.upper()
    db = next(get_db())
    try:
        rows_q = db.query(DBKapDisclosure).filter(DBKapDisclosure.ticker == ticker_u)
        if disclosure_class:
            rows_q = rows_q.filter(DBKapDisclosure.disclosure_class == disclosure_class)
        if disclosure_type:
            rows_q = rows_q.filter(DBKapDisclosure.disclosure_type == disclosure_type)
        rows = (
            rows_q.order_by(DBKapDisclosure.published_at.desc().nullslast(), DBKapDisclosure.disclosure_index.desc())
            .limit(limit)
            .offset(skip)
            .all()
        )

        if not rows and int(skip) == 0:
            try:
                await refresh_company_kap_disclosures(
                    ticker_u,
                    limit=limit,
                    disclosure_class=disclosure_class,
                    disclosure_type=disclosure_type,
                )
            except Exception:
                pass
            rows = (
                rows_q.order_by(DBKapDisclosure.published_at.desc().nullslast(), DBKapDisclosure.disclosure_index.desc())
                .limit(limit)
                .offset(skip)
                .all()
            )

        out: List[KAPAnnouncement] = []
        for r in rows:
            out.append(
                KAPAnnouncement(
                    id=r.id,
                    ticker=r.ticker,
                    disclosure_index=r.disclosure_index,
                    disclosure_class=r.disclosure_class,
                    disclosure_type=r.disclosure_type,
                    sender_title=r.sender_title,
                    subject_tr=r.subject_tr,
                    summary_tr=r.summary_tr,
                    published_at=r.published_at,
                    kap_link=r.kap_link,
                    created_at=r.created_at,
                )
            )
        return out
    finally:
        db.close()

async def get_recent_kap_announcements() -> List[KAPAnnouncement]:
    """
    Get recent KAP announcements for all companies
    """
    db = next(get_db())
    try:
        rows = (
            db.query(DBKapDisclosure)
            .order_by(DBKapDisclosure.published_at.desc().nullslast(), DBKapDisclosure.disclosure_index.desc())
            .limit(100)
            .all()
        )
        return [
            KAPAnnouncement(
                id=r.id,
                ticker=r.ticker,
                disclosure_index=r.disclosure_index,
                disclosure_class=r.disclosure_class,
                disclosure_type=r.disclosure_type,
                sender_title=r.sender_title,
                subject_tr=r.subject_tr,
                summary_tr=r.summary_tr,
                published_at=r.published_at,
                kap_link=r.kap_link,
                created_at=r.created_at,
            )
            for r in rows
        ]
    finally:
        db.close()