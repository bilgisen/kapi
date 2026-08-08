import argparse
import asyncio
import os
import sys
from typing import Iterable, List, Optional

from dotenv import load_dotenv

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

load_dotenv(os.path.join(_REPO_ROOT, ".env"))

from database import Company, SessionLocal, create_tables
from services.kap_service import sync_company_kap_disclosures_incremental_with_context
from services.mkk_vyk_client import MkkVykClient


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Incrementally sync MKK KAP disclosures into kap_disclosures cache.")
    p.add_argument(
        "--tickers",
        type=str,
        default=None,
        help="Comma-separated tickers (e.g. AEFES,BIMAS). If omitted, uses all companies from DB.",
    )
    p.add_argument(
        "--max-items",
        type=int,
        default=200,
        help="Max items per ticker to process in this run (default: 200).",
    )
    p.add_argument(
        "--concurrency",
        type=int,
        default=2,
        help="How many tickers to process concurrently (default: 2).",
    )
    p.add_argument(
        "--class",
        dest="disclosure_class",
        type=str,
        default=None,
        help="Optional disclosureClass filter (FR/ODA/DG/DUY).",
    )
    p.add_argument(
        "--type",
        dest="disclosure_type",
        type=str,
        default=None,
        help="Optional disclosureType filter.",
    )
    return p.parse_args()


def _iter_target_tickers(tickers_arg: Optional[str]) -> Iterable[str]:
    if tickers_arg:
        for t in tickers_arg.split(","):
            t = (t or "").strip().upper()
            if t:
                yield t
        return

    db = SessionLocal()
    try:
        rows = db.query(Company.ticker).all()
        for (ticker,) in rows:
            if ticker:
                yield str(ticker).strip().upper()
    finally:
        db.close()


async def main() -> int:
    args = _parse_args()

    create_tables()

    tickers = list(_iter_target_tickers(args.tickers))
    if not tickers:
        print("No tickers found")
        return 0

    client = MkkVykClient()
    try:
        members = await client.members()
        last_global = await client.last_disclosure_index()

        ticker_to_company_id = {}
        for m in members:
            stock_code = str(m.get("stockCode") or "")
            codes = [c.strip().upper() for c in stock_code.replace(";", ",").split(",") if c.strip()]
            try:
                cid = int(m.get("id"))
            except Exception:
                continue
            for c in codes:
                if c:
                    ticker_to_company_id[c] = cid

        sem = asyncio.Semaphore(max(1, int(args.concurrency)))

        async def worker(t: str):
            async with sem:
                try:
                    company_id = ticker_to_company_id.get(t.upper())
                    if not company_id:
                        print(f"{t}: skipped (companyId not found)")
                        return 0
                    n = await sync_company_kap_disclosures_incremental_with_context(
                        ticker=t,
                        company_id=int(company_id),
                        last_global=int(last_global),
                        client=client,
                        max_items=int(args.max_items),
                        disclosure_class=args.disclosure_class,
                        disclosure_type=args.disclosure_type,
                    )
                    print(f"{t}: synced {n}")
                    return n
                except Exception as e:
                    print(f"{t}: error: {e}")
                    return 0

        results = await asyncio.gather(*(worker(t) for t in tickers))
        print(f"Done. tickers={len(tickers)} total_synced={sum(results)}")
        return 0
    finally:
        await client.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
