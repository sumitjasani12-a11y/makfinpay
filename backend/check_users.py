import os
import sys
import asyncio
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")

import server

async def main():
    db = server.db
    uri = os.environ.get("SUPABASE_POSTGRES_URI")
    await db.init_pool(uri)

    users = await db.users.find({}, {"_id": 0, "email": 1, "role": 1, "password_hash": 1}).to_list(200)
    print("=== USERS IN CURRENT DATABASE ===")
    for u in users:
        print(f"Email: {u.get('email')}, Role: {u.get('role')}")

    await db.close()

if __name__ == "__main__":
    asyncio.run(main())
