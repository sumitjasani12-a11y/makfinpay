import asyncio
import os
import asyncpg
from dotenv import load_dotenv

load_dotenv()

async def main():
    uri = os.environ.get("SUPABASE_POSTGRES_URI")
    conn = await asyncpg.connect(uri)
    try:
        users = await conn.fetch("SELECT id, full_name, role FROM users WHERE role = 'master_distributor' AND is_deleted = FALSE")
        uids = [u["id"] for u in users]

        # Recharges map
        r_rows = await conn.fetch("SELECT md_id, SUM(md_earnings_amount) as total FROM recharges WHERE status = 'approved' AND md_id = ANY($1) GROUP BY md_id", uids)
        r_map = {r["md_id"]: float(r["total"] or 0) for r in r_rows}

        # Adjustments map
        a_rows = await conn.fetch("SELECT user_id, SUM(CASE WHEN kind = 'credit' THEN amount WHEN kind = 'debit' THEN -amount ELSE 0 END) as total FROM ledger WHERE ref_type = 'admin_adjustment' AND user_id = ANY($1) GROUP BY user_id", uids)
        a_map = {a["user_id"]: float(a["total"] or 0) for a in a_rows}

        print("--- MASTER DISTRIBUTORS API OUTPUT SIMULATION ---")
        for u in users:
            uid = u["id"]
            name = u["full_name"]
            r_tot = r_map.get(uid, 0.0)
            a_tot = a_map.get(uid, 0.0)
            final_earnings = round(r_tot + a_tot, 2)
            print(f"{name}: Recharge=Rs.{r_tot:,.2f} + Manual=Rs.{a_tot:,.2f} => TOTAL EARNINGS = Rs.{final_earnings:,.2f}")

    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
