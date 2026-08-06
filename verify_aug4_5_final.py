import asyncio
import asyncpg
import requests

SS2_DB_DSN = "postgresql://postgres:Jigscse%40123@db.zpynrddggarkltuueqdk.supabase.co:5432/postgres?sslmode=require"
SS2_SUPABASE_URL = "https://zpynrddggarkltuueqdk.supabase.co"
LOCAL_SERVER_URL = "http://localhost:8000/api/files"

async def verify():
    conn = await asyncpg.connect(SS2_DB_DSN)
    recharges = await conn.fetch("SELECT id, amount, screenshot_path, created_at FROM recharges WHERE created_at::text LIKE '2026-08-04%' OR created_at::text LIKE '2026-08-05%' ORDER BY created_at DESC;")
    await conn.close()

    print(f"Verifying {len(recharges)} recharges for Aug 4 & 5...")

    ok_supabase = 0
    ok_local = 0

    for r in recharges:
        sp = r["screenshot_path"]
        if not sp:
            continue

        # Check Supabase Storage
        supa_url = f"{SS2_SUPABASE_URL}/storage/v1/object/public/uploads/{sp}"
        r_supa = requests.get(supa_url)
        if r_supa.status_code == 200:
            ok_supabase += 1

        # Check Local FastAPI backend endpoint
        loc_url = f"{LOCAL_SERVER_URL}/{sp}"
        r_loc = requests.get(loc_url)
        if r_loc.status_code == 200:
            ok_local += 1

    print("\n========================================================")
    print(f"VERIFICATION SUMMARY FOR AUG 4 & 5:")
    print(f"  - Total Recharges: {len(recharges)}")
    print(f"  - Supabase Storage Public 200 OK: {ok_supabase}/{len(recharges)}")
    print(f"  - Local Backend Endpoint 200 OK: {ok_local}/{len(recharges)}")
    print("========================================================")

if __name__ == "__main__":
    asyncio.run(verify())
