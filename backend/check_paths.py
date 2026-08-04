import asyncio
import database
import os
from dotenv import load_dotenv

load_dotenv()

async def main():
    uri = os.environ.get("SUPABASE_POSTGRES_URI") or os.environ.get("DATABASE_URL")
    db = database.PostgresDatabase()
    await db.init_pool(uri)
    rows = await db.recharges.find({"screenshot_path": {"$ne": ""}}, {"_id": 0, "id": 1, "screenshot_path": 1}).to_list(10)
    print("RECHARGE PATHS:")
    for r in rows:
        print(r)

    files = await db.files.find({}, {"_id": 0, "id": 1, "storage_path": 1}).to_list(10)
    print("\nFILE STORAGE PATHS:")
    for f in files:
        print(f)
    await db.close()

if __name__ == "__main__":
    asyncio.run(main())
