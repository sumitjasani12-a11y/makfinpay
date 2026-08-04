import asyncio
import os
import asyncpg
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv()

async def main():
    uri = os.environ.get("SUPABASE_POSTGRES_URI")
    conn = await asyncpg.connect(uri)

    # Simulate "Today" filter in IST (+05:30)
    ist_tz = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(ist_tz)
    today_start_ist = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end_ist = today_start_ist + timedelta(days=1)

    from_dt = today_start_ist.astimezone(timezone.utc)
    to_dt = today_end_ist.astimezone(timezone.utc)

    print(f"Filter Today: from {from_dt} to {to_dt}")

    sql = """
        SELECT 
            h.id as history_id,
            h.label,
            h.activated_at,
            h.deactivated_at,
            h.status as session_status,
            COUNT(r.id) as total_entries,
            COUNT(CASE WHEN r.status = 'pending' THEN 1 END) as pending_count,
            COUNT(CASE WHEN r.status = 'approved' THEN 1 END) as approved_count,
            COUNT(CASE WHEN r.status = 'rejected' THEN 1 END) as rejected_count,
            COALESCE(SUM(CASE WHEN r.status = 'approved' THEN r.amount END), 0) as approved_amount,
            COALESCE(SUM(CASE WHEN r.status = 'approved' THEN r.admin_revenue_amount END), 0) as admin_revenue,
            COALESCE(SUM(CASE WHEN r.status = 'approved' THEN r.md_earnings_amount END), 0) as md_earnings,
            COALESCE(SUM(CASE WHEN r.status = 'approved' THEN r.distributor_earnings_amount END), 0) as dist_earnings
        FROM qr_activation_history h
        LEFT JOIN recharges r ON (
            r.qr_code_label = h.label
            AND r.created_at >= h.activated_at
            AND (h.deactivated_at IS NULL OR r.created_at <= h.deactivated_at)
            AND ($1::timestamptz IS NULL OR r.created_at >= $1::timestamptz)
            AND ($2::timestamptz IS NULL OR r.created_at <= $2::timestamptz)
        )
        GROUP BY h.id, h.label, h.activated_at, h.deactivated_at, h.status
        ORDER BY h.activated_at DESC
        LIMIT 50
    """

    rows = await conn.fetch(sql, from_dt, to_dt)
    print(f"Total history sessions returned: {len(rows)}\n")

    for r in rows:
        act = r['activated_at'].strftime("%d/%m/%Y %H:%M") if r['activated_at'] else "—"
        deact = r['deactivated_at'].strftime("%d/%m/%Y %H:%M") if r['deactivated_at'] else "—"
        print(f"Label: {r['label']} [{r['session_status']}] | Act: {act} | Deact: {deact}")
        print(f"  Approved Count: {r['approved_count']} | Approved Amount: Rs.{float(r['approved_amount']):,.2f}")
        print("-" * 60)

    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
