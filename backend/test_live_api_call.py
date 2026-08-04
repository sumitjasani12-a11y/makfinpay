import os
import httpx
import jwt
from datetime import datetime, timezone, timedelta

from dotenv import load_dotenv
load_dotenv()

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = "HS256"

import asyncpg
import asyncio

async def run_test():
    uri = os.environ.get("SUPABASE_POSTGRES_URI")
    conn = await asyncpg.connect(uri)
    admin_user = await conn.fetchrow("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
    admin_id = str(admin_user["id"])
    await conn.close()

    payload = {
        "sub": admin_id,
        "role": "admin",
        "user_role": "admin",
        "email": "jigs.vanani@gmail.com",
        "exp": datetime.now(timezone.utc) + timedelta(days=1)
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

    headers = {"Authorization": f"Bearer {token}"}

    r = httpx.get("http://127.0.0.1:8000/api/admin/users?role=master_distributor&paginated=true", headers=headers, timeout=10)
    print(f"Status Code: {r.status_code}")
    data = r.json()
    items = data.get("items", [])
    print(f"Total items returned: {len(items)}")
    for it in items:
        print(f"Name: {it.get('full_name')} | Earnings: {it.get('earnings')} | Wallet: {it.get('wallet_balance')}")

asyncio.run(run_test())
