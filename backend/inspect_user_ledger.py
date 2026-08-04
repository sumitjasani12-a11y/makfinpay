import asyncio
import os
import asyncpg
from dotenv import load_dotenv

load_dotenv()

async def main():
    uri = os.environ.get("SUPABASE_POSTGRES_URI")
    conn = await asyncpg.connect(uri)
    try:
        # Fetch ledger entries for GAJANAND COMMUNICATION and PARIHAR AJAYRAJ ARJUNSING
        uids = ["6a61cd35-c65e-4429-bb72-66e6a6cd67a8", "8cb95d64-62ca-438c-86ed-4496e972b148", "042eefbf-49c9-459d-9fbe-21ff89fc5705"]
        rows = await conn.fetch("SELECT id, user_id, kind, amount, balance_after, ref_type, note, created_at FROM ledger WHERE user_id = ANY($1)", uids)
        print(f"Total ledger entries found for target users: {len(rows)}")
        for r in rows:
            print(f"User: {r['user_id']} | Kind: {r['kind']} | Amount: {r['amount']} | ref_type: '{r['ref_type']}' | note: '{r['note']}'")

    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
