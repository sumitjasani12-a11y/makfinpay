import asyncio
import sys
from pathlib import Path

# Add backend directory to sys.path
sys.path.append(str(Path(__file__).parent))

from server import app, _distributor_earnings_batch, _md_earnings_batch, admin_stats_financial, startup, db

async def main():
    # 1. Initialize database connection pool
    await startup()

    try:
        # 2. Get values using the new optimized logic (call endpoint function directly)
        admin_user = {"role": "admin", "email": "makfinpay@gmail.com", "permissions": None}
        opt_data = await admin_stats_financial(user=admin_user)

        # 3. Re-calculate using original loop logic
        dist_ids = [u["id"] async for u in db.users.find({"role": "distributor", "is_deleted": False}, {"_id": 0, "id": 1})]
        earnings_map = await _distributor_earnings_batch(dist_ids)
        slow_dist = round(sum(earnings_map.values()), 2)
        
        md_ids = [u["id"] async for u in db.users.find({"role": "master_distributor", "is_deleted": False}, {"_id": 0, "id": 1})]
        md_earnings_map = await _md_earnings_batch(md_ids)
        slow_md = round(sum(md_earnings_map.values()), 2)

        # 4. Compare
        assert opt_data["total_distributor_earnings"] == slow_dist, f"Distributor earnings mismatch: {opt_data['total_distributor_earnings']} != {slow_dist}"
        assert opt_data["total_md_earnings"] == slow_md, f"MD earnings mismatch: {opt_data['total_md_earnings']} != {slow_md}"
        
        print(f"VERIFICATION SUCCESS!")
        print(f"Distributor Earnings: {slow_dist} (Optimized) == {opt_data['total_distributor_earnings']} (Slow Loop)")
        print(f"MD Earnings: {slow_md} (Optimized) == {opt_data['total_md_earnings']} (Slow Loop)")
    finally:
        # Close connection pool
        if db.pool:
            await db.pool.close()

if __name__ == "__main__":
    asyncio.run(main())
