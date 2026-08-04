import asyncio
import os
from dotenv import load_dotenv
load_dotenv()

from server import db, _admin_adjustments_sum_batch, _md_earnings_batch

async def main():
    await db.init_pool(os.environ["SUPABASE_POSTGRES_URI"])
    md_ids = ["6a61cd35-c65e-4429-bb72-66e6a6cd67a8", "8cb95d64-62ca-438c-86ed-4496e972b148", "042eefbf-49c9-459d-9fbe-21ff89fc5705"]
    adj_map = await _admin_adjustments_sum_batch(md_ids)
    print("adj_map:", adj_map)
    batch_map = await _md_earnings_batch(md_ids)
    print("batch_map:", batch_map)
    await db.pool.close()

if __name__ == "__main__":
    asyncio.run(main())
