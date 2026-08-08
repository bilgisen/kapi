"""Merkezi yapılandırma: env vars (+ .env dosyası) ile çalışır."""
import os
import pathlib
from dotenv import load_dotenv

BASE_DIR = pathlib.Path(__file__).resolve().parent
load_dotenv(BASE_DIR.parent.parent / ".env")
load_dotenv(BASE_DIR / ".env")

KAP_BASE = os.getenv("KAP_BASE", "https://www.kap.org.tr")
WARMUP_URL = os.getenv("KAP_WARMUP_URL", "/tr/bildirim-sorgu")

CF_ACCOUNT_ID = os.getenv("CF_ACCOUNT_ID")
D1_DATABASE_ID = os.getenv("D1_DATABASE_ID")

# OAuth token kaynağı:
# 1) D1_ACCESS_TOKEN / D1_REFRESH_TOKEN env (öncelikli)
# 2) CF_TOKEN_FILE (wrangler default.toml yolu) — otomatik okunur
D1_ACCESS_TOKEN = os.getenv("D1_ACCESS_TOKEN")
D1_REFRESH_TOKEN = os.getenv("D1_REFRESH_TOKEN")
CF_OAUTH_CLIENT_ID = os.getenv("CF_OAUTH_CLIENT_ID", "54d11594-84e4-41aa-b438-e81b8fa78ee7")
def _default_token_path() -> str:
    xdg = os.path.join(os.environ.get("APPDATA", ""), "xdg.config")
    candidates = [
        os.path.join(xdg, ".wrangler", "config", "default.toml"),
        str(pathlib.Path.home() / ".config" / ".wrangler" / "config" / "default.toml"),
        str(pathlib.Path.home() / ".wrangler" / "config" / "default.toml"),
    ]
    for c in candidates:
        if pathlib.Path(c).is_file():
            return c
    return candidates[0]


WRANGLER_TOKEN_PATH = os.getenv("WRANGLER_TOKEN_PATH", _default_token_path())

D1_AUTO_REFRESH = os.getenv("D1_AUTO_REFRESH", "1") == "1"

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")