"""S1-2: XU100 üyelik listesini bist100_members'a yazar (etiketleme amaçlı, K2).

Kaynak: Hono src/lib/index-constituents.json (XU100 anahtarı).
Kullanım: python seed_bist100.py [--source path]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from apps.fetch.d1_client import D1Client
except ImportError:
    from d1_client import D1Client

KAP_ROOT = Path(__file__).resolve().parents[2]  # ..\..\kap
DEFAULT_SOURCE = KAP_ROOT.parent / "hono" / "hono" / "src" / "lib" / "index-constituents.json"


def load_xu100(source: Path) -> list[str]:
    data = json.loads(source.read_text(encoding="utf-8"))
    if "XU100" not in data:
        raise SystemExit(f"{source} içinde XU100 anahtarı yok")
    return data["XU100"]


def main() -> None:
    parser = argparse.ArgumentParser(description="bist100_members seed")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--reset", action="store_true", help="aktif olmayanları kapat")
    args = parser.parse_args()

    tickers = load_xu100(args.source)
    d1 = D1Client()

    for t in tickers:
        d1.execute(
            """
            INSERT INTO bist100_members (ticker, is_active, updated_at)
            VALUES (?, 1, datetime('now'))
            ON CONFLICT(ticker) DO UPDATE SET is_active = 1, updated_at = datetime('now')
            """,
            [t],
        )
    if args.reset:
        placeholders = ",".join("?" for _ in tickers)
        d1.execute(
            f"UPDATE bist100_members SET is_active = 0 WHERE ticker NOT IN ({placeholders})",
            tickers,
        )
    print(f"bist100_members: {len(tickers)} satır upsert edildi")


if __name__ == "__main__":
    sys.exit(main())