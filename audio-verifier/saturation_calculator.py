"""
Saturation Calculator.

Calculate saturation levels for subjects with smart threshold logic.
Applies 25-sample minimum before penalizing saturation.
"""

import asyncpg
import logging
import os
from typing import Dict, Optional, List, Any

logger = logging.getLogger(__name__)


class SaturationCalculator:
    """Calculate subject saturation and apply penalties."""

    # Saturation penalty scale (applied only when count >= dynamic_threshold)
    SATURATION_PENALTIES = {
        "emerging": {
            "min": 0,
            "max": 24,
            "penalty": 0  # No penalty
        },
        "moderate": {
            "min": 25,
            "max": 49,
            "penalty_range": (-5, -10)
        },
        "high": {
            "min": 50,
            "max": 99,
            "penalty_range": (-15, -25)
        },
        "heavy": {
            "min": 100,
            "max": 199,
            "penalty_range": (-30, -40)
        },
        "severe": {
            "min": 200,
            "max": float('inf'),
            "penalty_range": (-45, -55)
        }
    }

    def __init__(self):
        """Initialize calculator."""
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

    async def count_similar_entries(
        self,
        similarity_list: List[Dict],
        similarity_threshold: float = 0.85
    ) -> int:
        """
        Count entries that meet similarity threshold.

        Args:
            similarity_list: List of similar entries with scores
            similarity_threshold: Minimum similarity score

        Returns:
            Count of similar entries
        """
        return sum(
            1 for item in similarity_list
            if item.get("similarity_score", 0) >= similarity_threshold
        )

    async def count_subject_samples(
        self,
        subject: str,
        exclude_session_id: Optional[str] = None
    ) -> int:
        """
        Count existing samples for a subject in database.

        Args:
            subject: Subject to count
            exclude_session_id: Session to exclude from count

        Returns:
            Number of samples
        """
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                if exclude_session_id:
                    count = await conn.fetchval(
                        """
                        SELECT COALESCE(SUM(sample_count), 0)
                        FROM verification_sessions
                        WHERE subject = $1
                        AND id != $2
                        AND status = 'completed'
                        """,
                        subject,
                        exclude_session_id
                    )
                else:
                    count = await conn.fetchval(
                        """
                        SELECT COALESCE(SUM(sample_count), 0)
                        FROM verification_sessions
                        WHERE subject = $1
                        AND status = 'completed'
                        """,
                        subject
                    )

                return count or 0

        except Exception as e:
            logger.error(f"Error counting subject samples: {e}")
            return 0

    def calculate_saturation_status(
        self,
        similar_count: int,
        dynamic_threshold: int
    ) -> Dict[str, Any]:
        """
        Calculate saturation status and penalty.

        Args:
            similar_count: Number of similar entries found
            dynamic_threshold: Dynamic threshold for this subject

        Returns:
            Saturation info with status and penalty
        """
        # Rule: Only apply penalties if similar_count >= dynamic_threshold
        if similar_count < dynamic_threshold:
            return {
                "status": "emerging",
                "similar_count": similar_count,
                "dynamic_threshold": dynamic_threshold,
                "penalty": 0,
                "penalty_applied": False,
                "message": f"Emerging category: {similar_count}/{dynamic_threshold} samples"
            }

        # Determine saturation level based on count
        penalty = 0
        status = "moderate"

        if similar_count < 50:
            status = "moderate"
            # Scale penalty from -5 to -10 within range 25-49
            penalty = -5 - int((similar_count - 25) / 25 * 5)
        elif similar_count < 100:
            status = "high"
            # Scale penalty from -15 to -25 within range 50-99
            penalty = -15 - int((similar_count - 50) / 50 * 10)
        elif similar_count < 200:
            status = "heavy"
            # Scale penalty from -30 to -40 within range 100-199
            penalty = -30 - int((similar_count - 100) / 100 * 10)
        else:
            status = "severe"
            # Fixed penalty -45 to -55 for 200+
            penalty = -50

        return {
            "status": status,
            "similar_count": similar_count,
            "dynamic_threshold": dynamic_threshold,
            "penalty": penalty,
            "penalty_applied": True,
            "message": f"{status.capitalize()} saturation: {similar_count} similar (threshold: {dynamic_threshold})"
        }

    async def check_first_bulk_contributor(
        self,
        subject: str
    ) -> bool:
        """
        Check if any bulk (100+) submission exists for this subject.

        Args:
            subject: Subject to check

        Returns:
            True if no bulk contributor yet, False if one exists
        """
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                bulk_count = await conn.fetchval(
                    """
                    SELECT COUNT(*)
                    FROM verification_sessions
                    WHERE subject = $1
                    AND sample_count >= 100
                    AND status = 'completed'
                    """,
                    subject
                )

                return (bulk_count or 0) == 0  # True if none exist yet

        except Exception as e:
            logger.error(f"Error checking bulk contributor: {e}")
            return False

    async def get_saturation_report(self, subject: str) -> Dict[str, Any]:
        """
        Get detailed saturation report for a subject.

        Args:
            subject: Subject to analyze

        Returns:
            Detailed saturation analysis
        """
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                # Get total sample count
                total_samples = await conn.fetchval(
                    """
                    SELECT COALESCE(SUM(sample_count), 0)
                    FROM verification_sessions
                    WHERE subject = $1
                    AND status = 'completed'
                    """,
                    subject
                )

                # Get unique submission count
                submissions = await conn.fetchval(
                    """
                    SELECT COUNT(DISTINCT id)
                    FROM verification_sessions
                    WHERE subject = $1
                    AND status = 'completed'
                    """,
                    subject
                )

                # Get first bulk contributor info
                first_bulk = await conn.fetchrow(
                    """
                    SELECT id, created_at, sample_count
                    FROM verification_sessions
                    WHERE subject = $1
                    AND sample_count >= 100
                    AND status = 'completed'
                    ORDER BY created_at ASC
                    LIMIT 1
                    """
                )

                # Get rarity info
                rarity_info = await conn.fetchrow(
                    """
                    SELECT rarity_tier, rarity_multiplier, dynamic_threshold
                    FROM subject_rarity_cache
                    WHERE subject = $1
                    """
                )

                return {
                    "subject": subject,
                    "total_samples": total_samples,
                    "submission_count": submissions,
                    "average_samples_per_submission": int(total_samples / submissions) if submissions else 0,
                    "first_bulk_contributor": {
                        "exists": bool(first_bulk),
                        "created_at": first_bulk["created_at"].isoformat() if first_bulk else None,
                        "sample_count": first_bulk["sample_count"] if first_bulk else 0
                    },
                    "rarity": {
                        "tier": rarity_info["rarity_tier"] if rarity_info else "Unknown",
                        "multiplier": float(rarity_info["rarity_multiplier"]) if rarity_info else 1.0,
                        "dynamic_threshold": rarity_info["dynamic_threshold"] if rarity_info else 25
                    },
                    "saturation_level": self._calculate_level(
                        total_samples,
                        rarity_info["dynamic_threshold"] if rarity_info else 25
                    )
                }

        except Exception as e:
            logger.error(f"Error getting saturation report: {e}")
            return {}

    def _calculate_level(self, count: int, threshold: int) -> str:
        """Calculate saturation level based on count vs threshold."""
        if count < threshold:
            return "emerging"
        elif count < threshold * 2:
            return "moderate"
        elif count < threshold * 4:
            return "high"
        elif count < threshold * 8:
            return "heavy"
        else:
            return "severe"

    async def get_saturation_leaderboard(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Get most saturated subjects."""
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                subjects = await conn.fetch(
                    """
                    SELECT subject, COUNT(*) as submission_count,
                           COALESCE(SUM(sample_count), 0) as total_samples,
                           (SELECT rarity_multiplier FROM subject_rarity_cache WHERE subject_rarity_cache.subject = verification_sessions.subject) as multiplier
                    FROM verification_sessions
                    WHERE status = 'completed' AND subject IS NOT NULL
                    GROUP BY subject
                    ORDER BY total_samples DESC
                    LIMIT $1
                    """,
                    limit
                )

                return [
                    {
                        "subject": s["subject"],
                        "submission_count": s["submission_count"],
                        "total_samples": s["total_samples"],
                        "rarity_multiplier": float(s["multiplier"]) if s["multiplier"] else 1.0
                    }
                    for s in subjects
                ]

        except Exception as e:
            logger.error(f"Error getting saturation leaderboard: {e}")
            return []

    async def close(self):
        """Close database connection."""
        if self._pool:
            await self._pool.close()
            self._pool = None


def create_saturation_calculator() -> SaturationCalculator:
    """Factory function to create calculator instance."""
    return SaturationCalculator()
