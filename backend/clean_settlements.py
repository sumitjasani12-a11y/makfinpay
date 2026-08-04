import asyncio
import os
import sys
import asyncpg
from dotenv import load_dotenv

load_dotenv()

async def main():
    uri = os.environ.get("SUPABASE_POSTGRES_URI")
    if not uri:
        print("Error: SUPABASE_POSTGRES_URI not set")
        return

    print("Connecting to database...")
    conn = await asyncpg.connect(uri)
    try:
        # Check count of daily_commission_settlement records
        count = await conn.fetchval("SELECT COUNT(*) FROM ledger WHERE ref_type = 'daily_commission_settlement'")
        print(f"Found {count} daily_commission_settlement records in ledger.")

        if count > 0:
            res = await conn.execute("DELETE FROM ledger WHERE ref_type = 'daily_commission_settlement'")
            print(f"Successfully deleted records: {res}")
        else:
            print("No settlement entries found to delete.")

        # Reset settled_distributor and settled_md flags in recharges table
        res_r = await conn.execute("UPDATE recharges SET settled_distributor = FALSE, settled_md = FALSE WHERE settled_distributor = TRUE OR settled_md = TRUE")
        print(f"Reset recharge settlement flags: {res_r}")

    finally:
        await conn.close()
        print("Database connection closed.")

if __name__ == "__main__":
    asyncio.run(main())
