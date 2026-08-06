"""
=============================================================================
 Fast Multi-Threaded Supabase-to-Supabase Storage Sync Tool
 From SS1 (makfinpay) To SS2 (testing) - 20 Parallel Worker Threads
=============================================================================
"""

import os
import asyncpg
import asyncio
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

# -----------------------------------------------------------------------------
# SS1 (Source: makfinpay project)
# -----------------------------------------------------------------------------
SS1_DB_DSN = "postgresql://postgres:Jigscse%40123@db.itbtuduqkhgtfkwpamcw.supabase.co:5432/postgres?sslmode=require"
SS1_SUPABASE_URL = "https://itbtuduqkhgtfkwpamcw.supabase.co"
SS1_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0YnR1ZHVxa2hndGZrd3BhbWN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5OTg4NDAsImV4cCI6MjEwMDU3NDg0MH0.ui8OpPSqQQbGQ1htNEMtVK--3H2TSOfW49mNAGqu6vo"

# -----------------------------------------------------------------------------
# SS2 (Target: testing project)
# -----------------------------------------------------------------------------
SS2_SUPABASE_URL = "https://zpynrddggarkltuueqdk.supabase.co"
SS2_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpweW5yZGRnZ2Fya2x0dXVlcWRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTY3MTM3NiwiZXhwIjoyMTAxMjQ3Mzc2fQ._y2imQXpDPLkm9805uTbZE9jQEml6xUkCD7JKbvNh2g"
SS2_BUCKET = "uploads"

LOCAL_BACKUP_DIR = os.path.join(os.path.dirname(__file__), "storage_backup")


def get_headers(api_key):
    return {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}"
    }


def ensure_target_bucket():
    headers = get_headers(SS2_SERVICE_KEY)
    headers["Content-Type"] = "application/json"
    res = requests.get(f"{SS2_SUPABASE_URL}/storage/v1/bucket", headers=headers)
    if res.status_code == 200:
        buckets = res.json()
        if any(b.get("name") == SS2_BUCKET or b.get("id") == SS2_BUCKET for b in buckets):
            print(f"[OK] Target bucket '{SS2_BUCKET}' exists on SS2.")
            return
    res = requests.post(f"{SS2_SUPABASE_URL}/storage/v1/bucket", headers=headers, json={"id": SS2_BUCKET, "name": SS2_BUCKET, "public": True})
    print(f"[OK] Ensured bucket '{SS2_BUCKET}' on SS2 (HTTP {res.status_code}).")


def process_single_file(item_info):
    idx, total, path_key, b_id, fname, mtype = item_info
    headers_ss1 = get_headers(SS1_KEY)
    
    # Download from SS1 (Try multiple path formats)
    urls_to_try = [
        f"{SS1_SUPABASE_URL}/storage/v1/object/{b_id}/{fname}",
        f"{SS1_SUPABASE_URL}/storage/v1/object/public/{b_id}/{fname}",
        f"{SS1_SUPABASE_URL}/storage/v1/object/public/uploads/{fname}",
        f"{SS1_SUPABASE_URL}/storage/v1/object/public/makfinpay/{fname}",
        f"{SS1_SUPABASE_URL}/storage/v1/object/public/{fname}",
    ]
    
    content = None
    for u in urls_to_try:
        try:
            r = requests.get(u, headers=headers_ss1, timeout=15)
            if r.status_code == 200 and len(r.content) > 0:
                content = r.content
                break
        except Exception:
            pass

    if not content:
        return idx, False, f"Download failed '{path_key}'"

    # Save to local backup
    local_file = os.path.join(LOCAL_BACKUP_DIR, fname.replace("/", os.sep))
    os.makedirs(os.path.dirname(local_file), exist_ok=True)
    with open(local_file, "wb") as f_out:
        f_out.write(content)

    # Upload to SS2 (testing project)
    headers_upload = {
        "apikey": SS2_SERVICE_KEY,
        "Authorization": f"Bearer {SS2_SERVICE_KEY}",
        "Content-Type": mtype,
        "x-upsert": "true"
    }
    
    target_path = fname if not fname.startswith("uploads/") else fname.replace("uploads/", "", 1)
    up_url = f"{SS2_SUPABASE_URL}/storage/v1/object/{SS2_BUCKET}/{target_path}"
    
    try:
        res_up = requests.post(up_url, headers=headers_upload, data=content, timeout=20)
        if res_up.status_code in [200, 201]:
            return idx, True, target_path
        else:
            return idx, False, f"Upload HTTP {res_up.status_code}"
    except Exception as e:
        return idx, False, str(e)


async def sync():
    start_time = time.time()
    print("=" * 70)
    print("FAST MULTI-THREADED BUCKET MIGRATION (20 WORKERS)")
    print("SS1 (makfinpay) ---> SS2 (testing)")
    print("=" * 70)
    ensure_target_bucket()

    print("\n[INFO] Connecting to SS1 Database to fetch storage objects...")
    conn = await asyncpg.connect(SS1_DB_DSN)
    
    rows = await conn.fetch("SELECT name, bucket_id, metadata FROM storage.objects;")
    recharge_rows = await conn.fetch("SELECT screenshot_path FROM recharges WHERE screenshot_path IS NOT NULL AND screenshot_path != '';")
    recharge_paths = [r["screenshot_path"] for r in recharge_rows if r["screenshot_path"]]
    await conn.close()

    file_map = {}
    for r in rows:
        b_id = r["bucket_id"]
        fname = r["name"]
        mtype = "application/octet-stream"
        if r["metadata"] and isinstance(r["metadata"], str):
            try:
                import json
                meta = json.loads(r["metadata"])
                mtype = meta.get("mimetype") or mtype
            except Exception:
                pass
        file_map[f"{b_id}/{fname}"] = (b_id, fname, mtype)

    for p in recharge_paths:
        clean_p = p.replace("makfinpay/", "", 1) if p.startswith("makfinpay/") else p
        if clean_p not in file_map:
            file_map[clean_p] = ("uploads", clean_p, "application/octet-stream")

    total_files = len(file_map)
    print(f"[INFO] Total unique file targets: {total_files}\n")

    items_to_process = []
    for idx, (path_key, (b_id, fname, mtype)) in enumerate(file_map.items(), 1):
        items_to_process.append((idx, total_files, path_key, b_id, fname, mtype))

    copied = 0
    failed = 0

    print("[INFO] Launching 20 parallel workers...")
    with ThreadPoolExecutor(max_workers=20) as executor:
        futures = {executor.submit(process_single_file, item): item for item in items_to_process}
        for future in as_completed(futures):
            idx, success, msg = future.result()
            if success:
                copied += 1
            else:
                failed += 1
            
            if (copied + failed) % 50 == 0 or (copied + failed) == total_files:
                elapsed = time.time() - start_time
                rate = (copied + failed) / elapsed if elapsed > 0 else 0
                rem = (total_files - (copied + failed)) / rate if rate > 0 else 0
                print(f"[PROGRESS] {copied + failed}/{total_files} done ({copied} OK, {failed} FAIL) | Speed: {rate:.1f} files/sec | Est. Remaining: {rem/60:.1f} mins")

    elapsed_total = time.time() - start_time
    print("\n" + "=" * 70)
    print(f"MIGRATION COMPLETE IN {elapsed_total/60:.2f} MINUTES!")
    print(f"Summary: {copied} Copied | {failed} Failed | Total {total_files}")
    print(f"Local Backup Directory: {LOCAL_BACKUP_DIR}")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(sync())
