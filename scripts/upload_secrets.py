import requests
from apps.fetch.d1_client import D1Client

def main():
    d = D1Client()
    headers = d._headers()
    
    workers = ["kapi-ai", "hono"]
    secret_key = "GEMINI_API_KEY"
    secret_val = "AIzaSyD-jSVRQ2k5N8XsIVufllVHy7oe2KBWfD4"
    
    for worker in workers:
        print(f"Uploading secret {secret_key} to {worker}...")
        url = f"https://api.cloudflare.com/client/v4/accounts/{d.account_id}/workers/scripts/{worker}/secrets"
        
        payload = {
            "name": secret_key,
            "text": secret_val,
            "type": "secret_text"
        }
        
        r = requests.put(url, headers=headers, json=payload)
        print(f"Status for {worker}: {r.status_code}, response: {r.text}")

if __name__ == "__main__":
    main()
