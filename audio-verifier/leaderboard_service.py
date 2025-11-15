"""
Leaderboard Service for Managing Rankings and Snapshots.

Handles leaderboard rankings, daily snapshots, and tier progression tracking.
"""

import logging
import os
import asyncpg
from typing import Dict, Any, List, Optional
from datetime import datetime, date, timezone

logger = logging.getLogger(__name__)


class LeaderboardService:
    """Manages leaderboard rankings and snapshots."""

    def __init__(self):
        """Initialize leaderboard service."""
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

    async def get_global_leaderboard(
        self,
        limit: int = 100,
        offset: int = 0,
        tier: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get global leaderboard.

        Args:
            limit: Number of results
            offset: Pagination offset
            tier: Optional filter by tier

        Returns:
            List of users with ranking
        """
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                if tier:
                    users = await conn.fetch(
                        """
                        SELECT ROW_NUMBER() OVER (ORDER BY total_points DESC) as rank,
                               wallet_address, username, total_points, total_submissions,
                               average_rarity_score, tier, first_bulk_contributions,
                               rare_subject_contributions
                        FROM users
                        WHERE tier = $1
                        ORDER BY total_points DESC
                        LIMIT $2 OFFSET $3
                        """,
                        tier,
                        limit,
                        offset
                    )
                else:
                    users = await conn.fetch(
                        """
                        SELECT ROW_NUMBER() OVER (ORDER BY total_points DESC) as rank,
                               wallet_address, username, total_points, total_submissions,
                               average_rarity_score, tier, first_bulk_contributions,
                               rare_subject_contributions
                        FROM users
                        ORDER BY total_points DESC
                        LIMIT $1 OFFSET $2
                        """,
                        limit,
                        offset
                    )

                return [self._format_leaderboard_entry(u) for u in users]

        except Exception as e:
            logger.error(f"Error getting leaderboard: {e}", exc_info=True)
            return []

    async def get_user_rank_info(self, wallet_address: str) -> Optional[Dict[str, Any]]:
        """
        Get user's ranking information.

        Args:
            wallet_address: User's wallet

        Returns:
            User's rank data
        """
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                result = await conn.fetchrow(
                    """
                    SELECT ROW_NUMBER() OVER (ORDER BY total_points DESC) as rank,
                           wallet_address, username, total_points, total_submissions,
                           average_rarity_score, tier, first_bulk_contributions,
                           rare_subject_contributions
                    FROM users
                    WHERE wallet_address = $1
                    """,
                    wallet_address
                )

                if not result:
                    return None

                # Get tier progress info
                tier_info = await self._get_tier_progress(wallet_address, conn)

                return {
                    **self._format_leaderboard_entry(result),
                    "tier_progress": tier_info
                }

        except Exception as e:
            logger.error(f"Error getting user rank: {e}", exc_info=True)
            return None

    async def _get_tier_progress(
        self,
        wallet_address: str,
        conn: asyncpg.Connection
    ) -> Dict[str, Any]:
        """Get tier progression info for user."""
        user = await conn.fetchrow(
            "SELECT total_points, tier FROM users WHERE wallet_address = $1",
            wallet_address
        )

        if not user:
            return {}

        tiers = [
            ("Legend", 100000),
            ("Diamond", 50000),
            ("Platinum", 25000),
            ("Gold", 10000),
            ("Silver", 5000),
            ("Bronze", 1000),
            ("Contributor", 0)
        ]

        current_points = user["total_points"]
        current_tier = user["tier"]

        # Find current and next tier
        tier_idx = next((i for i, (t, _) in enumerate(tiers) if t == current_tier), None)
        next_tier_idx = tier_idx - 1 if tier_idx is not None and tier_idx > 0 else None

        if next_tier_idx is None:
            return {
                "current_tier": current_tier,
                "next_tier": None,
                "points_needed": 0,
                "progress_percent": 100
            }

        next_tier_name, next_threshold = tiers[next_tier_idx]
        points_needed = next_threshold - current_points

        # Get current tier threshold
        current_threshold = next((t for n, t in tiers if n == current_tier), 0)

        progress_percent = 0
        if points_needed > 0 and current_threshold < next_threshold:
            progress_percent = min(
                100,
                int(((current_points - current_threshold) / (next_threshold - current_threshold)) * 100)
            )

        return {
            "current_tier": current_tier,
            "next_tier": next_tier_name,
            "points_needed": max(0, points_needed),
            "progress_percent": progress_percent
        }

    async def create_snapshot(self) -> bool:
        """
        Create daily leaderboard snapshot.

        Returns:
            True if successful
        """
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                snapshot_date = date.today()

                # Get all users ranked
                users = await conn.fetch(
                    """
                    SELECT ROW_NUMBER() OVER (ORDER BY total_points DESC) as rank,
                           wallet_address, total_points, tier, total_submissions
                    FROM users
                    ORDER BY total_points DESC
                    """
                )

                # Insert snapshot entries
                for user in users:
                    await conn.execute(
                        """
                        INSERT INTO leaderboard_snapshot
                        (wallet_address, rank, total_points, tier, total_submissions, snapshot_date)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT (wallet_address, snapshot_date) DO UPDATE
                        SET rank = $2, total_points = $3, tier = $4, total_submissions = $5
                        """,
                        user["wallet_address"],
                        user["rank"],
                        user["total_points"],
                        user["tier"],
                        user["total_submissions"],
                        snapshot_date
                    )

                logger.info(f"Created leaderboard snapshot for {snapshot_date} ({len(users)} users)")
                return True

        except Exception as e:
            logger.error(f"Error creating snapshot: {e}", exc_info=True)
            return False

    async def get_leaderboard_history(
        self,
        wallet_address: str,
        days: int = 30
    ) -> List[Dict[str, Any]]:
        """
        Get leaderboard history for user over N days.

        Args:
            wallet_address: User's wallet
            days: Number of days to fetch

        Returns:
            List of daily snapshots
        """
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                snapshots = await conn.fetch(
                    """
                    SELECT rank, total_points, tier, total_submissions, snapshot_date
                    FROM leaderboard_snapshot
                    WHERE wallet_address = $1
                    AND snapshot_date >= NOW()::date - $2::int
                    ORDER BY snapshot_date DESC
                    """,
                    wallet_address,
                    days
                )

                return [
                    {
                        "date": s["snapshot_date"].isoformat(),
                        "rank": s["rank"],
                        "points": s["total_points"],
                        "tier": s["tier"],
                        "submissions": s["total_submissions"]
                    }
                    for s in snapshots
                ]

        except Exception as e:
            logger.error(f"Error getting history: {e}", exc_info=True)
            return []

    async def get_leaderboard_at_date(
        self,
        snapshot_date: date,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get leaderboard state at specific date."""
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                users = await conn.fetch(
                    """
                    SELECT rank, wallet_address, total_points, tier, total_submissions, snapshot_date
                    FROM leaderboard_snapshot
                    WHERE snapshot_date = $1
                    ORDER BY rank
                    LIMIT $2
                    """,
                    snapshot_date,
                    limit
                )

                return [
                    {
                        "rank": u["rank"],
                        "wallet_address": u["wallet_address"],
                        "points": u["total_points"],
                        "tier": u["tier"],
                        "submissions": u["total_submissions"],
                        "date": u["snapshot_date"].isoformat()
                    }
                    for u in users
                ]

        except Exception as e:
            logger.error(f"Error getting date snapshot: {e}", exc_info=True)
            return []

    async def get_tier_distribution(self) -> Dict[str, int]:
        """Get distribution of users across tiers."""
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                tiers = await conn.fetch(
                    "SELECT tier, COUNT(*) as count FROM users GROUP BY tier ORDER BY tier"
                )

                return {t["tier"]: t["count"] for t in tiers}

        except Exception as e:
            logger.error(f"Error getting tier distribution: {e}", exc_info=True)
            return {}

    async def search_users(
        self,
        query: str,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """
        Search users by wallet or username.

        Args:
            query: Search query (wallet address or username)
            limit: Result limit

        Returns:
            List of matching users
        """
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                # Search by wallet or username
                users = await conn.fetch(
                    """
                    SELECT ROW_NUMBER() OVER (ORDER BY total_points DESC) as rank,
                           wallet_address, username, total_points, tier, total_submissions
                    FROM users
                    WHERE wallet_address ILIKE $1
                    OR username ILIKE $1
                    LIMIT $2
                    """,
                    f"%{query}%",
                    limit
                )

                return [self._format_leaderboard_entry(u) for u in users]

        except Exception as e:
            logger.error(f"Error searching users: {e}", exc_info=True)
            return []

    def _format_leaderboard_entry(self, user: asyncpg.Record) -> Dict[str, Any]:
        """Format user record for leaderboard."""
        return {
            "rank": user.get("rank"),
            "wallet_address": user["wallet_address"],
            "username": user["username"],
            "total_points": user["total_points"],
            "total_submissions": user["total_submissions"],
            "average_rarity_score": float(user["average_rarity_score"]) if user.get("average_rarity_score") else 0.0,
            "tier": user["tier"],
            "first_bulk_contributions": user.get("first_bulk_contributions", 0),
            "rare_subject_contributions": user.get("rare_subject_contributions", 0)
        }

    async def close(self):
        """Close database connection."""
        if self._pool:
            await self._pool.close()
            self._pool = None


def create_leaderboard_service() -> LeaderboardService:
    """Factory function to create service instance."""
    return LeaderboardService()
