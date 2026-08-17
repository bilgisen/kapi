import json
import logging
from apps.fetch.kap_client import KapClient
from apps.fetch.d1_client import D1Client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("fix_single_disclosure")

def main():
    disclosure_index = "1650959"
    logger.info(f"Fetching disclosure {disclosure_index} from KAP...")
    
    # 1. Fetch from KAP directly
    client = KapClient()
    client.warmup()
    
    # Since we need the title and other metadata, let's search in the list first
    import datetime
    to = datetime.date.today()
    from_ = to - datetime.timedelta(days=4)
    items = client.list_disclosures(from_, to)
    
    item = None
    for it in items:
        if str(it.get("disclosureIndex")) == disclosure_index:
            item = it
            break
            
    if not item:
        logger.error(f"Disclosure {disclosure_index} not found in the last 4 days on KAP!")
        return
        
    logger.info(f"Found on KAP! Title: {item.get('kapTitle')}")
    
    # 2. Upsert into D1
    d1 = D1Client()
    logger.info("Updating D1 kap_notifications table...")
    
    # Let's perform the update explicitly to avoid any mojibake
    d1.execute(
        "UPDATE kap_notifications SET title = ?, subject = ?, summary = ? WHERE disclosure_index = ?",
        [item.get("kapTitle"), item.get("subject"), item.get("summary"), disclosure_index]
    )
    
    # 3. Purge KV cache
    kv_namespaces = [
        "80cebef8e65b44b386d2af909a6c474c",  # HONO_KV_CACHE
        "56d1f076986e477dae0c708b744b7df1"   # TAPI_KV_CACHE
    ]
    
    headers = d1._headers()
    
    for kv_id in kv_namespaces:
        key = f"kap:detail:v2:{disclosure_index}"
        url_purge = f"https://api.cloudflare.com/client/v4/accounts/{d1.account_id}/storage/kv/namespaces/{kv_id}/values/{key}"
        import requests
        requests.delete(url_purge, headers=headers)
        
    logger.info(f"Successfully fixed and purged disclosure {disclosure_index}!")

if __name__ == "__main__":
    main()
