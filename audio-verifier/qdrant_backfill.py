#!/usr/bin/env python3
"""
Backfill Qdrant with historical embeddings from PostgreSQL.

This script processes completed verification sessions and:
1. Generates embeddings for sessions without them
2. Syncs existing embeddings to Qdrant
3. Tracks sync progress in the database

Run with: python qdrant_backfill.py
"""

import asyncio
import argparse
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Optional

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import after path setup
from semantic_indexer import create_semantic_indexer
from session_store import SessionStore
from batch_historical_analyzer import batch_historical_analyzer


async def get_session_count(store: SessionStore) -> dict:
    """Get counts of sessions by embedding status."""
    try:
        pool = await store._get_pool()
        async with pool.acquire() as conn:
            # Total completed sessions
            total = await conn.fetchval(
                "SELECT COUNT(*) FROM verification_sessions WHERE status = 'completed'"
            )

            # Sessions without embeddings
            no_embedding = await conn.fetchval(
                "SELECT COUNT(*) FROM verification_sessions WHERE status = 'completed' AND embedding IS NULL"
            )

            # Sessions not synced to Qdrant
            not_synced = await conn.fetchval(
                "SELECT COUNT(*) FROM verification_sessions WHERE status = 'completed' AND (qdrant_synced = FALSE OR qdrant_synced IS NULL)"
            )

            return {
                "total_completed": total,
                "without_embeddings": no_embedding,
                "not_synced_to_qdrant": not_synced
            }
    except Exception as e:
        logger.error(f"Failed to get session counts: {e}")
        return {}


async def backfill_embeddings(
    indexer,
    batch_size: int = 100,
    limit: Optional[int] = None
) -> int:
    """
    Generate embeddings for completed sessions without them.

    Args:
        indexer: SemanticIndexer instance
        batch_size: Number of sessions to process per batch
        limit: Maximum number to process (None for all)

    Returns:
        Number of sessions processed
    """
    logger.info(f"Starting embedding generation (batch_size={batch_size})")

    total_processed = 0
    while True:
        if limit and total_processed >= limit:
            break

        processed = await indexer.batch_index(limit=batch_size)
        if processed == 0:
            logger.info("No more sessions to index")
            break

        total_processed += processed
        logger.info(f"Progress: {total_processed} sessions indexed")

        # Brief pause between batches
        await asyncio.sleep(0.5)

    return total_processed


async def sync_to_qdrant(
    indexer,
    batch_size: int = 100,
    limit: Optional[int] = None
) -> int:
    """
    Sync embeddings from PostgreSQL to Qdrant.

    Args:
        indexer: SemanticIndexer instance
        batch_size: Number of sessions to sync per batch
        limit: Maximum number to process (None for all)

    Returns:
        Number of sessions synced
    """
    logger.info(f"Starting Qdrant sync (batch_size={batch_size})")

    total_synced = 0
    while True:
        if limit and total_synced >= limit:
            break

        synced = await indexer.sync_unsynced_to_qdrant(limit=batch_size)
        if synced == 0:
            logger.info("No more sessions to sync")
            break

        total_synced += synced
        logger.info(f"Progress: {total_synced} sessions synced to Qdrant")

        await asyncio.sleep(0.5)

    return total_synced


async def main():
    """Main backfill orchestration."""
    parser = argparse.ArgumentParser(
        description="Backfill Qdrant with historical embeddings"
    )
    parser.add_argument(
        "--mode",
        choices=["full", "embeddings-only", "sync-only", "status"],
        default="full",
        help="Backfill mode: full (all steps), embeddings-only, sync-only, or status"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="Number of sessions per batch"
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Maximum sessions to process"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes"
    )

    args = parser.parse_args()

    # Check environment
    if not os.getenv("DATABASE_URL"):
        logger.error("DATABASE_URL environment variable not set")
        sys.exit(1)

    if not os.getenv("OPENROUTER_API_KEY"):
        logger.error("OPENROUTER_API_KEY environment variable not set")
        sys.exit(1)

    try:
        logger.info("Initializing backfill service...")
        indexer = create_semantic_indexer()
        store = SessionStore()

        # Get current status
        counts = await get_session_count(store)
        logger.info(f"Current status: {counts}")

        if args.mode == "status":
            logger.info("Status check completed")
            return 0

        if args.dry_run:
            logger.info("DRY RUN: No changes will be made")

        start_time = datetime.now(timezone.utc)
        total_processed = 0

        # Generate embeddings
        if args.mode in ["full", "embeddings-only"]:
            if counts.get("without_embeddings", 0) > 0:
                logger.info(f"Generating embeddings for {counts['without_embeddings']} sessions...")
                if not args.dry_run:
                    processed = await backfill_embeddings(
                        indexer,
                        batch_size=args.batch_size,
                        limit=args.limit
                    )
                    total_processed += processed
                else:
                    logger.info(f"[DRY RUN] Would generate embeddings for {min(counts['without_embeddings'], args.limit or counts['without_embeddings'])} sessions")
            else:
                logger.info("All sessions already have embeddings")

        # Sync to Qdrant
        if args.mode in ["full", "sync-only"]:
            counts = await get_session_count(store)
            if counts.get("not_synced_to_qdrant", 0) > 0:
                logger.info(f"Syncing {counts['not_synced_to_qdrant']} sessions to Qdrant...")
                if not args.dry_run:
                    synced = await sync_to_qdrant(
                        indexer,
                        batch_size=args.batch_size,
                        limit=args.limit
                    )
                    total_processed += synced
                else:
                    logger.info(f"[DRY RUN] Would sync {min(counts['not_synced_to_qdrant'], args.limit or counts['not_synced_to_qdrant'])} sessions to Qdrant")
            else:
                logger.info("All sessions already synced to Qdrant")

        # Final status
        duration = (datetime.now(timezone.utc) - start_time).total_seconds()
        logger.info(f"Backfill completed in {duration:.1f}s")
        logger.info(f"Total processed: {total_processed} sessions")

        final_counts = await get_session_count(store)
        logger.info(f"Final status: {final_counts}")

        await indexer.close()
        await store.close()

        return 0

    except Exception as e:
        logger.error(f"Backfill failed: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
