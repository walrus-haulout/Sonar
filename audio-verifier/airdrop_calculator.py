"""
Airdrop Eligibility Calculator.

Calculates user eligibility for airdrops based on multiple factors.
Allocation percentages are determined by weighted scoring.
"""

import logging
import os
import asyncpg
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from decimal import Decimal

logger = logging.getLogger(__name__)


class AirdropCalculator:
    """Calculate airdrop eligibility and allocation percentages."""

    # Eligibility scoring weights
    WEIGHT_TOTAL_POINTS = Decimal("0.50")      # 50%
    WEIGHT_SUBMISSION_DIVERSITY = Decimal("0.20")  # 20%
    WEIGHT_FIRST_BULK = Decimal("0.15")        # 15%
    WEIGHT_RARE_SUBJECTS = Decimal("0.10")     # 10%
    WEIGHT_CONSISTENCY = Decimal("0.05")       # 5%

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

    async def calculate_eligibility(self, wallet_address: str) -> Dict[str, Any]:
        """
        Calculate airdrop eligibility for a user.

        Args:
            wallet_address: User's wallet address

        Returns:
            Eligibility data
        """
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                # Get user stats
                user = await conn.fetchrow(
                    """
                    SELECT total_points, total_submissions, tier,
                           first_bulk_contributions, rare_subject_contributions
                    FROM users
                    WHERE wallet_address = $1
                    """,
                    wallet_address
                )

                if not user:
                    return {
                        "wallet_address": wallet_address,
                        "eligible": False,
                        "eligibility_score": 0,
                        "allocation_percentage": 0,
                        "reason": "User not found"
                    }

                # Calculate component scores
                points_score = await self._calculate_points_score(
                    user["total_points"], conn
                )
                diversity_score = await self._calculate_diversity_score(
                    wallet_address, conn
                )
                first_bulk_score = await self._calculate_first_bulk_score(
                    user["first_bulk_contributions"]
                )
                rare_subjects_score = await self._calculate_rare_subjects_score(
                    user["rare_subject_contributions"]
                )
                consistency_score = await self._calculate_consistency_score(
                    wallet_address, conn
                )

                # Calculate weighted eligibility score
                eligibility_score = (
                    float(self.WEIGHT_TOTAL_POINTS) * points_score +
                    float(self.WEIGHT_SUBMISSION_DIVERSITY) * diversity_score +
                    float(self.WEIGHT_FIRST_BULK) * first_bulk_score +
                    float(self.WEIGHT_RARE_SUBJECTS) * rare_subjects_score +
                    float(self.WEIGHT_CONSISTENCY) * consistency_score
                )

                # Determine eligibility (minimum 10% of max possible score)
                max_possible_score = float(
                    self.WEIGHT_TOTAL_POINTS +
                    self.WEIGHT_SUBMISSION_DIVERSITY +
                    self.WEIGHT_FIRST_BULK +
                    self.WEIGHT_RARE_SUBJECTS +
                    self.WEIGHT_CONSISTENCY
                )
                min_eligibility = max_possible_score * 0.1

                is_eligible = eligibility_score >= min_eligibility
                reason = "Meets eligibility criteria" if is_eligible else "Score below minimum threshold"

                return {
                    "wallet_address": wallet_address,
                    "eligible": is_eligible,
                    "eligibility_score": round(eligibility_score, 2),
                    "max_possible_score": round(max_possible_score, 2),
                    "allocation_percentage": 0,  # Set during batch calculation
                    "reason": reason,
                    "component_scores": {
                        "total_points": round(points_score, 2),
                        "submission_diversity": round(diversity_score, 2),
                        "first_bulk_contributions": round(first_bulk_score, 2),
                        "rare_subjects": round(rare_subjects_score, 2),
                        "consistency": round(consistency_score, 2)
                    },
                    "weights": {
                        "total_points": float(self.WEIGHT_TOTAL_POINTS),
                        "submission_diversity": float(self.WEIGHT_SUBMISSION_DIVERSITY),
                        "first_bulk": float(self.WEIGHT_FIRST_BULK),
                        "rare_subjects": float(self.WEIGHT_RARE_SUBJECTS),
                        "consistency": float(self.WEIGHT_CONSISTENCY)
                    }
                }

        except Exception as e:
            logger.error(f"Error calculating eligibility: {e}", exc_info=True)
            return {
                "wallet_address": wallet_address,
                "eligible": False,
                "eligibility_score": 0,
                "allocation_percentage": 0,
                "reason": f"Calculation error: {str(e)}"
            }

    async def _calculate_points_score(
        self,
        total_points: int,
        conn: asyncpg.Connection
    ) -> float:
        """
        Calculate score based on total points (0-1 scale).

        Higher points = higher score, normalized to max points in database.
        """
        # Get max points in database
        max_points = await conn.fetchval(
            "SELECT COALESCE(MAX(total_points), 1) FROM users"
        )

        if max_points is None or max_points == 0:
            return 0.0

        score = min(1.0, total_points / int(max_points))
        return score

    async def _calculate_diversity_score(
        self,
        wallet_address: str,
        conn: asyncpg.Connection
    ) -> float:
        """
        Calculate score based on submission diversity.

        Considers number of unique subjects/categories submitted.
        """
        unique_subjects = await conn.fetchval(
            """
            SELECT COUNT(DISTINCT subject)
            FROM user_submissions
            WHERE wallet_address = $1
            """,
            wallet_address
        )

        if not unique_subjects:
            return 0.0

        # Normalize: aim for diversity across many subjects
        # Max benefit at 20+ unique subjects
        score = min(1.0, unique_subjects / 20)
        return score

    async def _calculate_first_bulk_score(
        self,
        first_bulk_contributions: int
    ) -> float:
        """
        Calculate score based on first bulk contributions.

        Rewards pioneering in new categories (100+ sample first submissions).
        """
        # Scale: each first bulk worth 0.2 points, max 1.0
        score = min(1.0, first_bulk_contributions / 5 * 1.0)
        return score

    async def _calculate_rare_subjects_score(
        self,
        rare_subject_contributions: int
    ) -> float:
        """
        Calculate score based on rare subject contributions.

        Rewards submissions of critical/high rarity subjects.
        """
        # Scale: each rare subject worth 0.1 points, max 1.0
        score = min(1.0, rare_subject_contributions / 10 * 1.0)
        return score

    async def _calculate_consistency_score(
        self,
        wallet_address: str,
        conn: asyncpg.Connection
    ) -> float:
        """
        Calculate score based on contribution consistency over time.

        Regular submissions = higher score than single large dump.
        """
        # Get submission dates
        dates = await conn.fetch(
            """
            SELECT DATE(submitted_at) as date, COUNT(*) as count
            FROM user_submissions
            WHERE wallet_address = $1
            GROUP BY DATE(submitted_at)
            ORDER BY date
            """,
            wallet_address
        )

        if not dates or len(dates) < 2:
            # Less than 2 days of submissions = low consistency
            return 0.2

        if len(dates) >= 30:
            # 30+ days of activity = perfect consistency
            return 1.0

        # Linear scale: 2 days = 0.2, 30 days = 1.0
        score = min(1.0, (len(dates) - 2) / 28 + 0.2)
        return score

    async def calculate_all_eligibility(self) -> Dict[str, Any]:
        """
        Calculate eligibility for all users and set allocation percentages.

        This is the main batch calculation for airdrop distribution.

        Returns:
            Summary of airdrop allocation
        """
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                # Get all users
                users = await conn.fetch("SELECT wallet_address FROM users")

                if not users:
                    return {
                        "total_eligible_users": 0,
                        "total_allocation": 100.0,
                        "average_allocation": 0.0,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }

                # Calculate eligibility for each user
                eligibilities = []
                for user in users:
                    eligibility = await self.calculate_eligibility(user["wallet_address"])
                    if eligibility["eligible"]:
                        eligibilities.append({
                            "wallet_address": user["wallet_address"],
                            "eligibility_score": eligibility["eligibility_score"]
                        })

                if not eligibilities:
                    logger.warning("No eligible users found for airdrop")
                    return {
                        "total_eligible_users": 0,
                        "total_allocation": 0.0,
                        "average_allocation": 0.0,
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }

                # Calculate total eligibility score
                total_score = sum(e["eligibility_score"] for e in eligibilities)

                # Calculate allocation percentages
                now = datetime.now(timezone.utc)
                for eligibility in eligibilities:
                    allocation_percent = (
                        (eligibility["eligibility_score"] / total_score * 100)
                        if total_score > 0
                        else 0
                    )

                    # Update airdrop_eligibility table
                    user_data = await conn.fetchrow(
                        """
                        SELECT total_points, total_submissions, tier,
                               first_bulk_contributions, rare_subject_contributions
                        FROM users
                        WHERE wallet_address = $1
                        """,
                        eligibility["wallet_address"]
                    )

                    if user_data:
                        diversity = await conn.fetchval(
                            """
                            SELECT COUNT(DISTINCT subject)
                            FROM user_submissions
                            WHERE wallet_address = $1
                            """,
                            eligibility["wallet_address"]
                        )

                        await conn.execute(
                            """
                            INSERT INTO airdrop_eligibility
                            (wallet_address, total_points, tier, submissions_count,
                             first_bulk_count, rare_subjects_count, subject_diversity,
                             eligibility_score, allocation_percentage, last_calculated)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                            ON CONFLICT (wallet_address) DO UPDATE
                            SET total_points = $2,
                                tier = $3,
                                submissions_count = $4,
                                first_bulk_count = $5,
                                rare_subjects_count = $6,
                                subject_diversity = $7,
                                eligibility_score = $8,
                                allocation_percentage = $9,
                                last_calculated = $10
                            """,
                            eligibility["wallet_address"],
                            user_data["total_points"],
                            user_data["tier"],
                            user_data["total_submissions"],
                            user_data["first_bulk_contributions"],
                            user_data["rare_subject_contributions"],
                            diversity or 0,
                            eligibility["eligibility_score"],
                            allocation_percent,
                            now
                        )

                logger.info(
                    f"Calculated airdrop eligibility for {len(eligibilities)} users "
                    f"(total score: {total_score:.2f})"
                )

                return {
                    "total_eligible_users": len(eligibilities),
                    "total_allocation": 100.0,
                    "average_allocation": 100.0 / len(eligibilities) if eligibilities else 0,
                    "total_score": total_score,
                    "timestamp": now.isoformat()
                }

        except Exception as e:
            logger.error(f"Error calculating all eligibility: {e}", exc_info=True)
            raise

    async def get_airdrop_snapshot(self) -> Optional[Dict[str, Any]]:
        """Get current airdrop eligibility snapshot."""
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                # Get top 100 eligible users
                users = await conn.fetch(
                    """
                    SELECT wallet_address, tier, total_points, submissions_count,
                           subject_diversity, eligibility_score, allocation_percentage
                    FROM airdrop_eligibility
                    ORDER BY eligibility_score DESC
                    LIMIT 100
                    """
                )

                if not users:
                    return None

                return {
                    "snapshot_date": datetime.now(timezone.utc).isoformat(),
                    "total_eligible": len(users),
                    "top_users": [
                        {
                            "wallet_address": u["wallet_address"],
                            "tier": u["tier"],
                            "total_points": u["total_points"],
                            "submissions": u["submissions_count"],
                            "subjects": u["subject_diversity"],
                            "eligibility_score": float(u["eligibility_score"]),
                            "allocation_percent": float(u["allocation_percentage"])
                        }
                        for u in users
                    ]
                }

        except Exception as e:
            logger.error(f"Error getting airdrop snapshot: {e}", exc_info=True)
            return None

    async def close(self):
        """Close database connection."""
        if self._pool:
            await self._pool.close()
            self._pool = None


def create_airdrop_calculator() -> AirdropCalculator:
    """Factory function to create calculator instance."""
    return AirdropCalculator()
