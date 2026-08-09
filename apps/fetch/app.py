"""S1-7: FastAPI servis — health, cron-refresh, sync-state (FastAPICloud deploy).

Kullanım (yerel test):
    uvicorn app:app --port 8100

Endpoints:
    GET  /health              -> durum + son senkron
    POST /api/cron/refresh    -> 2 günlük pencere çek + detay (+ PDF) — X-Fetch-Secret ile
    GET  /api/sync-state      -> kap_sync_state satırı
"""
from __future__ import annotations

import json
import os
import threading
from datetime import date, timedelta

from fastapi import FastAPI, Header, HTTPException

try:
    from apps.fetch import config
    from apps.fetch.d1_client import D1Client
    from apps.fetch.fetch_window import main as ingest_window
except ImportError:
    import config
    from d1_client import D1Client
    from fetch_window import main as ingest_window

app = FastAPI(title="kapi-fetch", version="0.1.0")

REFRESH_SECRET = os.getenv("FASTAPI_SECRET_KEY", "change-me")


def _sync_state() -> dict | None:
    try:
        res = D1Client().execute(
            "SELECT * FROM kap_sync_state WHERE id = 1"
        ).get("results")
        return res[0] if res else None
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


@app.get("/health")
def health() -> dict:
    db_ok = True
    db_err = None
    try:
        D1Client().execute("SELECT 1")
    except Exception as exc:  # noqa: BLE001
        db_ok, db_err = False, str(exc)
    return {
        "status": "ok" if db_ok else "degraded",
        "service": "kapi-fetch",
        "db": "ok" if db_ok else db_err,
        "sync_state": _sync_state(),
    }


@app.get("/api/sync-state")
def sync_state() -> dict:
    state = _sync_state()
    if state is None:
        raise HTTPException(status_code=404, detail="sync kaydı yok")
    return state


def _run_refresh() -> dict:
    try:
        ingest_window(["--days", "2"])
        return {"ok": True}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


@app.post("/api/cron/refresh")
def cron_refresh(x_fetch_secret: str | None = Header(default=None)) -> dict:
    if x_fetch_secret != REFRESH_SECRET:
        raise HTTPException(status_code=401, detail="yetkisiz")
    # uzun sürebilir — arka planda çalıştır, anında dön
    result: dict = {}

    def worker() -> None:
        result.update(_run_refresh())

    t = threading.Thread(target=worker, daemon=True)
    t.start()
    return {"accepted": True, "window_days": 2}