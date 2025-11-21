"""
Achievements and Badges System.

Tracks user achievements and unlocks badges based on milestones.
"""

import logging
import os
import asyncpg
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class AchievementsTracker:
    """Manages achievements and badges for users."""

    # Define all possible achievements
    ACHIEVEMENTS = {
        "first_blood": {
            "name": "First Blood",
            "description": "Submit your first audio dataset",
            "icon": "🩸",
            "category": "milestones"
        },
        "bulk_pioneer": {
            "name": "Bulk Pioneer",
            "description": "Be the first bulk contributor (100+ samples) for a subject",
            "icon": "🚀",
            "category": "contributor"
        },
        "rare_hunter_x10": {
            "name": "Rare Hunter I",
            "description": "Submit 10 critical/high rarity datasets",
            "icon": "🦅",
            "category": "rarity"
        },
        "rare_hunter_x50": {
            "name": "Rare Hunter II",
            "description": "Submit 50 critical/high rarity datasets",
            "icon": "🦉",
            "category": "rarity"
        },
        "quality_master": {
            "name": "Quality Master",
            "description": "Achieve average rarity score > 80",
            "icon": "⭐",
            "category": "quality"
        },
        "quality_legend": {
            "name": "Quality Legend",
            "description": "Achieve average rarity score > 90",
            "icon": "✨",
            "category": "quality"
        },
        "diamond_hands": {
            "name": "Diamond Hands",
            "description": "Reach Diamond tier (50,000+ points)",
            "icon": "💎",
            "category": "tier"
        },
        "legend_status": {
            "name": "Legend Status",
            "description": "Reach Legend tier (100,000+ points)",
            "icon": "👑",
            "category": "tier"
        },
        "early_adopter": {
            "name": "Early Adopter",
            "description": "Be among the first 100 contributors",
            "icon": "🌟",
            "category": "timing"
        },
        "diversity_king": {
            "name": "Diversity King",
            "description": "Submit datasets from 20+ different subjects/categories",
            "icon": "🎨",
            "category": "diversity"
        },
        "perfectionist": {
            "name": "Perfectionist",
            "description": "Get Grade A specificity on 5 submissions",
            "icon": "🎯",
            "category": "quality"
        },
        "bulk_master": {
            "name": "Bulk Master",
            "description": "Be first bulk contributor for 5+ different subjects",
            "icon": "📦",
            "category": "contributor"
        },
        "10_submissions": {
            "name": "Content Creator",
            "description": "Submit 10 datasets",
            "icon": "📝",
            "category": "milestones"
        },
        "50_submissions": {
            "name": "Prolific Creator",
            "description": "Submit 50 datasets",
            "icon": "📚",
            "category": "milestones"
        },
        "100_submissions": {
            "name": "Master Creator",
            "description": "Submit 100 datasets",
            "icon": "🏆",
            "category": "milestones"
        },
        "10k_points": {
            "name": "Point Collector",
            "description": "Earn 10,000 points",
            "icon": "💰",
            "category": "points"
        },
        "50k_points": {
            "name": "Point Magnate",
            "description": "Earn 50,000 points",
            "icon": "💵",
            "category": "points"
        },
        "100k_points": {
            "name": "Point Emperor",
            "description": "Earn 100,000 points",
            "icon": "👸",
            "category": "points"
        },
        "verified_contributor": {
            "name": "Verified Contributor",
            "description": "Have all claims verified in 5+ submissions",
            "icon": "✅",
            "category": "quality"
        },
        "consistent_contributor": {
            "name": "Consistent Contributor",
            "description": "Make submissions on 30+ different days",
            "icon": "📅",
            "category": "consistency"
        }
    }

    def __init__(self):
        """Initialize achievements tracker."""
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

    async def check_and_unlock_achievements(
        self,
        wallet_address: str,
        trigger: str = "submission"
    ) -> List[Dict[str, Any]]:
        """
        Check if user qualifies for any achievements.

        Args:
            wallet_address: User's wallet
            trigger: Event that triggered check (submission, tier_change, etc.)

        Returns:
            List of newly unlocked achievements
        """
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                unlocked = []

                # Get user data
                user = await conn.fetchrow(
                    """
                    SELECT total_submissions, total_points, tier,
                           average_rarity_score, first_bulk_contributions,
                           rare_subject_contributions, created_at
                    FROM users
                    WHERE wallet_address = $1
                    """,
                    wallet_address
                )

                if not user:
                    return []

                # Check each achievement
                for achievement_key, achievement_data in self.ACHIEVEMENTS.items():
                    # Check if already unlocked
                    already_unlocked = await conn.fetchval(
                        """
                        SELECT COUNT(*) FROM user_achievements
                        WHERE wallet_address = $1 AND achievement_key = $2
                        """,
                        wallet_address,
                        achievement_key
                    )

                    if already_unlocked:
                        continue

                    # Check eligibility
                    is_eligible = await self._check_achievement_eligibility(
                        achievement_key,
                        wallet_address,
                        user,
                        conn
                    )

                    if is_eligible:
                        # Unlock achievement
                        await conn.execute(
                            """
                            INSERT INTO user_achievements
                            (wallet_address, achievement_key, achievement_name,
                             achievement_description, badge_icon, unlocked_at)
                            VALUES ($1, $2, $3, $4, $5, $6)
                            """,
                            wallet_address,
                            achievement_key,
                            achievement_data["name"],
                            achievement_data["description"],
                            achievement_data["icon"],
                            datetime.now(timezone.utc)
                        )

                        logger.info(
                            f"Unlocked achievement '{achievement_data['name']}' "
                            f"for {wallet_address[:8]}..."
                        )

                        unlocked.append({
                            "key": achievement_key,
                            "name": achievement_data["name"],
                            "description": achievement_data["description"],
                            "icon": achievement_data["icon"],
                            "category": achievement_data["category"]
                        })

                return unlocked

        except Exception as e:
            logger.error(f"Error checking achievements: {e}", exc_info=True)
            return []

    async def _check_achievement_eligibility(
        self,
        achievement_key: str,
        wallet_address: str,
        user: asyncpg.Record,
        conn: asyncpg.Connection
    ) -> bool:
        """Check if user is eligible for a specific achievement."""
        submissions = user["total_submissions"]
        points = user["total_points"]
        tier = user["tier"]
        avg_score = user["average_rarity_score"] or 0
        first_bulk = user["first_bulk_contributions"]
        rare_subjects = user["rare_subject_contributions"]

        if achievement_key == "first_blood":
            return submissions >= 1

        elif achievement_key == "bulk_pioneer":
            return first_bulk >= 1

        elif achievement_key == "rare_hunter_x10":
            return rare_subjects >= 10

        elif achievement_key == "rare_hunter_x50":
            return rare_subjects >= 50

        elif achievement_key == "quality_master":
            return avg_score > 80

        elif achievement_key == "quality_legend":
            return avg_score > 90

        elif achievement_key == "diamond_hands":
            return tier in ["Diamond", "Legend"]

        elif achievement_key == "legend_status":
            return tier == "Legend"

        elif achievement_key == "early_adopter":
            # Check if among first 100 contributors
            rank = await conn.fetchval(
                """
                SELECT COUNT(*) + 1
                FROM users
                WHERE created_at < (SELECT created_at FROM users WHERE wallet_address = $1)
                """,
                wallet_address
            )
            return bool(rank and rank <= 100)

        elif achievement_key == "diversity_king":
            diversity = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT subject)
                FROM user_submissions
                WHERE wallet_address = $1
                """,
                wallet_address
            )
            return bool(diversity and diversity >= 20)

        elif achievement_key == "perfectionist":
            grade_a_count = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM user_submissions
                WHERE wallet_address = $1
                AND specificity_grade = 'A'
                """,
                wallet_address
            )
            return bool(grade_a_count and grade_a_count >= 5)

        elif achievement_key == "bulk_master":
            return first_bulk >= 5

        elif achievement_key == "10_submissions":
            return submissions >= 10

        elif achievement_key == "50_submissions":
            return submissions >= 50

        elif achievement_key == "100_submissions":
            return submissions >= 100

        elif achievement_key == "10k_points":
            return points >= 10000

        elif achievement_key == "50k_points":
            return points >= 50000

        elif achievement_key == "100k_points":
            return points >= 100000

        elif achievement_key == "verified_contributor":
            verified_count = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM user_submissions
                WHERE wallet_address = $1
                AND verification_multiplier = 1.2
                """,
                wallet_address
            )
            return bool(verified_count and verified_count >= 5)

        elif achievement_key == "consistent_contributor":
            days = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT DATE(submitted_at))
                FROM user_submissions
                WHERE wallet_address = $1
                """,
                wallet_address
            )
            return bool(days and days >= 30)

        return False

    async def get_user_achievements(self, wallet_address: str) -> List[Dict[str, Any]]:
        """Get all achievements for a user."""
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                achievements = await conn.fetch(
                    """
                    SELECT achievement_key, achievement_name, achievement_description,
                           badge_icon, unlocked_at
                    FROM user_achievements
                    WHERE wallet_address = $1
                    ORDER BY unlocked_at DESC
                    """,
                    wallet_address
                )

                return [
                    {
                        "key": a["achievement_key"],
                        "name": a["achievement_name"],
                        "description": a["achievement_description"],
                        "icon": a["badge_icon"],
                        "unlocked_at": a["unlocked_at"].isoformat() if a["unlocked_at"] else None,
                        "category": self.ACHIEVEMENTS[a["achievement_key"]]["category"]
                    }
                    for a in achievements
                ]

        except Exception as e:
            logger.error(f"Error getting achievements: {e}", exc_info=True)
            return []

    async def get_achievement_stats(self, wallet_address: str) -> Dict[str, Any]:
        """Get achievement statistics for user."""
        try:
            achievements = await self.get_user_achievements(wallet_address)

            categories = {}
            for achievement in achievements:
                category = achievement["category"]
                if category not in categories:
                    categories[category] = 0
                categories[category] += 1

            return {
                "total_unlocked": len(achievements),
                "total_possible": len(self.ACHIEVEMENTS),
                "completion_percent": int((len(achievements) / len(self.ACHIEVEMENTS)) * 100),
                "by_category": categories,
                "achievements": achievements
            }

        except Exception as e:
            logger.error(f"Error getting stats: {e}", exc_info=True)
            return {}

    async def close(self):
        """Close database connection."""
        if self._pool:
            await self._pool.close()
            self._pool = None


def create_achievements_tracker() -> AchievementsTracker:
    """Factory function to create tracker instance."""
    return AchievementsTracker()
