import os
import httpx
import jwt
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv()

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = "HS256"

payload = {
    "sub": "69a0f1a8-0ac6-477e-affc-12fbe62b06d4",
    "role": "admin",
    "user_role": "admin",
    "email": "jigs.vanani@gmail.com",
    "exp": datetime.now(timezone.utc) + timedelta(days=1)
}
token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)
headers = {"Authorization": f"Bearer {token}"}

# Test with Today filter timestamps
r = httpx.get("http://127.0.0.1:8000/api/admin/qrcodes/history?from_ts=2026-08-03T18:30:00.000Z&to_ts=2026-08-04T18:30:00.000Z", headers=headers, timeout=10)
print(f"Status Code: {r.status_code}")
items = r.json()
print(f"Total history sessions returned for Today: {len(items)}")
for it in items[:5]:
    print(f"Label: {it.get('label')} | Act: {it.get('activated_at')} | Deact: {it.get('deactivated_at')} | Entries: {it.get('entries')} | Approved Amount: Rs.{it.get('approved_amount')}")
