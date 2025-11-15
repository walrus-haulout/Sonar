#!/usr/bin/env python3
"""
Database migration runner for audio-verifier.
Applies SQL migrations in order to update database schema.
"""

import asyncio
import asyncpg
import logging
import os
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def run_migrations():
    """Run all pending migrations."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        logger.error("DATABASE_URL environment variable not set")
        sys.exit(1)

    # Get migration files in order
    migrations_dir = Path(__file__).parent
    migration_files = sorted(migrations_dir.glob("*.sql"))

    if not migration_files:
        logger.info("No migrations to run")
        return

    logger.info(f"Found {len(migration_files)} migration files")

    # Connect to database
    pool = await asyncpg.create_pool(
        database_url,
        min_size=1,
        max_size=5,
        command_timeout=60
    )

    try:
        async with pool.acquire() as conn:
            for migration_file in migration_files:
                logger.info(f"Running migration: {migration_file.name}")

                # Read migration file
                with open(migration_file, 'r') as f:
                    migration_sql = f.read()

                # Execute migration
                try:
                    await conn.execute(migration_sql)
                    logger.info(f"✓ Completed: {migration_file.name}")
                except Exception as e:
                    logger.error(f"✗ Failed: {migration_file.name}")
                    logger.error(f"Error: {str(e)}")
                    raise

        logger.info("All migrations completed successfully!")

    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(run_migrations())
