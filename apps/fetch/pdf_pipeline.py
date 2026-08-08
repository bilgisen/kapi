"""S1-5: PDF pipeline — öncelikli konular için PDF çek + metin ekstraksiyonu.

Akış (spike 1.4'e göre):
1) /en/api/BildirimPdf/{index}  → temiz PDF (öncelikli, wrapper yok)
2) başarısızsa attachment_detail → attachment(objId) → /file/download → %PDF marker'ı
3) pdfminer.six ile metin (cp1252 bilgisi pdfminer tarafından çözülür)
4) ilk 8K karaktere kırp → kap_notifications.pdf_text

Öncelik konuları (plan S1 Faz 5): Temettü, Finansal Rapor, Özel Durum,
Sermaye Artırımı, Birleşme, Genel Kurul, DKB.
"""
from __future__ import annotations

import io
import logging

from d1_client import D1Client
from kap_client import KapClient

PRIORITY_KEYWORDS = [
    "temettü",
    "kar payı",
    "finansal rapor",
    "faaliyet raporu",
    "özel durum",
    "sermaye artırımı",
    "birleşme",
    "genel kurul",
    "dkb",
]
PRIORITY_CLASSES = {"FR", "CA", "GK"}
MAX_PDF_TEXT = 8000

log = logging.getLogger("pdf_pipeline")


def is_priority(item: dict) -> bool:
    """Bildirimin PDF çekilmeye değer olup olmadığı (S1 Faz 5 matrix)."""
    cls = str(item.get("disclosureClass") or "").upper()
    if cls in PRIORITY_CLASSES:
        return True
    haystack = " ".join(
        str(item.get(k) or "") for k in ("kapTitle", "subject", "summary", "disclosureType")
    ).lower()
    return any(kw in haystack for kw in PRIORITY_KEYWORDS)


def extract_pdf_text(pdf_bytes: bytes) -> str | None:
    """pdfminer.six ile metin; başarısızda None."""
    try:
        from pdfminer.high_level import extract_text

        text = extract_text(io.BytesIO(pdf_bytes))
    except Exception as exc:  # noqa: BLE001
        log.warning("PDF metin ekstraksiyonu hatası: %s", exc)
        return None
    if not text or not text.strip():
        return None
    return text.strip()[:MAX_PDF_TEXT]


def fetch_pdf_bytes(client: KapClient, item: dict, index: str) -> bytes | None:
    """Tercih sırası: BildirimPdf (temiz) → file download (wrapper)."""
    try:
        pdf = client.bildirim_pdf(index)
        if pdf[:4] == b"%PDF":
            return pdf
    except Exception as exc:  # noqa: BLE001
        log.debug("BildirimPdf(%s) başarısız: %s — wrapper denenecek", index, exc)

    try:
        detail = client.attachment_detail(index)
        attachments = (detail or {}).get("attachments") or []
        if not attachments:
            return None
        obj_id = attachments[0].get("objId")
        if not obj_id:
            return None
        return client.file_download(obj_id)
    except Exception as exc:  # noqa: BLE001
        log.warning("PDF fallback(%s) başarısız: %s", index, exc)
        return None


def fetch_and_store(client: KapClient, d1: D1Client, item: dict) -> bool:
    """Öncelikliyse PDF çeker, metni D1'e yazar. Başarı durumu döner."""
    if not is_priority(item):
        return False
    index = str(item.get("disclosureIndex") or "")
    if not index:
        return False
    pdf_bytes = fetch_pdf_bytes(client, item, index)
    if not pdf_bytes:
        d1.execute(
            "UPDATE kap_notifications SET pdf_error = ?, updated_at = datetime('now') WHERE disclosure_index = ?",
            ["pdf yüklenemedi", index],
        )
        return False
    text = extract_pdf_text(pdf_bytes)
    if text is None:
        d1.execute(
            "UPDATE kap_notifications SET pdf_error = ?, updated_at = datetime('now') WHERE disclosure_index = ?",
            ["parse hatası", index],
        )
        return False
    d1.execute(
        "UPDATE kap_notifications SET pdf_text = ?, pdf_error = NULL, updated_at = datetime('now') WHERE disclosure_index = ?",
        [text, index],
    )
    return True