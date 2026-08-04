import asyncio
import os
import asyncpg
from dotenv import load_dotenv

load_dotenv()

async def main():
    uri = os.environ.get("SUPABASE_POSTGRES_URI")
    conn = await asyncpg.connect(uri)
    uids = ["6a61cd35-c65e-4429-bb72-66e6a6cd67a8", "8cb95d64-62ca-438c-86ed-4496e972b148", "042eefbf-49c9-459d-9fbe-21ff89fc5705"]

    rows = await conn.fetch(
        """
        SELECT user_id::text as user_id,
               SUM(CASE WHEN kind = 'credit' THEN amount WHEN kind = 'debit' THEN -amount ELSE 0 END) as total
        FROM ledger
        WHERE user_id::text = ANY($1::text[]) AND ref_type = 'admin_adjustment'
        GROUP BY user_id
        """,
        uids
    )
    print("Rows found from query:")
    for r in rows:
        print(dict(r))

    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
