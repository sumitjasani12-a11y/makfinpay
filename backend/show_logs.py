import asyncio
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from database import PostgresDatabase

async def main():
    db = PostgresDatabase()
    uri = os.environ.get("SUPABASE_POSTGRES_URI")
    if not uri:
        print("Error: SUPABASE_POSTGRES_URI not found in .env")
        return
        
    await db.init_pool(uri)
    
    # Query user
    u = await db.users.find_one({"email": "jigs.vanani@gmail.com"})
    print("=" * 80)
    print("USER DOCUMENT:")
    print(u)
    print("=" * 80)
    return
    txs = []
    
    print("=" * 80)
    print(f"LATEST LIVE BILL TRANSACTIONS LOGS (Database)")
    print("=" * 80)
    
    if not txs:
        print("No live bill transactions found in database.")
    else:
        for tx in txs:
            print(f"Time:       {tx.get('created_at')}")
            print(f"Agent:      {tx.get('user_name')} ({tx.get('user_id')})")
            print(f"Biller:     {tx.get('operator')}")
            print(f"Mobile:     {tx.get('customer_phone')}")
            print(f"Amount:     Rs.{tx.get('bill_amount')}")
            print(f"Status:     {tx.get('status')}")
            print(f"Error Note: {tx.get('note')}")
            print(f"Operator Tx:{tx.get('operator_txn_id')}")
            print("-" * 80)

if __name__ == "__main__":
    asyncio.run(main())
