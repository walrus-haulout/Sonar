#!/usr/bin/env python3
"""Delete all marketplace datasets from the database."""

import asyncio
import os
import asyncpg


async def delete_all_datasets():
    """Delete all datasets and related records from the database."""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL environment variable is required")

    pool = await asyncpg.create_pool(database_url)

    try:
        print("🗑️  Starting deletion of all marketplace datasets...\n")

        # Count records before deletion
        async with pool.acquire() as conn:
            dataset_count = await conn.fetchval('SELECT COUNT(*) FROM "Dataset"')
            blob_count = await conn.fetchval('SELECT COUNT(*) FROM "DatasetBlob"')
            purchase_count = await conn.fetchval('SELECT COUNT(*) FROM "Purchase"')
            access_log_count = await conn.fetchval('SELECT COUNT(*) FROM "AccessLog"')

            print(f"📊 Current counts:")
            print(f"   - Datasets: {dataset_count}")
            print(f"   - Dataset Blobs: {blob_count}")
            print(f"   - Purchases: {purchase_count}")
            print(f"   - Access Logs: {access_log_count}\n")

            if dataset_count == 0:
                print("✅ No datasets found. Database is already clean.")
                return

            # Delete all datasets (cascade will handle related records)
            print("🗑️  Deleting all datasets and related records...")
            deleted = await conn.execute('DELETE FROM "Dataset"')

            # Extract count from DELETE result
            result_text = deleted.split()[-1] if deleted else "0"

            print(f"\n✅ Successfully deleted datasets")
            print(
                "   Related DatasetBlobs, Purchases, and AccessLogs were automatically deleted via cascade."
            )

            # Verify deletion
            remaining_datasets = await conn.fetchval('SELECT COUNT(*) FROM "Dataset"')
            remaining_blobs = await conn.fetchval('SELECT COUNT(*) FROM "DatasetBlob"')
            remaining_purchases = await conn.fetchval('SELECT COUNT(*) FROM "Purchase"')
            remaining_access_logs = await conn.fetchval(
                'SELECT COUNT(*) FROM "AccessLog"'
            )

            print(f"\n📊 Remaining counts:")
            print(f"   - Datasets: {remaining_datasets}")
            print(f"   - Dataset Blobs: {remaining_blobs}")
            print(f"   - Purchases: {remaining_purchases}")
            print(f"   - Access Logs: {remaining_access_logs}")

            if (
                remaining_datasets == 0
                and remaining_blobs == 0
                and remaining_purchases == 0
                and remaining_access_logs == 0
            ):
                print("\n✨ All marketplace data successfully removed!")
            else:
                print("\n⚠️  Warning: Some records still remain.")

    except Exception as e:
        print(f"❌ Error deleting datasets: {e}")
        raise
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(delete_all_datasets())
