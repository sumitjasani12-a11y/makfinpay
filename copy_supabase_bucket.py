"""
=============================================================================
 Supabase Storage Bucket Migration & Sync Tool (MAK FIN PAY)
=============================================================================
This script copies all files and folder structures directly from a Live Supabase
Storage Bucket into your Target Project Supabase Storage Bucket (or Local Folder).

Usage:
1. Update SOURCE and TARGET credentials below if migrating across different Supabase projects.
2. Run: python copy_supabase_bucket.py
"""

import os
import requests
import json
import time

# -----------------------------------------------------------------------------
# SOURCE SUPABASE CONFIGURATION (Screenshot 1: makfinpay Project)
# -----------------------------------------------------------------------------
SOURCE_SUPABASE_URL = "https://itbtuduqkhgtfkwpamcw.supabase.co"
SOURCE_SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0YnR1ZHVxa2hndGZrd3BhbWN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5OTg4NDAsImV4cCI6MjEwMDU3NDg0MH0.ui8OpPSqQQbGQ1htNEMtVK--3H2TSOfW49mNAGqu6vo"
SOURCE_BUCKET_NAME  = "uploads"

# -----------------------------------------------------------------------------
# TARGET SUPABASE CONFIGURATION (Screenshot 2: testing Project)
# -----------------------------------------------------------------------------
TARGET_SUPABASE_URL = "https://zpynrddggarkltuueqdk.supabase.co"
TARGET_SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpweW5yZGRnZ2Fya2x0dXVlcWRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTY3MTM3NiwiZXhwIjoyMTAxMjQ3Mzc2fQ._y2imQXpDPLkm9805uTbZE9jQEml6xUkCD7JKbvNh2g"
TARGET_BUCKET_NAME  = "uploads"

# Local backup directory
LOCAL_BACKUP_DIR = os.path.join(os.path.dirname(__file__), "storage_backup")


def get_headers(api_key):
    return {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}"
    }


def ensure_bucket_exists(supabase_url, api_key, bucket_name):
    """Creates the target bucket if it doesn't already exist."""
    headers = get_headers(api_key)
    headers["Content-Type"] = "application/json"
    
    # Check existing buckets
    res = requests.get(f"{supabase_url}/storage/v1/bucket", headers=headers)
    if res.status_code == 200:
        buckets = res.json()
        if any(b.get("name") == bucket_name or b.get("id") == bucket_name for b in buckets):
            print(f"[OK] Target bucket '{bucket_name}' exists.")
            return True

    # Create bucket if missing
    payload = {"id": bucket_name, "name": bucket_name, "public": True}
    res = requests.post(f"{supabase_url}/storage/v1/bucket", headers=headers, json=payload)
    if res.status_code in [200, 201]:
        print(f"[OK] Created target bucket '{bucket_name}'.")
        return True
    else:
        print(f"[WARN] Target bucket status: {res.status_code} ({res.text})")
        return False


def list_files_recursive(supabase_url, api_key, bucket_name, prefix=""):
    """Recursively lists all files in a Supabase storage bucket."""
    headers = get_headers(api_key)
    headers["Content-Type"] = "application/json"
    
    files_list = []
    offset = 0
    limit = 100
    
    while True:
        payload = {
            "prefix": prefix,
            "limit": limit,
            "offset": offset,
            "sortBy": {"column": "name", "order": "asc"}
        }
        url = f"{supabase_url}/storage/v1/object/list/{bucket_name}"
        res = requests.post(url, headers=headers, json=payload)
        
        if res.status_code != 200:
            print(f"[ERROR] Listing files under prefix '{prefix}': {res.status_code} {res.text}")
            break
            
        items = res.json()
        if not items:
            break
            
        for item in items:
            item_name = item.get("name")
            if not item_name:
                continue
            
            full_path = f"{prefix}/{item_name}".strip("/") if prefix else item_name
            
            # Check if directory or file (Supabase represents folders with id=None or metadata=None)
            if item.get("id") is None and item.get("metadata") is None:
                # Subfolder -> Recurse into it
                sub_files = list_files_recursive(supabase_url, api_key, bucket_name, prefix=full_path)
                files_list.extend(sub_files)
            else:
                # File item
                files_list.append({
                    "name": item_name,
                    "path": full_path,
                    "size": item.get("metadata", {}).get("size") if item.get("metadata") else 0,
                    "mimetype": item.get("metadata", {}).get("mimetype") if item.get("metadata") else "application/octet-stream"
                })
                
        if len(items) < limit:
            break
        offset += limit

    return files_list


