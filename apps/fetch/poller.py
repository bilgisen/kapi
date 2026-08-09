"""S1-4: Polling orkestrasyonu — pazar saati 3dk / dışı 15dk, tek-instance lock.

- TR iş saatleri (Hafta içi 09:15-18:35): 3dk aralık, 2 günlük pencere
- Dışı: 15dk aralık
- Tek instance: O_EXCL lock dosyası + PID + stale tespiti
- Hata: backoff (kademeli uyku, azami 30dk), sonra normal döngü

Kullanım:
    python poller.py            # sonsuz döngü
    python poller.py --once     # tek çevrim (test)
    python poller.py --force    # saatten bağımsız zorla çalıştır
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from datetime import datetime, time as datetime_time
from pathlib import Path

try:
    from apps.fetch.d1_client import D1Client
    from apps.fetch.fetch_window import main as ingest_window
except ImportError:
    from d1_client import D1Client
    from fetch_window import main as ingest_window

MARKET_INTERVAL = 3 * 60
FALLBACK_INTERVAL = 15 * 60
MAX_BACKOFF = 30 * 60
STALE_LOCK_SECONDS = 4 * 60 * 60
LOCKFILE = Path(__file__).resolve().parent / ".poller.lock"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("poller")


def is_market_time(now: datetime | None = None) -> bool:
    """TR pazarı: hafta içi 09:15-18:35."""
    now = now or datetime.now()
    if now.weekday() >= 5:
        return False
    t = now.time()
    return datetime_time(9, 15) <= t <= datetime_time(18, 35)


class PollerLock:
    def __init__(self, path: Path = LOCKFILE):
        self.path = path
        self.fd: int | None = None

    def _remove(self) -> None:
        try:
            self.path.unlink()
        except FileNotFoundError:
            pass

    def _process_alive(self, pid: int) -> bool:
        try:
            os.kill(pid, 0)  # sinyal göndermeden varlık kontrolü
            return True
        except OSError:
            return False

    def acquire(self) -> bool:
        try:
            self.fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(self.fd, str(os.getpid()).encode())
            log.debug("Lock alındı: %s", self.path)
            return True
        except FileExistsError:
            if self._is_stale():
                log.warning("Stale lock bulundu — siliniyor")
                self._remove()
                return self.acquire()
            return False

    def _is_stale(self) -> bool:
        try:
            if time.time() - self.path.stat().st_mtime < STALE_LOCK_SECONDS:
                return False
            pid = int(self.path.read_text(encoding="ascii").strip() or "0")
        except (OSError, ValueError):
            return True
        return not self._process_alive(pid)

    def release(self) -> None:
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None
        self._remove()


def run_once() -> None:
    """Tek çevrim: 2 günlük pencereyi çeker ve D1'e yazar."""
    D1Client().execute("SELECT 1")
    ingest_window(["--days", "2"])


def main() -> int:
    p = argparse.ArgumentParser(description="KAP poller")
    p.add_argument("--once", action="store_true", help="tek çevrim, çık")
    p.add_argument("--force", action="store_true", help="günlük pencere zorla (saati yok say)")
    args = p.parse_args()

    lock = PollerLock()
    if not lock.acquire():
        log.error("Başka bir poller örneği çalışıyor (%s)", lock.path)
        return 1
    try:
        if args.once:
            run_once()
            return 0

        log.info("Poller başladı (pid=%s)", os.getpid())
        consecutive_errors = 0
        while True:
            try:
                run_once()
                consecutive_errors = 0
            except Exception as exc:  # noqa: BLE001
                consecutive_errors += 1
                wait = min(FALLBACK_INTERVAL * (2 ** (consecutive_errors - 1)), MAX_BACKOFF)
                log.error("Çevrim hatası (%s): %s — %ss sonra tekrar", consecutive_errors, exc, wait)
                time.sleep(wait)
                continue
            interval = MARKET_INTERVAL if is_market_time() else FALLBACK_INTERVAL
            log.info("Sonraki çevrim %ss sonra (%s)", interval, datetime.now().strftime("%H:%M"))
            time.sleep(interval)
    finally:
        lock.release()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())