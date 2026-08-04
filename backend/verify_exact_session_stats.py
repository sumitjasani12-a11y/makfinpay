import asyncio
import os
import asyncpg
from dotenv import load_dotenv

load_dotenv()

async def main():
    uri = os.environ.get("SUPABASE_POSTGRES_URI")
    conn = await asyncpg.connect(uri)

    # Fetch activation history for AGARIYA SABERA
    sql = """
        SELECT 
            h.id as history_id,
            h.label,
            h.activated_at,
            h.deactivated_at,
            h.status as session_status,
            COUNT(r.id) as total_entries,
            COUNT(CASE WHEN r.status = 'approved' THEN 1 END) as approved_count,
            COALESCE(SUM(CASE WHEN r.status = 'approved' THEN r.amount END), 0) as approved_amount,
            COALESCE(SUM(CASE WHEN r.status = 'approved' THEN r.admin_revenue_amount END), 0) as admin_revenue,
            COALESCE(SUM(CASE WHEN r.status = 'approved' THEN r.md_earnings_amount END), 0) as md_earnings,
            COALESCE(SUM(CASE WHEN r.status = 'approved' THEN r.distributor_earnings_amount END), 0) as dist_earnings
        FROM qr_activation_history h
        LEFT JOIN recharges r ON (
            (r.qr_code_id::text = h.qr_code_id::text OR r.qr_code_label = h.label)
            AND r.created_at >= h.activated_at
            AND (h.deactivated_at IS NULL OR r.created_at <= h.deactivated_at)
        )
        WHERE h.label LIKE '%AGARIYA SABERA%'
        GROUP BY h.id, h.label, h.activated_at, h.deactivated_at, h.status
        ORDER BY h.activated_at DESC
    """

    rows = await conn.fetch(sql)
    print("--- EXACT PER-SESSION BREAKDOWN FOR AGARIYA SABERA ---")
    for r in rows:
        act = r['activated_at'].strftime("%d/%m/%Y %H:%M") if r['activated_at'] else "—"
        deact = r['deactivated_at'].strftime("%d/%m/%Y %H:%M") if r['deactivated_at'] else "Active"
        print(f"Session ID: {r['history_id']}")
        print(f"  Activated: {act} | Deactivated: {deact} [{r['session_status']}]")
        print(f"  Entries during THIS session: {r['total_entries']}")
        print(f"  Approved Count: {r['approved_count']} | Approved Amount: Rs.{float(r['approved_amount']):,.2f}")
        print("-" * 65)

    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
