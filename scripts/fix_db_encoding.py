import json
import logging
from apps.fetch.d1_client import D1Client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("fix_db_encoding")

def fix_mojibake(s: str | None) -> str | None:
    if not s:
        return s
    try:
        # If it's already correct, encoding as latin-1 and decoding as utf-8
        # might fail or result in the same string if it's ascii.
        # But if it has typical mojibake characters, we clean it up.
        if any(c in s for c in ["Ä", "Å", "Ã", "Ö", "Ü", "Ç", "ğ", "ı", "ş", "ö", "ü", "ç"]):
            # Test if it can be encoded to latin-1 and decoded as utf-8
            raw_bytes = s.encode('latin-1', errors='ignore')
            decoded = raw_bytes.decode('utf-8', errors='ignore')
            if decoded and decoded != s:
                return decoded
    except Exception:
        pass
    return s

def main():
    d1 = D1Client()
    logger.info("Fetching all notifications from D1...")
    
    # Select all rows
    rows = d1.execute("SELECT n.disclosure_index, n.title, n.subject, n.summary, n.disclosure_body, a.summary_tr, a.impact_analysis FROM kap_notifications n LEFT JOIN kap_analysis a ON a.disclosure_index = n.disclosure_index ORDER BY n.publish_date DESC LIMIT 100").get("results")
    if not rows:
        logger.warning("No rows found!")
        return
        
    logger.info(f"Found {len(rows)} rows. Processing...")
    
    updated_count = 0
    for row in rows:
        idx = row["disclosure_index"]
        title = fix_mojibake(row.get("title"))
        subject = fix_mojibake(row.get("subject"))
        summary = fix_mojibake(row.get("summary"))
        body = fix_mojibake(row.get("disclosure_body"))
        summary_tr = fix_mojibake(row.get("summary_tr"))
        impact = fix_mojibake(row.get("impact_analysis"))
        
        # Check if anything changed
        has_change = (
            title != row.get("title") or
            subject != row.get("subject") or
            summary != row.get("summary") or
            body != row.get("disclosure_body") or
            summary_tr != row.get("summary_tr") or
            impact != row.get("impact_analysis")
        )
        
        if has_change:
            logger.info(f"Updating row {idx}...")
            d1.execute(
                "UPDATE kap_notifications SET title = ?, subject = ?, summary = ?, disclosure_body = ? WHERE disclosure_index = ?",
                [title, subject, summary, body, idx]
            )
            d1.execute(
                "UPDATE kap_analysis SET summary_tr = ?, impact_analysis = ? WHERE disclosure_index = ?",
                [summary_tr, impact, idx]
            )
            updated_count += 1
            
    logger.info(f"Successfully fixed encoding for {updated_count} rows!")

if __name__ == "__main__":
    main()
