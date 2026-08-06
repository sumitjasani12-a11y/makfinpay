import os
import shutil
import asyncio
import asyncpg

CACHE_DIR = os.path.join(os.path.dirname(__file__), "backend", "cache")

print("--- CLEARING OLD GENERATED CARDS FROM CACHE ---")
if os.path.exists(CACHE_DIR):
    shutil.rmtree(CACHE_DIR)
    print("Deleted backend/cache/ directory successfully!")

os.makedirs(CACHE_DIR, exist_ok=True)
print("Re-created clean backend/cache/ directory!")
