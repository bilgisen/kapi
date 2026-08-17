import json
import logging
import requests
from apps.fetch.d1_client import D1Client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sync_kv_prices")

def main():
    d1 = D1Client()
    logger.info("Fetching fresh stocks from Veribor...")
    
    # 1. Fetch fresh stocks from Veribor
    try:
        r = requests.get("https://veribor.fastapicloud.dev/stocks?limit=2000", timeout=15)
        if r.status_code != 200:
            logger.error(f"Failed to fetch stocks from Veribor: {r.status_code}")
            return
        stocks_data = r.json().get("data", [])
        if not stocks_data:
            logger.error("No stocks data returned from Veribor!")
            return
        logger.info(f"Fetched {len(stocks_data)} stocks successfully.")
    except Exception as e:
        logger.error(f"Error fetching from Veribor: {e}")
        return

    # 2. Prepare payload and write to both KV namespaces
    kv_namespaces = [
        "80cebef8e65b44b386d2af909a6c474c",  # HONO_KV_CACHE
        "56d1f076986e477dae0c708b744b7df1"   # TAPI_KV_CACHE
    ]
    
    now_iso = d1.execute("SELECT datetime('now')").get("results")[0]["datetime('now')"] + "Z"
    
    headers = d1._headers()
    
    for kv_id in kv_namespaces:
        logger.info(f"Writing pool to KV namespace {kv_id}...")
        
        # Write pool:bist_stocks:data
        url_data = f"https://api.cloudflare.com/client/v4/accounts/{d1.account_id}/storage/kv/namespaces/{kv_id}/values/pool:bist_stocks:data"
        r_data = requests.put(url_data, headers=headers, data=json.dumps(stocks_data, ensure_ascii=False).encode('utf-8'))
        
        # Write pool:bist_stocks:last_updated
        url_time = f"https://api.cloudflare.com/client/v4/accounts/{d1.account_id}/storage/kv/namespaces/{kv_id}/values/pool:bist_stocks:last_updated"
        r_time = requests.put(url_time, headers=headers, data=now_iso.encode('utf-8'))
        
        logger.info(f"KV data write status: {r_data.status_code}, time write status: {r_time.status_code}")
        
        # 3. Purge EREGL and PLTUR cache keys to force refresh
        keys_to_purge = [
            "company:EREGL", "detail:EREGL", "symbol:EREGL", "ta:EREGL", "ceo-report:EREGL",
            "company:PLTUR", "detail:PLTUR", "symbol:PLTUR", "ta:PLTUR", "ceo-report:PLTUR"
        ]
        for key in keys_to_purge:
            url_purge = f"https://api.cloudflare.com/client/v4/accounts/{d1.account_id}/storage/kv/namespaces/{kv_id}/values/{key}"
            requests.delete(url_purge, headers=headers)
            
    logger.info("Successfully synced all real-time prices and purged EREGL/PLTUR caches!")

if __name__ == "__main__":
    main()
