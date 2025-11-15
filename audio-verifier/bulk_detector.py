"""
Bulk Submission Detector.

Identifies bulk submissions (100+ samples) and tracks first bulk contributors.
"""

import asyncpg
import logging
import os
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)


class BulkDetector:
    """Detect and track bulk submissions."""

    BULK_THRESHOLD = 100  # 100+ samples = bulk submission

    def __init__(self):
        """Initialize detector."""
        self.database_url = os.getenv("DATABASE_URL")
        if not self.database_url:
            raise RuntimeError("DATABASE_URL must be set")
        self._pool: Optional[asyncpg.Pool] = None

    async def _get_pool(self) -> asyncpg.Pool:
        """Get or create database connection pool."""
        if self._pool is None:
            self._pool = await asyncpg.create_pool(
                self.database_url,
                min_size=1,
                max_size=10,
                command_timeout=60
            )
        return self._pool

    def is_bulk_submission(self, sample_count: int) -> bool:
        """
        Check if submission is bulk (100+ samples).

        Args:
            sample_count: Number of samples

        Returns:
            True if bulk, False otherwise
        """
        return sample_count >= self.BULK_THRESHOLD

    async def is_first_bulk_for_subject(
        self,
        subject: str,
        exclude_session_id: Optional[str] = None
    ) -> bool:
        """
        Check if this would be first bulk submission for a subject.

        Args:
            subject: Subject to check
            exclude_session_id: Session to exclude (for checking current)

        Returns:
            True if no bulk submission exists yet, False if one does
        """
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                if exclude_session_id:
                    count = await conn.fetchval(
                        """
                        SELECT COUNT(*)
                        FROM verification_sessions
                        WHERE subject = $1
                        AND sample_count >= $2
                        AND id != $3
                        AND status = 'completed'
                        """,
                        subject,
                        self.BULK_THRESHOLD,
                        exclude_session_id
                    )
                else:
                    count = await conn.fetchval(
                        """
                        SELECT COUNT(*)
                        FROM verification_sessions
                        WHERE subject = $1
                        AND sample_count >= $2
                        AND status = 'completed'
                        """,
                        subject,
                        self.BULK_THRESHOLD
                    )

                return (count or 0) == 0  # True if none exist yet

        except Exception as e:
            logger.error(f"Error checking first bulk: {e}")
            return False

    async def get_bulk_contributor_status(
        self,
        subject: str,
        sample_count: int
    ) -> Dict[str, any]:
        """
        Get bulk contributor status for a submission.

        Args:
            subject: Subject being submitted
            sample_count: Number of samples

        Returns:
            Status info
        """
        try:
            is_bulk = self.is_bulk_submission(sample_count)

            if not is_bulk:
                return {
                    "is_bulk": False,
                    "is_first_bulk": False,
                    "bulk_multiplier": 1.0,
                    "message": "Small submission (< 100 samples)"
                }

            is_first = await self.is_first_bulk_for_subject(subject)

            if is_first:
                return {
                    "is_bulk": True,
                    "is_first_bulk": True,
                    "bulk_multiplier": 2.0,
                    "message": f"First bulk submission ({sample_count} samples) for this subject!"
                }
            else:
                return {
                    "is_bulk": True,
                    "is_first_bulk": False,
                    "bulk_multiplier": 1.2,
                    "message": f"Subsequent bulk submission ({sample_count} samples)"
                }

        except Exception as e:
            logger.error(f"Error getting bulk status: {e}")
            return {
                "is_bulk": sample_count >= self.BULK_THRESHOLD,
                "is_first_bulk": False,
                "bulk_multiplier": 1.0,
                "message": "Error checking status"
            }

    async def get_first_bulk_contributor(
        self,
        subject: str
    ) -> Optional[Dict[str, any]]:
        """
        Get information about first bulk contributor for a subject.

        Args:
            subject: Subject to query

        Returns:
            Bulk contributor info or None
        """
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                contributor = await conn.fetchrow(
                    """
                    SELECT id, wallet_address, sample_count, created_at, rarity_score, points_awarded
                    FROM verification_sessions
                    WHERE subject = $1
                    AND sample_count >= $2
                    AND status = 'completed'
                    ORDER BY created_at ASC
                    LIMIT 1
                    """,
                    subject,
                    self.BULK_THRESHOLD
                )

                if not contributor:
                    return None

                return {
                    "session_id": str(contributor["id"]),
                    "wallet_address": contributor["wallet_address"],
                    "sample_count": contributor["sample_count"],
                    "created_at": contributor["created_at"].isoformat(),
                    "rarity_score": contributor["rarity_score"],
                    "points_awarded": contributor["points_awarded"]
                }

        except Exception as e:
            logger.error(f"Error getting first bulk contributor: {e}")
            return None

    async def get_bulk_submissions_for_subject(
        self,
        subject: str,
        limit: int = 10
    ) -> list:
        """
        Get all bulk submissions for a subject.

        Args:
            subject: Subject to query
            limit: Max results

        Returns:
            List of bulk submissions
        """
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                submissions = await conn.fetch(
                    """
                    SELECT id, wallet_address, sample_count, created_at,
                           rarity_score, points_awarded
                    FROM verification_sessions
                    WHERE subject = $1
                    AND sample_count >= $2
                    AND status = 'completed'
                    ORDER BY created_at ASC
                    LIMIT $3
                    """,
                    subject,
                    self.BULK_THRESHOLD,
                    limit
                )

                return [
                    {
                        "session_id": str(s["id"]),
                        "wallet_address": s["wallet_address"],
                        "sample_count": s["sample_count"],
                        "created_at": s["created_at"].isoformat(),
                        "rarity_score": s["rarity_score"],
                        "points_awarded": s["points_awarded"],
                        "is_first": i == 0
                    }
                    for i, s in enumerate(submissions)
                ]

        except Exception as e:
            logger.error(f"Error getting bulk submissions: {e}")
            return []

    async def get_bulk_statistics(self) -> Dict[str, any]:
        """Get overall bulk submission statistics."""
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                # Total bulk submissions
                bulk_count = await conn.fetchval(
                    """
                    SELECT COUNT(*)
                    FROM verification_sessions
                    WHERE sample_count >= $1
                    AND status = 'completed'
                    """,
                    self.BULK_THRESHOLD
                )

                # Total samples from bulk submissions
                bulk_samples = await conn.fetchval(
                    """
                    SELECT COALESCE(SUM(sample_count), 0)
                    FROM verification_sessions
                    WHERE sample_count >= $1
                    AND status = 'completed'
                    """,
                    self.BULK_THRESHOLD
                )

                # Unique subjects with bulk submissions
                bulk_subjects = await conn.fetchval(
                    """
                    SELECT COUNT(DISTINCT subject)
                    FROM verification_sessions
                    WHERE sample_count >= $1
                    AND status = 'completed'
                    """,
                    self.BULK_THRESHOLD
                )

                # Average bulk submission size
                avg_bulk_size = await conn.fetchval(
                    """
                    SELECT AVG(sample_count)
                    FROM verification_sessions
                    WHERE sample_count >= $1
                    AND status = 'completed'
                    """,
                    self.BULK_THRESHOLD
                )

                return {
                    "total_bulk_submissions": bulk_count or 0,
                    "total_samples_from_bulk": bulk_samples or 0,
                    "unique_subjects_with_bulk": bulk_subjects or 0,
                    "average_bulk_size": int(avg_bulk_size) if avg_bulk_size else 0
                }

        except Exception as e:
            logger.error(f"Error getting bulk statistics: {e}")
            return {}

    async def close(self):
        """Close database connection."""
        if self._pool:
            await self._pool.close()
            self._pool = None


def create_bulk_detector() -> BulkDetector:
    """Factory function to create detector instance."""
    return BulkDetector()
