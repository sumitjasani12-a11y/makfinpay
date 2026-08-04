import os
import httpx
import jwt
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv()

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = "HS256"

payload = {
    "sub": "69a0f1a8-0ac6-477e-affc-12fbe62b06d4", # Admin ID
    "role": "admin",
    "user_role": "admin",
    "email": "jigs.vanani@gmail.com",
    "exp": datetime.now(timezone.utc) + timedelta(days=1)
}
token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)
headers = {"Authorization": f"Bearer {token}"}

r = httpx.get("http://127.0.0.1:8000/api/admin/stats/financial?range=today", headers=headers, timeout=10)
print(f"Status Code: {r.status_code}")
data = r.json()
print("MD EARNINGS TOTAL ON DASHBOARD:", data.get("total_md_earnings"))
print("DISTRIBUTOR EARNINGS TOTAL ON DASHBOARD:", data.get("total_distributor_earnings"))
print("TOTAL WALLET / FUNDS ON DASHBOARD:", data.get("total_wallet"))
