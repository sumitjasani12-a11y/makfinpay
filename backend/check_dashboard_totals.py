import asyncio
import os
import asyncpg
from dotenv import load_dotenv

load_dotenv()

async def main():
    uri = os.environ.get("SUPABASE_POSTGRES_URI")
    conn = await asyncpg.connect(uri)
    try:
        # All distributors
        dists = await conn.fetch("SELECT id FROM users WHERE role = 'distributor' AND is_deleted = FALSE")
        dist_ids = [str(d["id"]) for d in dists]

        # All MDs
        mds = await conn.fetch("SELECT id FROM users WHERE role = 'master_distributor' AND is_deleted = FALSE")
        md_ids = [str(m["id"]) for m in mds]

        # Dist recharges sum
        d_recharges = await conn.fetchval("SELECT COALESCE(SUM(distributor_earnings_amount), 0) FROM recharges WHERE status = 'approved' AND distributor_id::text = ANY($1::text[])", dist_ids)
        # Dist admin adjustments sum
        d_adj = await conn.fetchval("SELECT COALESCE(SUM(CASE WHEN kind = 'credit' THEN amount WHEN kind = 'debit' THEN -amount ELSE 0 END), 0) FROM ledger WHERE ref_type = 'admin_adjustment' AND user_id::text = ANY($1::text[])", dist_ids)

        # MD recharges sum
        m_recharges = await conn.fetchval("SELECT COALESCE(SUM(md_earnings_amount), 0) FROM recharges WHERE status = 'approved' AND md_id::text = ANY($1::text[])", md_ids)
        # MD admin adjustments sum
        m_adj = await conn.fetchval("SELECT COALESCE(SUM(CASE WHEN kind = 'credit' THEN amount WHEN kind = 'debit' THEN -amount ELSE 0 END), 0) FROM ledger WHERE ref_type = 'admin_adjustment' AND user_id::text = ANY($1::text[])", md_ids)

        total_dist_earnings = float(d_recharges or 0) + float(d_adj or 0)
        total_md_earnings = float(m_recharges or 0) + float(m_adj or 0)

        print(f"Distributors: Recharge Sum = Rs.{float(d_recharges):,.2f} | Admin Adj = Rs.{float(d_adj):,.2f} => TOTAL DIST EARNINGS = Rs.{total_dist_earnings:,.2f}")
        print(f"MDs:          Recharge Sum = Rs.{float(m_recharges):,.2f} | Admin Adj = Rs.{float(m_adj):,.2f} => TOTAL MD EARNINGS   = Rs.{total_md_earnings:,.2f}")

    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
