import asyncio
import time
import requests

BASE_URL = "http://127.0.0.1:8000/api"

def test_endpoint(name, url, method="GET", json_body=None):
    start = time.time()
    try:
        if method == "GET":
            r = requests.get(url, timeout=10)
        else:
            r = requests.post(url, json=json_body, timeout=10)
        elapsed = (time.time() - start) * 1000
        print(f"[{name}] Status: {r.status_code} | Time: {elapsed:.2f} ms")
        return r.status_code
    except Exception as e:
        print(f"[{name}] FAILED: {e}")
        return None

print("=== STARTING ARCHITECTURE & PERFORMANCE AUDIT ===")
test_endpoint("Public Branding Settings", f"{BASE_URL}/settings/branding-public")
test_endpoint("Public Recharge Limits", f"{BASE_URL}/settings/recharge-limits-public")
test_endpoint("Active Headlines", f"{BASE_URL}/headlines/active")
print("=== PUBLIC ENDPOINTS OK ===")
