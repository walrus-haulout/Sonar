"""
User Management System for Leaderboard and Points Tracking.

Handles user creation, updates, tier calculations, and rank management.
"""

import logging
import os
import asyncpg
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
from decimal import Decimal

logger = logging.getLogger(__name__)


class UserManager:
    """Manages user accounts, points, and tier progression."""

    # Tier definitions and point thresholds
    TIERS = {
        "Legend": 100000,
        "Diamond": 50000,
        "Platinum": 25000,
        "Gold": 10000,
        "Silver": 5000,
        "Bronze": 1000,
        "Contributor": 0
    }

    def __init__(self):
        """Initialize user manager."""
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

    async def _get_tier(self, total_points: int) -> str:
        """Determine tier based on total points."""
        for tier, threshold in self.TIERS.items():
            if total_points >= threshold:
                return tier
        return "Contributor"

    async def get_or_create_user(
        self,
        wallet_address: str,
        username: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get existing user or create new one.

        Args:
            wallet_address: Wallet address (0x...)
            username: Optional username

        Returns:
            User data dict
        """
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                # Try to get existing user
                user = await conn.fetchrow(
                    "SELECT * FROM users WHERE wallet_address = $1",
                    wallet_address
                )

                if user:
                    return self._format_user(user)

                # Create new user
                now = datetime.now(timezone.utc)
                await conn.execute(
                    """
                    INSERT INTO users
                    (wallet_address, username, total_points, total_submissions,
                     average_rarity_score, tier, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    """,
                    wallet_address,
                    username or f"User_{wallet_address[:8]}",
                    0,  # total_points
                    0,  # total_submissions
                    0.0,  # average_rarity_score
                    "Contributor",  # tier
                    now,
                    now
                )

                logger.info(f"Created new user: {wallet_address[:8]}...")
                return {
                    "wallet_address": wallet_address,
                    "username": username or f"User_{wallet_address[:8]}",
                    "total_points": 0,
                    "total_submissions": 0,
                    "average_rarity_score": 0.0,
                    "tier": "Contributor",
                    "rank": None,
                    "first_bulk_contributions": 0,
                    "rare_subject_contributions": 0
                }

        except Exception as e:
            logger.error(f"Error getting/creating user: {e}", exc_info=True)
            raise

    async def add_points(
        self,
        wallet_address: str,
        points: int,
        rarity_score: int,
        sample_count: int = 1,
        is_first_bulk: bool = False,
        subject_rarity_tier: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Add points to user and update stats.

        Args:
            wallet_address: User's wallet
            points: Points to add
            rarity_score: Rarity score (0-100)
            sample_count: Number of samples submitted
            is_first_bulk: Whether this is first bulk contribution
            subject_rarity_tier: Rarity tier of subject

        Returns:
            Updated user data
        """
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                # Get current user stats
                user = await conn.fetchrow(
                    """
                    SELECT total_points, total_submissions, average_rarity_score,
                           first_bulk_contributions, rare_subject_contributions
                    FROM users
                    WHERE wallet_address = $1
                    """,
                    wallet_address
                )

                if not user:
                    # Create user first
                    await self.get_or_create_user(wallet_address)
                    user = await conn.fetchrow(
                        """
                        SELECT total_points, total_submissions, average_rarity_score,
                               first_bulk_contributions, rare_subject_contributions
                        FROM users
                        WHERE wallet_address = $1
                        """,
                        wallet_address
                    )

                # Calculate new stats
                old_total_points = user["total_points"]
                old_submissions = user["total_submissions"]
                old_avg_score = user["average_rarity_score"] or 0.0

                new_total_points = old_total_points + points
                new_submissions = old_submissions + 1

                # Update average rarity score
                new_avg_score = (
                    (old_avg_score * old_submissions + rarity_score) / new_submissions
                    if new_submissions > 0
                    else rarity_score
                )

                # Increment first bulk counter
                new_first_bulk = user["first_bulk_contributions"]
                if is_first_bulk:
                    new_first_bulk += 1

                # Increment rare subject counter
                new_rare_subjects = user["rare_subject_contributions"]
                if subject_rarity_tier in ["Critical", "High"]:
                    new_rare_subjects += 1

                # Determine new tier
                new_tier = await self._get_tier(new_total_points)

                # Update user
                now = datetime.now(timezone.utc)
                await conn.execute(
                    """
                    UPDATE users
                    SET total_points = $1,
                        total_submissions = $2,
                        average_rarity_score = $3,
                        tier = $4,
                        first_bulk_contributions = $5,
                        rare_subject_contributions = $6,
                        updated_at = $7
                    WHERE wallet_address = $8
                    """,
                    new_total_points,
                    new_submissions,
                    new_avg_score,
                    new_tier,
                    new_first_bulk,
                    new_rare_subjects,
                    now,
                    wallet_address
                )

                logger.info(
                    f"Added {points} points to {wallet_address[:8]}... "
                    f"(total: {new_total_points}, tier: {new_tier})"
                )

                return {
                    "wallet_address": wallet_address,
                    "total_points": new_total_points,
                    "points_added": points,
                    "total_submissions": new_submissions,
                    "average_rarity_score": float(new_avg_score),
                    "tier": new_tier,
                    "tier_changed": user["total_points"] < 10000 and new_total_points >= 10000,
                    "first_bulk_contributions": new_first_bulk,
                    "rare_subject_contributions": new_rare_subjects
                }

        except Exception as e:
            logger.error(f"Error adding points: {e}", exc_info=True)
            raise

    async def get_user_rank(self, wallet_address: str) -> int:
        """Get current rank for user."""
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                result = await conn.fetchval(
                    """
                    SELECT COUNT(*) + 1
                    FROM users
                    WHERE total_points > (
                        SELECT total_points FROM users WHERE wallet_address = $1
                    )
                    """,
                    wallet_address
                )
                return result or 0

        except Exception as e:
            logger.error(f"Error getting user rank: {e}", exc_info=True)
            return 0

    async def update_all_ranks(self):
        """Update rank field for all users (call periodically)."""
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                # Get all users ordered by points
                users = await conn.fetch(
                    "SELECT wallet_address FROM users ORDER BY total_points DESC"
                )

                # Update rank for each user
                for idx, user in enumerate(users, 1):
                    await conn.execute(
                        "UPDATE users SET rank = $1 WHERE wallet_address = $2",
                        idx,
                        user["wallet_address"]
                    )

                logger.info(f"Updated ranks for {len(users)} users")

        except Exception as e:
            logger.error(f"Error updating ranks: {e}", exc_info=True)
            raise

    async def get_leaderboard(
        self,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """Get top users for leaderboard."""
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                users = await conn.fetch(
                    """
                    SELECT wallet_address, username, total_points, total_submissions,
                           average_rarity_score, tier, rank, first_bulk_contributions,
                           rare_subject_contributions
                    FROM users
                    ORDER BY total_points DESC
                    LIMIT $1 OFFSET $2
                    """,
                    limit,
                    offset
                )

                return [self._format_user(u) for u in users]

        except Exception as e:
            logger.error(f"Error getting leaderboard: {e}", exc_info=True)
            return []

    async def get_user_by_wallet(self, wallet_address: str) -> Optional[Dict[str, Any]]:
        """Get user by wallet address."""
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                user = await conn.fetchrow(
                    "SELECT * FROM users WHERE wallet_address = $1",
                    wallet_address
                )
                return self._format_user(user) if user else None

        except Exception as e:
            logger.error(f"Error getting user: {e}", exc_info=True)
            return None

    def _format_user(self, user: asyncpg.Record) -> Dict[str, Any]:
        """Format user record as dict."""
        return {
            "wallet_address": user["wallet_address"],
            "username": user["username"],
            "total_points": user["total_points"],
            "total_submissions": user["total_submissions"],
            "average_rarity_score": float(user["average_rarity_score"]) if user["average_rarity_score"] else 0.0,
            "tier": user["tier"],
            "rank": user["rank"],
            "first_bulk_contributions": user["first_bulk_contributions"],
            "rare_subject_contributions": user["rare_subject_contributions"]
        }

    async def close(self):
        """Close database connection."""
        if self._pool:
            await self._pool.close()
            self._pool = None
