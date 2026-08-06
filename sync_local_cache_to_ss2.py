import os
import asyncio
import asyncpg
import requests

SS2_DB_DSN = "postgresql://postgres:Jigscse%40123@db.zpynrddggarkltuueqdk.supabase.co:5432/postgres?sslmode=require"
SS2_SUPABASE_URL = "https://zpynrddggarkltuueqdk.supabase.co"
SS2_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpweW5yZGRnZ2Fya2x0dXVlcWRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTY3MTM3NiwiZXhwIjoyMTAxMjQ3Mzc2fQ._y2imQXpDPLkm9805uTbZE9jQEml6xUkCD7JKbvNh2g"

CACHE_DIR = os.path.join(os.path.dirname(__file__), "backend", "cache")

async def sync():
    # 1. Map all local files in backend/cache by filename
    cache_files_by_basename = {}
    cache_files_by_relpath = {}

    for root, dirs, files in os.walk(CACHE_DIR):
        for f in files:
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, CACHE_DIR).replace("\\", "/")
            cache_files_by_relpath[rel_path] = full_path
            cache_files_by_basename[f.lower()] = full_path

    print(f"Indexed {len(cache_files_by_relpath)} files in backend/cache/")

    # 2. Connect to SS2 DB and fetch all recharges
    conn = await asyncpg.connect(SS2_DB_DSN)
    recharges = await conn.fetch("SELECT id, screenshot_path, amount FROM recharges WHERE screenshot_path IS NOT NULL AND screenshot_path != '';")
    await conn.close()

    print(f"Total recharges in SS2 DB: {len(recharges)}")

    headers = {
        "apikey": SS2_SERVICE_KEY,
        "Authorization": f"Bearer {SS2_SERVICE_KEY}",
        "x-upsert": "true"
    }

    uploaded = 0

    for r in recharges:
        sp = r["screenshot_path"]
        filename = os.path.basename(sp).lower()

        target_file = None
        if sp in cache_files_by_relpath:
            target_file = cache_files_by_relpath[sp]
        elif filename in cache_files_by_basename:
            target_file = cache_files_by_basename[filename]

        if target_file:
            with open(target_file, "rb") as f_in:
                data = f_in.read()

            ext = filename.rsplit(".", 1)[-1]
            ct = "image/png" if ext == "png" else "image/jpeg"
            headers["Content-Type"] = ct

            post_url = f"{SS2_SUPABASE_URL}/storage/v1/object/uploads/{sp}"
            res = requests.post(post_url, headers=headers, data=data)
            if res.status_code in [200, 201]:
                uploaded += 1
                print(f"  [OK] Uploaded real original image for {sp} ({len(data)} bytes)")
            else:
                print(f"  [ERR] Failed upload for {sp}: HTTP {res.status_code}")

    print(f"\n========================================================")
    print(f"SYNC COMPLETE: Uploaded {uploaded} ORIGINAL REAL IMAGES to SS2!")
    print(f"========================================================")

if __name__ == "__main__":
    asyncio.run(sync())
