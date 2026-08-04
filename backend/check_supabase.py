import os
import requests
import database
import asyncio
from dotenv import load_dotenv

load_dotenv()

async def main():
    uri = os.environ.get("SUPABASE_POSTGRES_URI")
    db = database.PostgresDatabase()
    await db.init_pool(uri)
    recharges = await db.recharges.find({"screenshot_path": {"$ne": ""}}, {"_id": 0, "id": 1, "screenshot_path": 1}).to_list(2)
    await db.close()

    supabase_url = os.environ.get("SUPABASE_URL")
    anon_key = os.environ.get("SUPABASE_ANON_KEY")

    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {anon_key}"
    }

    for r in recharges:
        p = r["screenshot_path"]
        # p is "makfinpay/uploads/USER_ID/FILE.jpg"
        # If bucket name is "makfinpay" and path inside bucket is "uploads/USER_ID/FILE.jpg":
        path_without_bucket = p.replace("makfinpay/", "", 1) if p.startswith("makfinpay/") else p
        
        urls = [
            f"{supabase_url}/storage/v1/object/public/makfinpay/{path_without_bucket}",
            f"{supabase_url}/storage/v1/object/public/uploads/{path_without_bucket}",
            f"{supabase_url}/storage/v1/object/public/{p}",
        ]
        
        for u in urls:
            res = requests.get(u, headers=headers)
            print("URL:", u)
            print("Status:", res.status_code, "Length:", len(res.content), "Response:", res.text[:100])
            print("-" * 50)

if __name__ == "__main__":
    asyncio.run(main())
