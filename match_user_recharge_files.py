import os
import re
import asyncio
import asyncpg
import requests

USER_FOLDER = r"C:\Users\ADMIN\Downloads\New folder (3)\New folder (3)"
SS2_DB_DSN = "postgresql://postgres:Jigscse%40123@db.zpynrddggarkltuueqdk.supabase.co:5432/postgres?sslmode=require"
SS2_SUPABASE_URL = "https://zpynrddggarkltuueqdk.supabase.co"
SS2_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpweW5yZGRnZ2Fya2x0dXVlcWRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTY3MTM3NiwiZXhwIjoyMTAxMjQ3Mzc2fQ._y2imQXpDPLkm9805uTbZE9jQEml6xUkCD7JKbvNh2g"

LOCAL_BACKUP_DIR = os.path.join(os.path.dirname(__file__), "storage_backup")


async def sync_by_recharge_id():
    print("=" * 70)
    print("SYNCING USER'S ORIGINAL PAYMENT PROOF PHOTOS TO SS2 DATABASE STORAGE")
    print("=" * 70)

    # 1. Connect to SS2 database
    conn = await asyncpg.connect(SS2_DB_DSN)
    recharges = await conn.fetch("SELECT id, screenshot_path, amount, created_at FROM recharges WHERE screenshot_path IS NOT NULL AND screenshot_path != '';")
    await conn.close()

    # Map recharges by ID string (lowercased)
    recharge_by_id = {str(r["id"]).lower(): dict(r) for r in recharges}
    print(f"[INFO] Loaded {len(recharge_by_id)} recharges from SS2 database.")

    headers = {
        "apikey": SS2_SERVICE_KEY,
        "Authorization": f"Bearer {SS2_SERVICE_KEY}",
        "x-upsert": "true"
    }

    uploaded_count = 0

    # 2. Iterate through all files in user's folder
    for root, dirs, files in os.walk(USER_FOLDER):
        for f in files:
            full_path = os.path.join(root, f)

            # Extract UUID from filename (e.g., proof_c7075a60-1901-4323-ac71-6073be5d88c3_55000.jpg)
            match = re.search(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", f, re.IGNORECASE)
            if not match:
                continue

            rec_id = match.group(1).lower()
            if rec_id in recharge_by_id:
                rec_info = recharge_by_id[rec_id]
                sp = rec_info["screenshot_path"]
                amt = float(rec_info["amount"] or 0.0)

                with open(full_path, "rb") as f_in:
                    file_bytes = f_in.read()

                # Save locally to storage_backup
                local_file_path = os.path.join(LOCAL_BACKUP_DIR, sp.replace("/", os.sep))
                os.makedirs(os.path.dirname(local_file_path), exist_ok=True)
                with open(local_file_path, "wb") as f_out:
                    f_out.write(file_bytes)

                ext = f.rsplit(".", 1)[-1].lower() if "." in f else "jpg"
                headers["Content-Type"] = "image/png" if ext == "png" else "image/jpeg"

                # Upload to SS2 uploads bucket under exact DB path sp
                post_url = f"{SS2_SUPABASE_URL}/storage/v1/object/uploads/{sp}"
                res = requests.post(post_url, headers=headers, data=file_bytes)

                if res.status_code in [200, 201]:
                    uploaded_count += 1
                    print(f"  [OK SUCCESS] Uploaded ORIGINAL photo for Recharge ID {rec_id} (Rs.{amt:,.2f}) ---> DB Path: {sp}")
                else:
                    print(f"  [WARN] Upload error for {rec_id}: HTTP {res.status_code}")

    print("\n" + "=" * 70)
    print(f"USER ORIGINAL PHOTOS SYNC COMPLETE! Uploaded {uploaded_count} photos!")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(sync_by_recharge_id())
