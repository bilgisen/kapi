"""Cloudflare D1 HTTP API (v4 REST) yazma katmanı (S1-3).

Kimlik: wrangler OAuth token'ı (dashboard API token'ı gerekmez — S0-6 kanıtı).
- Access token ~1 saat yaşar; 401/10000 alındığında refresh_token ile otomatik
  yenilenir (POST https://dash.cloudflare.com/oauth2/token, client_id wrangler'ınki).
- Token kaynak sırası:
    1) env: D1_ACCESS_TOKEN / D1_REFRESH_TOKEN
    2) wrangler config: WRANGLER_TOKEN_PATH (default.toml) — otomatik okunur
- Refresh başarılı olursa token'lar default.toml'da da güncellenir (rotation!).
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

import requests

try:
    from apps.fetch import config
except ImportError:
    import config

OAUTH_TOKEN_URL = "https://dash.cloudflare.com/oauth2/token"
API_BASE = "https://api.cloudflare.com/client/v4"


class D1Error(Exception):
    pass


class D1Client:
    def __init__(
        self,
        account_id: str | None = None,
        database_id: str | None = None,
        access_token: str | None = None,
        refresh_token: str | None = None,
        token_path: Path | None = None,
        auto_refresh: bool = True,
    ):
        self.account_id = account_id or config.CF_ACCOUNT_ID
        self.database_id = database_id or config.D1_DATABASE_ID
        if not self.account_id or not self.database_id:
            raise D1Error("CF_ACCOUNT_ID / D1_DATABASE_ID gerekli (.env)")

        self.token_path = token_path or Path(config.WRANGLER_TOKEN_PATH)
        self.auto_refresh = auto_refresh

        if access_token:
            self.access_token = access_token
            self.refresh_token = refresh_token
        else:
            self._load_tokens_from_file()

    # ---- token yönetimi ----
    def _load_tokens_from_file(self) -> None:
        self.access_token = config.D1_ACCESS_TOKEN
        self.refresh_token = config.D1_REFRESH_TOKEN
        if self.access_token:
            return
        p = self.token_path.expanduser()
        if not p.is_file():
            raise D1Error(f"Token dosyası bulunamadı: {p} (wrangler login yapmalı)")
        text = p.read_text(encoding="utf-8")
        self.access_token = self._toml_get(text, "oauth_token")
        self.refresh_token = self._toml_get(text, "refresh_token")
        if not self.access_token:
            raise D1Error(f"{p} içinde oauth_token yok")

    @staticmethod
    def _toml_get(text: str, key: str) -> str | None:
        m = re.search(rf'^{key}\s*=\s*"([^"]*)"', text, re.MULTILINE)
        return m.group(1) if m else None

    def save_tokens(self) -> None:
        """Yenilenen token'ları toml'a geri yazar (rotation güvenliği)."""
        if not self.token_path.is_file():
            return
        text = self.token_path.read_text(encoding="utf-8")
        text = re.sub(
            r'(oauth_token = )"[^"]*"',
            rf'\1"{self.access_token}"',
            text,
        )
        text = re.sub(
            r'(refresh_token = )"[^"]*"',
            rf'\1"{self.refresh_token}"',
            text,
        )
        self.token_path.write_text(text, encoding="utf-8")

    def refresh(self) -> None:
        if not self.refresh_token:
            raise D1Error("Refresh token yok — D1_ACCESS_TOKEN API token (cfut_) olmalı (K13)")
        resp = requests.post(
            OAUTH_TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "client_id": config.CF_OAUTH_CLIENT_ID,
                "refresh_token": self.refresh_token or "",
            },
            timeout=30,
        )
        if resp.status_code != 200:
            raise D1Error(f"Token refresh başarısız ({resp.status_code}): {resp.text[:200]}")
        data = resp.json()
        self.access_token = data["access_token"]
        self.refresh_token = data.get("refresh_token", self.refresh_token)
        if config.D1_AUTO_REFRESH:
            self.save_tokens()

    # ---- sorgu ----
    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    def _endpoint(self) -> str:
        return (
            f"{API_BASE}/accounts/{self.account_id}/d1/database/{self.database_id}/query"
        )

    def execute(self, sql: str, params: list | None = None) -> dict:
        """Tek sorgu çalıştırır; 401/10000'de refresh sonrası bir kez tekrar dener."""
        payload: dict = {"sql": sql}
        if params:
            payload["params"] = params

        for attempt in (0, 1):
            resp = requests.post(
                self._endpoint(), headers=self._headers(), json=payload, timeout=30
            )
            # K13: API token (cfut_) 401 üretmez; OAuth token'da 401 -> refresh.
            is_api_token = bool(self.access_token and self.access_token.startswith("cfut_"))
            if resp.status_code == 401 and attempt == 0 and self.auto_refresh and not is_api_token:
                self.refresh()
                continue
            if resp.status_code != 200:
                raise D1Error(
                    f"D1 sorgu hatası ({resp.status_code}): {resp.text[:400]}"
                )
            body = resp.json()
            if not body.get("success"):
                raise D1Error(f"D1 hata: {json.dumps(body.get('errors', []), ensure_ascii=False)[:400]}")
            results = body["result"][0] if body.get("result") else {}
            return results
        raise D1Error("Token refresh sonrası da 401 alındı")

    def execute_many(self, statements: list[dict]) -> list[dict]:
        """Batch etkileşimsiz çoklu sorgu (raw endpoint)."""
        results = []
        for stmt in statements:
            results.append(self.execute(stmt["sql"], stmt.get("params")))
        return results

    def upsert_simple(self, sql: str, params: list) -> None:
        self.execute(sql, params)