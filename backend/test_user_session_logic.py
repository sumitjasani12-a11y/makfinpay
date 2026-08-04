import asyncio
import os
import asyncpg
from dotenv import load_dotenv

load_dotenv()

async def main():
    uri = os.environ.get("SUPABASE_POSTGRES_URI")
    conn = await asyncpg.connect(uri)

    # Fetch activation sessions with LEAD(activated_at) to find next session start time
    sql = """
        WITH session_windows AS (
            SELECT 
                h.id as history_id,
                h.qr_code_id,
                h.label,
                h.mobile_number,
                h.upi_id,
                h.qr_percent,
                h.activated_at,
                h.deactivated_at,
                h.status,
                LEAD(h.activated_at) OVER (ORDER BY h.activated_at ASC) as next_activated_at
            FROM qr_activation_history h
        )
        SELECT 
            sw.history_id,
            sw.label,
            sw.activated_at,
            sw.deactivated_at,
            sw.next_activated_at,
            sw.status,
            COUNT(r.id) as total_entries,
            COUNT(CASE WHEN r.status = 'approved' THEN 1 END) as approved_count,
            COALESCE(SUM(CASE WHEN r.status = 'approved' THEN r.amount END), 0) as approved_amount
        FROM session_windows sw
        LEFT JOIN recharges r ON (
            (r.qr_code_id::text = sw.qr_code_id::text OR r.qr_code_label = sw.label)
            AND r.created_at >= sw.activated_at
            AND (sw.next_activated_at IS NULL OR r.created_at < sw.next_activated_at)
        )
        GROUP BY sw.history_id, sw.label, sw.activated_at, sw.deactivated_at, sw.next_activated_at, sw.status
        ORDER BY sw.activated_at DESC
        LIMIT 20
    """

    rows = await conn.fetch(sql)
    print("--- USER BUSINESS LOGIC: SESSION WINDOWS (ACTIVATED_AT TO NEXT_ACTIVATED_AT) ---")
    for r in rows:
        act = r['activated_at'].strftime("%d/%m/%Y %H:%M") if r['activated_at'] else "—"
        deact = r['deactivated_at'].strftime("%d/%m/%Y %H:%M") if r['deactivated_at'] else "Active"
        next_act = r['next_activated_at'].strftime("%d/%m/%Y %H:%M") if r['next_activated_at'] else "None (Current)"
        print(f"Session: {r['label']} [{r['status']}]")
        print(f"  Start: {act} | Closed: {deact} | Next Session Start: {next_act}")
        print(f"  Entries assigned: {r['total_entries']} | Approved Count: {r['approved_count']} | Approved Amount: Rs.{float(r['approved_amount']):,.2f}")
        print("-" * 70)

    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