def download_file(supabase_url, api_key, bucket_name, file_path):
    """Downloads a file from Supabase storage as bytes."""
    headers = get_headers(api_key)
    url = f"{supabase_url}/storage/v1/object/{bucket_name}/{file_path}"
    res = requests.get(url, headers=headers)
    if res.status_code == 200:
        return res.content
    
    # Try public URL fallback
    url_public = f"{supabase_url}/storage/v1/object/public/{bucket_name}/{file_path}"
    res_pub = requests.get(url_public, headers=headers)
    if res_pub.status_code == 200:
        return res_pub.content
        
    print(f"[FAIL] Download '{file_path}': HTTP {res.status_code}")
    return None


def upload_file(supabase_url, api_key, bucket_name, file_path, file_bytes, content_type="application/octet-stream"):
    """Uploads bytes into target Supabase storage bucket with x-upsert enabled."""
    headers = get_headers(api_key)
    headers["Content-Type"] = content_type or "application/octet-stream"
    headers["x-upsert"] = "true"
    
    url = f"{supabase_url}/storage/v1/object/{bucket_name}/{file_path}"
    res = requests.post(url, headers=headers, data=file_bytes)
    
    if res.status_code in [200, 201]:
        return True
    else:
        print(f"[FAIL] Upload '{file_path}': HTTP {res.status_code} ({res.text})")
        return False


def copy_bucket():
    print("=" * 70)
    print("SUPABASE STORAGE BUCKET DIRECT COPY TOOL")
    print("=" * 70)
    print(f"Source Bucket : '{SOURCE_BUCKET_NAME}' @ {SOURCE_SUPABASE_URL}")
    print(f"Target Bucket : '{TARGET_BUCKET_NAME}' @ {TARGET_SUPABASE_URL}")
    print(f"Local Backup  : {LOCAL_BACKUP_DIR}\n")
    
    # 1. Ensure target bucket exists
    ensure_bucket_exists(TARGET_SUPABASE_URL, TARGET_SERVICE_KEY, TARGET_BUCKET_NAME)
    
    # 2. List all files from source bucket
    print(f"\n[INFO] Scanning all files in source bucket '{SOURCE_BUCKET_NAME}'...")
    all_files = list_files_recursive(SOURCE_SUPABASE_URL, SOURCE_SERVICE_KEY, SOURCE_BUCKET_NAME)
    print(f"[INFO] Total files found: {len(all_files)}\n")
    
    if not all_files:
        print("[WARN] No files found in the source bucket.")
        return

    success_count = 0
    fail_count = 0

    # 3. Copy files loop
    for idx, f_info in enumerate(all_files, 1):
        f_path = f_info["path"]
        f_type = f_info["mimetype"]
        
        print(f"[{idx}/{len(all_files)}] Copying '{f_path}'...", end=" ", flush=True)
        
        # Download from source
        content = download_file(SOURCE_SUPABASE_URL, SOURCE_SERVICE_KEY, SOURCE_BUCKET_NAME, f_path)
        if not content:
            fail_count += 1
            continue

        # Save local backup copy
        local_path = os.path.join(LOCAL_BACKUP_DIR, f_path.replace("/", os.sep))
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, "wb") as f_out:
            f_out.write(content)

        # Upload to target bucket
        ok = upload_file(TARGET_SUPABASE_URL, TARGET_SERVICE_KEY, TARGET_BUCKET_NAME, f_path, content, f_type)
        if ok:
            print("OK")
            success_count += 1
        else:
            fail_count += 1

    print("\n" + "=" * 70)
    print(f"MIGRATION SUMMARY: {success_count} Copied | {fail_count} Failed | Total {len(all_files)}")
    print(f"Local Backup Folder: {LOCAL_BACKUP_DIR}")
    print("=" * 70)


if __name__ == "__main__":
    copy_bucket()
