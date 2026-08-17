import json
import logging
from apps.fetch.d1_client import D1Client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("fix_db_encoding")

def fix_mojibake(s: str | None) -> str | None:
    if not s:
        return s
    try:
        # If it's already correct, encoding as cp1252 and decoding as utf-8
        # might fail or result in the same string if it's ascii.
        # But if it has typical mojibake characters, we clean it up.
        if any(c in s for c in ["Ä", "Å", "Ã", "Ö", "Ü", "Ç", "ğ", "ı", "ş", "ö", "ü", "ç"]):
            # Test if it can be encoded to cp1252 and decoded as utf-8
            raw_bytes = s.encode('cp1252', errors='ignore')
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
    rows = d1.execute("SELECT n.disclosure_index, n.title, n.subject, n.summary, n.disclosure_body, n.pdf_text, a.summary_tr, a.impact_analysis FROM kap_notifications n LEFT JOIN kap_analysis a ON a.disclosure_index = n.disclosure_index ORDER BY n.publish_date DESC LIMIT 100").get("results")
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
        pdf_text = fix_mojibake(row.get("pdf_text"))
        summary_tr = fix_mojibake(row.get("summary_tr"))
        impact = fix_mojibake(row.get("impact_analysis"))
        
        # Check if anything changed
        has_change = (
            title != row.get("title") or
            subject != row.get("subject") or
            summary != row.get("summary") or
            body != row.get("disclosure_body") or
            pdf_text != row.get("pdf_text") or
            summary_tr != row.get("summary_tr") or
            impact != row.get("impact_analysis")
        )
        
        if has_change:
            logger.info(f"Updating row {idx}...")
            d1.execute(
                "UPDATE kap_notifications SET title = ?, subject = ?, summary = ?, disclosure_body = ?, pdf_text = ? WHERE disclosure_index = ?",
                [title, subject, summary, body, pdf_text, idx]
            )
            d1.execute(
                "UPDATE kap_analysis SET summary_tr = ?, impact_analysis = ? WHERE disclosure_index = ?",
                [summary_tr, impact, idx]
            )
            updated_count += 1
            
    logger.info(f"Successfully fixed encoding for {updated_count} notification rows!")

    # Now fix kap_disclosure_files
    logger.info("Fetching disclosure files from D1...")
    files = d1.execute("SELECT obj_id, file_name FROM kap_disclosure_files LIMIT 100").get("results")
    if files:
        updated_files = 0
        for f in files:
            obj_id = f["obj_id"]
            name = fix_mojibake(f.get("file_name"))
            if name != f.get("file_name"):
                logger.info(f"Updating file {obj_id}...")
                d1.execute(
                    "UPDATE kap_disclosure_files SET file_name = ? WHERE obj_id = ?",
                    [name, obj_id]
                )
                updated_files += 1
        logger.info(f"Successfully fixed encoding for {updated_files} file rows!")

if __name__ == "__main__":
    main()
