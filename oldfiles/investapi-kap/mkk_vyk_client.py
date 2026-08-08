import os
import time
from typing import Any, Dict, List, Optional
from urllib.parse import urlsplit

import httpx
from dotenv import load_dotenv


load_dotenv()


class MkkVykClient:
    def __init__(self, base_url: Optional[str] = None, api_key: Optional[str] = None, timeout: float = 30.0):
        api_url = (os.getenv("MKK_API_URL") or "").strip()
        if api_url:
            api_url = api_url.split("?", 1)[0].rstrip("/")

        # Prefer explicit base_url, then MKK_API_URL (OpenAPI server URL), then MKK_BASE_URL.
        resolved_base = (base_url or api_url or os.getenv("MKK_BASE_URL") or "").rstrip("/")
        self.base_url = resolved_base

        # Root host (used for token endpoints in some environments)
        self.root_url = self.base_url
        if self.base_url.endswith("/api/vyk"):
            self.root_url = self.base_url[: -len("/api/vyk")]
        else:
            # If base_url is just host, keep it as root.
            parts = urlsplit(self.base_url)
            if parts.scheme and parts.netloc:
                self.root_url = f"{parts.scheme}://{parts.netloc}"

        self.api_key = api_key or os.getenv("MKK_API_KEY")
        self.api_secret = os.getenv("MKK_API_SECRET")
        # Kept for backward-compatibility / experimentation, but the apigwdev OpenAPI
        # security scheme is BasicAuth where username is API_KEY.
        self.app_id = os.getenv("MKK_APP_ID")
        self._timeout = timeout

        self._token: Optional[str] = None
        self._token_expires_at: float = 0.0
        self._client = httpx.AsyncClient(timeout=timeout)

    async def close(self) -> None:
        await self._client.aclose()

    async def _get_token(self) -> Optional[str]:
        if self._token and time.time() < self._token_expires_at:
            return self._token

        if not self.root_url or not self.api_key:
            return None

        token_urls = [
            # As documented
            f"{self.root_url}/auth/generateToken",
            # Some gateways drop the /auth prefix
            f"{self.root_url}/generateToken",
            # Some gateways mount everything under /api/vyk
            f"{self.root_url}/api/vyk/auth/generateToken",
            f"{self.root_url}/api/vyk/generateToken",
        ]

        last_exc: Optional[Exception] = None
        data: Optional[Dict[str, Any]] = None
        for url in token_urls:
            try:
                resp = await self._client.get(url, params={"apiKey": self.api_key})
                resp.raise_for_status()
                payload = resp.json()
                if isinstance(payload, dict):
                    data = payload
                    break
            except httpx.HTTPStatusError as e:
                # Some environments expose this endpoint under a different prefix.
                last_exc = e
                continue
            except Exception as e:
                last_exc = e
                continue

        if data is None:
            # Test environments may not require token generation at all.
            if isinstance(last_exc, httpx.HTTPStatusError) and last_exc.response is not None:
                if last_exc.response.status_code == 404:
                    return None
            if last_exc:
                raise last_exc
            return None

        token = data.get("token")
        if not token:
            return None

        self._token = token
        self._token_expires_at = time.time() + 23.5 * 60 * 60
        return self._token

    async def _get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        if not self.base_url:
            raise RuntimeError("MKK_BASE_URL is not configured")

        headers: Dict[str, str] = {"Content-Type": "application/json"}
        token = await self._get_token()
        if token:
            headers["Authorization"] = token

        auth: Optional[httpx.BasicAuth] = None
        if self.api_key and self.api_secret:
            auth = httpx.BasicAuth(self.api_key, self.api_secret)
        elif self.app_id and self.api_secret:
            auth = httpx.BasicAuth(self.app_id, self.api_secret)

        url = f"{self.base_url}{path}"
        resp = await self._client.get(url, params=params or {}, headers=headers, auth=auth)

        if resp.status_code == 401 and token:
            self._token = None
            self._token_expires_at = 0.0
            token2 = await self._get_token()
            if token2:
                headers["Authorization"] = token2
                resp = await self._client.get(url, params=params or {}, headers=headers, auth=auth)

        resp.raise_for_status()
        return resp.json()

    async def last_disclosure_index(self) -> int:
        data = await self._get("/lastDisclosureIndex")
        val = data.get("lastDisclosureIndex")
        try:
            return int(val)
        except Exception:
            return 0

    async def members(self) -> List[Dict[str, Any]]:
        data = await self._get("/members")
        if isinstance(data, list):
            return data
        return []

    async def disclosures(
        self,
        disclosure_index: int,
        disclosure_class: Optional[str] = None,
        disclosure_type: Optional[str] = None,
        company_id: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        params: Dict[str, Any] = {"disclosureIndex": disclosure_index}
        if disclosure_class:
            params["disclosureClass"] = disclosure_class
        if disclosure_type:
            params["disclosureType"] = disclosure_type
        if company_id is not None:
            params["companyId"] = company_id

        try:
            data = await self._get("/disclosures", params=params)
        except httpx.HTTPStatusError as e:
            # MKK sometimes returns "Disclosure not found" as HTTP 400 instead of an empty list.
            try:
                if e.response is not None:
                    payload = e.response.json()
                    if isinstance(payload, dict) and payload.get("code") == "ER005":
                        return []
            except Exception:
                pass
            raise

        if isinstance(data, list):
            return data
        return []

    async def disclosure_detail(
        self,
        disclosure_index: int,
        file_type: str = "data",
        sub_report_list: Optional[str] = None,
    ) -> Dict[str, Any]:
        params: Dict[str, Any] = {"fileType": file_type}
        if sub_report_list:
            params["subReportList"] = sub_report_list

        data = await self._get(f"/disclosureDetail/{disclosure_index}", params=params)
        if isinstance(data, dict):
            return data
        return {}
