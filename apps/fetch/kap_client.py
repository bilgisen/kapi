"""KAP public JSON API istemcisi (S1-1).

Spike doğrulamalı endpoint'ler (docs/spike-kap-api.md):
- POST /tr/api/disclosure/members/byCriteria  -> bildirim listesi (FFFF = tüm piyasa)
- GET  /tr/api/member/filter/{ticker}         -> mkkMemberOid + permaLink
- GET  /tr/api/notification/attachment-detail/{disclosureIndex}
- GET  /en/api/BildirimPdf/{disclosureIndex}   -> temiz PDF (öncelikli)
- GET  /tr/api/file/download/{objId}           -> Java byte[] wrapper PDF

KAP WAF notları: önce warmup (GET /tr/bildirim-sorgu), 30sn timeout,
HTTP 666/403'te kısa uyku + warmup tekrarı.
"""
from __future__ import annotations

import time
from datetime import date

import requests

try:
    from apps.fetch.config import KAP_BASE, WARMUP_URL
except ImportError:
    from config import KAP_BASE, WARMUP_URL

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.kap.org.tr/tr/bildirim-sorgu",
}

MAX_RECORDS_PER_REQUEST = 2000  # API tavanı (spike 1.2'de doğrulandı)


class KapError(Exception):
    pass


class KapClient:
    def __init__(self, timeout: int = 30, max_retries: int = 3):
        self.timeout = timeout
        self.max_retries = max_retries
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)

    # ---- oturum ----
    def warmup(self) -> None:
        """WAF (HTTP 666) koruması için sorgu sayfasını önceden önbelleğe alır."""
        self.session.get(KAP_BASE + WARMUP_URL, timeout=self.timeout)

    def _request(self, method: str, path: str, json: dict | None = None) -> requests.Response:
        last_err: Exception | None = None
        for attempt in range(self.max_retries):
            try:
                resp = self.session.request(
                    method, KAP_BASE + path, json=json, timeout=self.timeout
                )
                if resp.status_code == 666:
                    time.sleep(2 * (attempt + 1))
                    self.warmup()
                    continue
                resp.raise_for_status()
                # KAP charset belirtmez (application/json) — requests Latin-1
                # varsayar ve UTF-8 içerik çift-encode olur (mojibake). Zorla.
                resp.encoding = "utf-8"
                return resp
            except requests.RequestException as exc:
                last_err = exc
                time.sleep(2 * (attempt + 1))
        raise KapError(f"{method} {path} başarısız: {last_err}") from last_err

    # ---- bildirim listesi (tüm piyasa, FFFF) ----
    def list_disclosures(self, from_date: date, to_date: date) -> list[dict]:
        """byCriteria: tüm piyasa bildirimleri (K2).

        Pencere 1-2 gün tutulmalı (2000 kayıt tavanı; spike: 614/gün).
        """
        body = {
            "fromDate": from_date.isoformat(),
            "toDate": to_date.isoformat(),
            "mkkMemberOidList": [],
            "subjectList": [],
            "disclosureType": [],
            "disclosure": "FFFF",
        }
        resp = self._request("POST", "/tr/api/disclosure/members/byCriteria", json=body)
        data = resp.json()
        if len(data) >= MAX_RECORDS_PER_REQUEST:
            raise KapError(
                f"Tavan aşıldı: {len(data)} kayıt — pencere 1 güne düşürülmeli"
            )
        return data

    # ---- şirket ----
    def member_by_ticker(self, ticker: str) -> dict | None:
        resp = self._request("GET", f"/tr/api/member/filter/{ticker}")
        data = resp.json()
        return data if data else None

    # ---- ayrıntı ----
    def attachment_detail(self, disclosure_index: str | int) -> dict | None:
        resp = self._request(
            "GET", f"/tr/api/notification/attachment-detail/{disclosure_index}"
        )
        data = resp.json()
        if isinstance(data, list):
            data = data[0] if data else None
        if isinstance(data, dict) and data:
            return data
        return None

    # ---- PDF ----
    def bildirim_pdf(self, disclosure_index: str | int) -> bytes:
        """KAP'ın ürettiği temiz PDF (wrapper yok)."""
        resp = self._request("GET", f"/en/api/BildirimPdf/{disclosure_index}")
        content = resp.content
        if content[:4] == b"%PDF":
            return content
        raise KapError("BildirimPdf PDF değil (wrapper olabilir)")

    def file_download(self, obj_id: str) -> bytes:
        """Ham ek PDF — Java byte[] wrapper; PDF verisi %PDF marker'ından başlar."""
        resp = self._request("GET", f"/tr/api/file/download/{obj_id}")
        content = resp.content
        marker = content.find(b"%PDF")
        if marker >= 0:
            return content[marker:]
        raise KapError("file/download içeriğinde %PDF bulunamadı")