import asyncio
import os
import asyncpg
from dotenv import load_dotenv

load_dotenv()

async def main():
    uri = os.environ.get("SUPABASE_POSTGRES_URI")
    if not uri:
        print("Error: SUPABASE_POSTGRES_URI not set")
        return

    conn = await asyncpg.connect(uri)
    try:
        # Fetch distributors and MDs
        users = await conn.fetch("SELECT id, full_name, role, created_at FROM users WHERE role IN ('distributor', 'master_distributor') AND is_deleted = FALSE")
        print(f"Total DS/MS users: {len(users)}")

        for u in users:
            uid = u["id"]
            name = u["full_name"]
            role = u["role"]

            # Recharge earnings sum
            if role == "distributor":
                recharge_sum = await conn.fetchval(
                    "SELECT COALESCE(SUM(distributor_earnings_amount), 0) FROM recharges WHERE status = 'approved' AND distributor_id = $1",
                    uid
                )
            else:
                recharge_sum = await conn.fetchval(
                    "SELECT COALESCE(SUM(md_earnings_amount), 0) FROM recharges WHERE status = 'approved' AND md_id = $1",
                    uid
                )

            # Ledger admin adjustments sum
            adj_sum = await conn.fetchval(
                "SELECT COALESCE(SUM(CASE WHEN kind = 'credit' THEN amount WHEN kind = 'debit' THEN -amount ELSE 0 END), 0) FROM ledger WHERE user_id = $1 AND ref_type = 'admin_adjustment'",
                uid
            )

            # All ledger entries count & ref_types for this user
            ledger_rows = await conn.fetch(
                "SELECT ref_type, kind, amount, note FROM ledger WHERE user_id = $1",
                uid
            )

            print(f"\n--- User: {name} ({role}) [ID: {uid}] ---")
            print(f"Recharge Commission Sum: Rs.{float(recharge_sum):,.2f}")
            print(f"Admin Adjustment Sum:    Rs.{float(adj_sum):,.2f}")
            print(f"Total Earnings Displayed: Rs.{float(recharge_sum) + float(adj_sum):,.2f}")
            if ledger_rows:
                print(f"Ledger entries ({len(ledger_rows)} total):")
                for lr in ledger_rows[:10]:
                    print(f"  - [{lr['kind'].upper()}] Rs.{float(lr['amount']):,.2f} | ref_type={lr['ref_type']} | note={lr['note']}")

    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
