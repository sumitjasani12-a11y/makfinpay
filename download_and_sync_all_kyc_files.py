import asyncio
import asyncpg
import requests
import os

SS1_URL = "https://itbtuduqkhgtfkwpamcw.supabase.co"
SS1_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0YnR1ZHVxa2hndGZrd3BhbWN3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDk5ODg0MCwiZXhwIjoyMTAwNTc0ODQwfQ.c_cWqR2C85Sg_H-a5RpxsYj0-yP84J-64R6v_q1p014"

SS2_DB_DSN = "postgresql://postgres:Jigscse%40123@db.zpynrddggarkltuueqdk.supabase.co:5432/postgres?sslmode=require"
SS2_URL = "https://zpynrddggarkltuueqdk.supabase.co"
SS2_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpweW5yZGRnZ2Fya2x0dXVlcWRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTY3MTM3NiwiZXhwIjoyMTAxMjQ3Mzc2fQ._y2imQXpDPLkm9805uTbZE9jQEml6xUkCD7JKbvNh2g"

LOCAL_BACKUP = os.path.join(os.path.dirname(__file__), "storage_backup")

async def sync_kyc_files():
    print("=" * 70)
    print("FETCHING & SYNCING ALL USER KYC DOCUMENTS FROM SS1 TO SS2")
    print("=" * 70)

    conn = await asyncpg.connect(SS2_DB_DSN)
    rows = await conn.fetch("""
        SELECT aadhaar_path, pan_path, aadhaar_back_path, pan_back_path, selfie_path, cheque_path, firm_front_path 
        FROM users;
    """)
    await conn.close()

    all_paths = set()
    for r in rows:
        for col in ['aadhaar_path', 'pan_path', 'aadhaar_back_path', 'pan_back_path', 'selfie_path', 'cheque_path', 'firm_front_path']:
            val = r[col]
            if val and isinstance(val, str) and val.strip():
                all_paths.add(val.strip())

    print(f"[INFO] Collected {len(all_paths)} unique KYC document paths from users table.")

    headers_ss1 = {"apikey": SS1_KEY, "Authorization": f"Bearer {SS1_KEY}"}
    headers_ss2 = {"apikey": SS2_KEY, "Authorization": f"Bearer {SS2_KEY}", "x-upsert": "true"}

    success_count = 0

    for p in all_paths:
        clean_p = p.replace("makfinpay/", "", 1) if p.startswith("makfinpay/") else p
        
        urls = [
            f"{SS1_URL}/storage/v1/object/public/uploads/{p}",
            f"{SS1_URL}/storage/v1/object/public/uploads/{clean_p}",
            f"{SS1_URL}/storage/v1/object/authenticated/uploads/{p}",
            f"{SS1_URL}/storage/v1/object/public/makfinpay/{p}",
        ]

        img_bytes = None
        for u in urls:
            try:
                res = requests.get(u, headers=headers_ss1, timeout=5)
                if res.status_code == 200 and len(res.content) > 100:
                    img_bytes = res.content
                    break
            except Exception:
                pass

        if img_bytes:
            # Save to local storage_backup
            local_path = os.path.join(LOCAL_BACKUP, p.replace("/", os.sep))
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            with open(local_path, "wb") as f_out:
                f_out.write(img_bytes)

            # Upload to SS2 uploads bucket
            ext = p.rsplit(".", 1)[-1].lower() if "." in p else "jpg"
            headers_ss2["Content-Type"] = "image/png" if ext == "png" else "image/jpeg"
            post_url = f"{SS2_URL}/storage/v1/object/uploads/{p}"
            up_res = requests.post(post_url, headers=headers_ss2, data=img_bytes)
            if up_res.status_code in [200, 201]:
                success_count += 1
                print(f"  [OK SUCCESS] Uploaded KYC document for {p} ({len(img_bytes)} bytes)")
            else:
                print(f"  [WARN] Upload failed for {p}: HTTP {up_res.status_code}")
        else:
            print(f"  [MISSING] Could not find physical file on SS1 for KYC path: {p}")

    print("\n" + "=" * 70)
    print(f"DONE: Successfully synced {success_count}/{len(all_paths)} KYC document files to SS2!")
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(sync_kyc_files())
