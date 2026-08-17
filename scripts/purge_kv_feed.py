import requests
from apps.fetch.d1_client import D1Client

def main():
    d = D1Client()
    headers = d._headers()
    
    # 1. List keys starting with kap:feed:v3:
    url_list = f"https://api.cloudflare.com/client/v4/accounts/{d.account_id}/storage/kv/namespaces/80cebef8e65b44b386d2af909a6c474c/keys?prefix=kap:feed:v3:"
    r_list = requests.get(url_list, headers=headers)
    if r_list.status_code != 200:
        print(f"Failed to list keys: {r_list.status_code}")
        return
        
    keys = r_list.json().get("result", [])
    if not keys:
        print("No cached feed keys found.")
        return
        
    print(f"Found {len(keys)} cached feed keys. Deleting...")
    for item in keys:
        key = item["name"]
        url_del = f"https://api.cloudflare.com/client/v4/accounts/{d.account_id}/storage/kv/namespaces/80cebef8e65b44b386d2af909a6c474c/values/{key}"
        r_del = requests.delete(url_del, headers=headers)
        print(f"Deleted {key}: {r_del.status_code}")
        
    print("Purge completed successfully!")

if __name__ == "__main__":
    main()
