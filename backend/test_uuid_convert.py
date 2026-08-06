import asyncio
import os
import uuid
from dotenv import load_dotenv

load_dotenv()

from database import PostgresDatabase, convert_val

async def main():
    db = PostgresDatabase()
    uri = os.environ.get("SUPABASE_POSTGRES_URI") or "postgresql://postgres:Jigscse%40123@db.zpynrddggarkltuueqdk.supabase.co:5432/postgres?sslmode=require"
    await db.init_pool(uri)

    uid_str = "58713aac-ce97-4e2a-a6f1-d5dc626bee0a"

    res = await db.users.find_one({"id": uuid.UUID(uid_str)})
    print("find_one with uuid.UUID:", dict(res) if res else None)

    await db.close()

if __name__ == "__main__":
    asyncio.run(main())
