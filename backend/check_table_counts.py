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

    h_count = await db.headlines.count_documents({})
    s_count = await db.service_charge_slabs.count_documents({})
    b_count = await db.banks.count_documents({})
    c_count = await db.billers.count_documents({})

    print("=== TABLE COUNTS IN TESTING DB ===")
    print(f"Headlines: {h_count}")
    print(f"Service Slabs: {s_count}")
    print(f"Banks: {b_count}")
    print(f"Billers: {c_count}")

    await db.close()

if __name__ == "__main__":
    asyncio.run(main())
