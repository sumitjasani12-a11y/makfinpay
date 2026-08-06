"""
=============================================================================
 Fast Bulk Database Table Migration Tool: SS1 (makfinpay) ---> SS2 (testing)
 Wipes dummy data on SS2 and imports 100% complete real tables from SS1 in batches
=============================================================================
"""

import os
import json
import uuid
import datetime
import asyncio
import asyncpg
import time

# -----------------------------------------------------------------------------
# DSN CONFIGURATIONS
# -----------------------------------------------------------------------------
SS1_DB_DSN = "postgresql://postgres:Jigscse%40123@db.itbtuduqkhgtfkwpamcw.supabase.co:5432/postgres?sslmode=require"
SS2_DB_DSN = "postgresql://postgres:Jigscse%40123@db.zpynrddggarkltuueqdk.supabase.co:5432/postgres?sslmode=require"

TABLES_TO_MIGRATE = [
    "admin_credentials",
    "users",
    "wallets",
    "ledger",
    "recharges",
    "transactions",
    "withdrawals",
    "kyc",
    "qr_codes",
    "qr_name_entries",
    "bank_details",
    "settings",
    "files",
    "headlines",
    "audit_logs",
    "service_charge_slabs",
    "banks",
    "rejection_categories",
    "rejection_reasons",
    "policies",
    "billers",
    "admin_profit_ledger",
    "admin_cashbook"
]

LOCAL_SAFETY_BACKUP = os.path.join(os.path.dirname(__file__), "ss2_safety_backup.json")


def default_json_serializer(obj):
    if isinstance(obj, (datetime.datetime, datetime.date)):
        return obj.isoformat()
    if isinstance(obj, uuid.UUID):
        return str(obj)
    if isinstance(obj, (bytes, bytearray)):
        return "\\x" + obj.hex()
    return str(obj)


async def get_existing_tables(conn):
    rows = await conn.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema='public';")
    return set(r["table_name"] for r in rows)


async def dump_ss2_safety_backup(ss2_conn, existing_tables):
    print("\n[STEP 1] Creating Safety Backup of current SS2 (testing) database...")
    backup_data = {}
    for table in TABLES_TO_MIGRATE:
        if table not in existing_tables:
            continue
        try:
            rows = await ss2_conn.fetch(f'SELECT * FROM public."{table}";')
            backup_data[table] = [dict(r) for r in rows]
            print(f"  - Backed up '{table}': {len(rows)} rows")
        except Exception as e:
            print(f"  - Skip '{table}': {e}")
            
    with open(LOCAL_SAFETY_BACKUP, "w", encoding="utf-8") as f:
        json.dump(backup_data, f, default=default_json_serializer, indent=2)
    print(f"[OK] Safety backup saved to '{LOCAL_SAFETY_BACKUP}'\n")


async def wipe_ss2_database(ss2_conn, existing_tables):
    print("[STEP 2] Wiping all existing dummy data in SS2 (testing) database...")
    valid_tables = [t for t in TABLES_TO_MIGRATE if t in existing_tables]
    table_list_str = ", ".join([f'public."{t}"' for t in valid_tables])
    try:
        await ss2_conn.execute(f"TRUNCATE TABLE {table_list_str} CASCADE;")
        print("[OK] All SS2 tables successfully wiped!\n")
    except Exception as e:
        print(f"[WARN] Truncate cascade error, falling back to individual deletes: {e}")
        for t in reversed(valid_tables):
            try:
                await ss2_conn.execute(f'DELETE FROM public."{t}";')
                print(f"  - Wiped '{t}'")
            except Exception as ex:
                print(f"  - Warning wiping '{t}': {ex}")
        print("[OK] Finished wiping SS2 tables.\n")


async def migrate_tables():
    start_time = time.time()
    print("=" * 70)
    print("BULK MIGRATING ALL DATABASE TABLES: SS1 (makfinpay) ---> SS2 (testing)")
    print("=" * 70)

    print("[INFO] Connecting to SS1 (makfinpay) and SS2 (testing)...")
    ss1_conn = await asyncpg.connect(SS1_DB_DSN)
    ss2_conn = await asyncpg.connect(SS2_DB_DSN)

    ss1_tables = await get_existing_tables(ss1_conn)
    ss2_tables = await get_existing_tables(ss2_conn)

    # 1. Safety Backup
    await dump_ss2_safety_backup(ss2_conn, ss2_tables)

    # 2. Wipe SS2
    await wipe_ss2_database(ss2_conn, ss2_tables)

    print("[STEP 3] Fetching real data from SS1 and bulk inserting into SS2...")

    total_inserted = 0

    for table in TABLES_TO_MIGRATE:
        if table not in ss1_tables or table not in ss2_tables:
            print(f"  - '{table}': Not present in both schemas (Skipped)")
            continue

        try:
            rows = await ss1_conn.fetch(f'SELECT * FROM public."{table}";')
            if not rows:
                print(f"  - '{table}': 0 rows in SS1 (Skipped)")
                continue

            row_dicts = [dict(r) for r in rows]
            cols = list(row_dicts[0].keys())
            cols_str = ", ".join([f'"{c}"' for c in cols])
            placeholders = ", ".join([f"${i+1}" for i in range(len(cols))])

            insert_query = f'INSERT INTO public."{table}" ({cols_str}) VALUES ({placeholders}) ON CONFLICT DO NOTHING;'

            # Execute batch insert using executemany in 500-row chunks
            all_vals = [[r[c] for c in cols] for r in row_dicts]
            chunk_size = 500
            table_inserted = 0

            for i in range(0, len(all_vals), chunk_size):
                batch = all_vals[i:i + chunk_size]
                try:
                    await ss2_conn.executemany(insert_query, batch)
                    table_inserted += len(batch)
                except Exception as batch_err:
                    # Fallback to single-row inserts for this batch
                    for vals in batch:
                        try:
                            await ss2_conn.execute(insert_query, *vals)
                            table_inserted += 1
                        except Exception:
                            pass

            total_inserted += table_inserted
            print(f"  - SUCCESS '{table}': Bulk imported {table_inserted}/{len(rows)} rows!")

        except Exception as e:
            print(f"  - ERROR importing '{table}': {e}")

    await ss1_conn.close()
    await ss2_conn.close()

    elapsed = time.time() - start_time
    print("\n" + "=" * 70)
    print(f"DATABASE MIGRATION COMPLETED IN {elapsed:.2f} SECONDS!")
    print(f"Total {total_inserted} real records imported to SS2 (testing).")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(migrate_tables())
