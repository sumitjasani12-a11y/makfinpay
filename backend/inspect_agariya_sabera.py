import asyncio
import os
import asyncpg
from dotenv import load_dotenv

load_dotenv()

async def main():
    uri = os.environ.get("SUPABASE_POSTGRES_URI")
    conn = await asyncpg.connect(uri)

    history_rows = await conn.fetch("SELECT id, qr_code_id, label, activated_at, deactivated_at, status FROM qr_activation_history WHERE label LIKE '%AGARIYA SABERA%' ORDER BY activated_at DESC")
    print("--- QR ACTIVATION HISTORY FOR AGARIYA SABERA ---")
    for r in history_rows:
        print(f"ID: {r['id']} | Label: {r['label']} | Status: {r['status']} | Act: {r['activated_at']} | Deact: {r['deactivated_at']}")

    recharge_rows = await conn.fetch("SELECT id, qr_code_label, status, amount, created_at FROM recharges WHERE qr_code_label LIKE '%AGARIYA SABERA%' ORDER BY created_at DESC LIMIT 10")
    print("\n--- RECHARGES FOR AGARIYA SABERA ---")
    for r in recharge_rows:
        print(f"Recharge ID: {r['id']} | Label: {r['qr_code_label']} | Amount: {r['amount']} | Status: {r['status']} | CreatedAt: {r['created_at']}")

    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
