import asyncio
import asyncpg
import requests
import os

SS1_DB_DSN = "postgresql://postgres:Jigscse%40123@db.itbtuduqkhgtfkwpamcw.supabase.co:5432/postgres?sslmode=require"
SS1_URL = "https://itbtuduqkhgtfkwpamcw.supabase.co"
SS1_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0YnR1ZHVxa2hndGZrd3BhbWN3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDk5ODg0MCwiZXhwIjoyMTAwNTc0ODQwfQ.c_cWqR2C85Sg_H-a5RpxsYj0-yP84J-64R6v_q1p014"

SS2_URL = "https://zpynrddggarkltuueqdk.supabase.co"
SS2_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpweW5yZGRnZ2Fya2x0dXVlcWRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTY3MTM3NiwiZXhwIjoyMTAxMjQ3Mzc2fQ._y2imQXpDPLkm9805uTbZE9jQEml6xUkCD7JKbvNh2g"

LOCAL_BACKUP = os.path.join(os.path.dirname(__file__), "storage_backup")

async def download_and_sync():
    conn1 = await asyncpg.connect(SS1_DB_DSN)
    recharges = await conn1.fetch("SELECT id, amount, screenshot_path, created_at FROM recharges WHERE created_at::text LIKE '2026-08-04%' OR created_at::text LIKE '2026-08-05%' ORDER BY created_at DESC;")
    await conn1.close()

    print(f"Total Aug 4 & 5 recharges to check on SS1: {len(recharges)}")

    headers_ss1 = {"apikey": SS1_KEY, "Authorization": f"Bearer {SS1_KEY}"}
    headers_ss2 = {"apikey": SS2_KEY, "Authorization": f"Bearer {SS2_KEY}", "x-upsert": "true"}

    recovered = 0

    for r in recharges:
        sp = r["screenshot_path"]
        if not sp:
            continue

        clean_sp = sp.replace("makfinpay/", "", 1) if sp.startswith("makfinpay/") else sp
        if clean_sp.startswith("uploads/"):
            clean_sp_no_bucket = clean_sp.replace("uploads/", "", 1)
        else:
            clean_sp_no_bucket = clean_sp

        urls = [
            f"{SS1_URL}/storage/v1/object/public/uploads/{sp}",
            f"{SS1_URL}/storage/v1/object/public/uploads/{clean_sp}",
            f"{SS1_URL}/storage/v1/object/public/uploads/{clean_sp_no_bucket}",
            f"{SS1_URL}/storage/v1/object/authenticated/uploads/{sp}",
            f"{SS1_URL}/storage/v1/object/authenticated/uploads/{clean_sp}",
            f"{SS1_URL}/storage/v1/object/uploads/{sp}",
            f"{SS1_URL}/storage/v1/object/uploads/{clean_sp}",
            f"{SS1_URL}/storage/v1/object/public/makfinpay/{sp}",
            f"{SS1_URL}/storage/v1/object/public/makfinpay/{clean_sp}",
        ]

        img_bytes = None
        for u in urls:
            try:
                res = requests.get(u, headers=headers_ss1, timeout=5)
                if res.status_code == 200 and len(res.content) > 100:
                    img_bytes = res.content
                    print(f"FETCH SUCCESS [{r['created_at']}] {sp} from {u} ({len(img_bytes)} bytes)")
                    break
            except Exception:
                pass

        if img_bytes:
            # Save to local storage_backup
            local_path = os.path.join(LOCAL_BACKUP, sp.replace("/", os.sep))
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            with open(local_path, "wb") as f_out:
                f_out.write(img_bytes)

            # Upload to SS2 uploads bucket
            ext = sp.rsplit(".", 1)[-1].lower() if "." in sp else "jpg"
            headers_ss2["Content-Type"] = "image/png" if ext == "png" else "image/jpeg"
            post_url = f"{SS2_URL}/storage/v1/object/uploads/{sp}"
            up_res = requests.post(post_url, headers=headers_ss2, data=img_bytes)
            if up_res.status_code in [200, 201]:
                recovered += 1
                print(f"  --> UPLOADED TO SS2: {sp}")

    print(f"\n========================================================")
    print(f"DONE: Recovered & Uploaded {recovered}/{len(recharges)} images from SS1!")
    print(f"========================================================")

if __name__ == "__main__":
    asyncio.run(download_and_sync())
