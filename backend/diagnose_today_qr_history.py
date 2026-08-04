import asyncio
import os
import asyncpg
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv()

async def main():
    uri = os.environ.get("SUPABASE_POSTGRES_URI")
    conn = await asyncpg.connect(uri)

    # 1. Fetch current active QRs in qr_codes table
    active_qrs = await conn.fetch("SELECT id, label, is_t1, active, created_at FROM qr_codes WHERE active = TRUE")
    print("--- CURRENT ACTIVE QR CODES IN DATABASE ---")
    for q in active_qrs:
        print(dict(q))

    # 2. Fetch recent rows in qr_activation_history
    history = await conn.fetch("SELECT id, qr_code_id, label, status, activated_at, deactivated_at FROM qr_activation_history ORDER BY activated_at DESC LIMIT 10")
    print("\n--- RECENT 10 ACTIVATION HISTORY SESSIONS ---")
    for h in history:
        print(dict(h))

    # 3. Fetch recharge approved today (4 Aug 2026)
    recharges = await conn.fetch("SELECT id, qr_code_id, qr_code_label, amount, status, created_at FROM recharges WHERE created_at >= '2026-08-03 18:30:00+00' ORDER BY created_at DESC LIMIT 10")
    print("\n--- RECHARGES APPROVED TODAY (4 AUG 2026 IST) ---")
    for r in recharges:
        print(dict(r))

    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
