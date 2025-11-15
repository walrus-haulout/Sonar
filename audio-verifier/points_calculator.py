"""
Points Calculation System for Rarity-Based Reward System.

Calculates user points based on rarity score and multiple multiplier factors.
"""

import logging
from decimal import Decimal
from typing import Dict, Any, Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class PointsCalculator:
    """Calculate points earned for audio submissions."""

    # Quality multiplier ranges (based on technical quality score)
    QUALITY_MULTIPLIERS = {
        "excellent": Decimal("1.5"),  # quality_score >= 0.9
        "good": Decimal("1.3"),       # quality_score >= 0.75
        "decent": Decimal("1.15"),    # quality_score >= 0.6
        "acceptable": Decimal("1.05"), # quality_score >= 0.4
        "poor": Decimal("1.0")        # quality_score < 0.4
    }

    # Bulk contributor multipliers
    BULK_MULTIPLIERS = {
        "first_bulk": Decimal("2.0"),   # First bulk (100+ samples)
        "subsequent_bulk": Decimal("1.2"),  # 50+ samples
        "small": Decimal("1.0")         # < 50 samples
    }

    # Subject rarity multipliers (derived from Gemini research)
    SUBJECT_RARITY_MULTIPLIERS = {
        "Critical": Decimal("5.0"),     # Endangered, rare species, unique sounds
        "High": Decimal("3.0"),         # Uncommon but accessible
        "Medium": Decimal("2.0"),       # Some existing recordings
        "Standard": Decimal("1.0"),     # Common subjects
        "Oversaturated": Decimal("0.5") # Extremely common
    }

    # Specificity bonuses (based on grade)
    SPECIFICITY_MULTIPLIERS = {
        "A": Decimal("1.3"),
        "B": Decimal("1.2"),
        "C": Decimal("1.1"),
        "D": Decimal("1.05"),
        "E": Decimal("1.0"),
        "F": Decimal("1.0")
    }

    # Verification bonuses
    VERIFICATION_MULTIPLIERS = {
        "verified": Decimal("1.2"),
        "partially_verified": Decimal("1.1"),
        "unverified": Decimal("1.0")
    }

    # Early contributor bonuses
    EARLY_CONTRIBUTOR_MULTIPLIERS = {
        "first_100": Decimal("1.5"),      # Datasets 1-100
        "101_500": Decimal("1.3"),        # Datasets 101-500
        "501_1000": Decimal("1.2"),       # Datasets 501-1000
        "1001_plus": Decimal("1.0")       # Datasets 1001+
    }

    def __init__(self):
        """Initialize calculator."""
        self.total_datasets_in_db = 0

    def set_total_datasets(self, total: int):
        """Set total datasets in database for early contributor calculation."""
        self.total_datasets_in_db = total

    def calculate_quality_multiplier(self, quality_score: float) -> Decimal:
        """
        Calculate quality multiplier from technical quality score.

        Args:
            quality_score: Quality score (0.0 - 1.0)

        Returns:
            Quality multiplier (1.0 - 1.5)
        """
        if quality_score >= 0.9:
            return self.QUALITY_MULTIPLIERS["excellent"]
        elif quality_score >= 0.75:
            return self.QUALITY_MULTIPLIERS["good"]
        elif quality_score >= 0.6:
            return self.QUALITY_MULTIPLIERS["decent"]
        elif quality_score >= 0.4:
            return self.QUALITY_MULTIPLIERS["acceptable"]
        else:
            return self.QUALITY_MULTIPLIERS["poor"]

    def calculate_bulk_multiplier(
        self,
        sample_count: int,
        is_first_bulk: bool = False
    ) -> Decimal:
        """
        Calculate bulk submission multiplier.

        Args:
            sample_count: Number of samples in this submission
            is_first_bulk: Whether this is first bulk contributor for subject

        Returns:
            Bulk multiplier (1.0 - 2.0)
        """
        if is_first_bulk and sample_count >= 100:
            return self.BULK_MULTIPLIERS["first_bulk"]
        elif sample_count >= 50:
            return self.BULK_MULTIPLIERS["subsequent_bulk"]
        else:
            return self.BULK_MULTIPLIERS["small"]

    def calculate_subject_rarity_multiplier(self, rarity_tier: Optional[str]) -> Decimal:
        """
        Calculate subject rarity multiplier.

        Args:
            rarity_tier: Rarity tier (Critical, High, Medium, Standard, Oversaturated)

        Returns:
            Rarity multiplier (0.5 - 5.0)
        """
        if not rarity_tier or rarity_tier not in self.SUBJECT_RARITY_MULTIPLIERS:
            return self.SUBJECT_RARITY_MULTIPLIERS["Standard"]
        return self.SUBJECT_RARITY_MULTIPLIERS[rarity_tier]

    def calculate_specificity_multiplier(self, specificity_grade: Optional[str]) -> Decimal:
        """
        Calculate specificity multiplier from grade.

        Args:
            specificity_grade: Grade (A-F)

        Returns:
            Specificity multiplier (1.0 - 1.3)
        """
        if specificity_grade and specificity_grade in self.SPECIFICITY_MULTIPLIERS:
            return self.SPECIFICITY_MULTIPLIERS[specificity_grade]
        return self.SPECIFICITY_MULTIPLIERS["D"]

    def calculate_verification_multiplier(self, verification_status: Optional[str]) -> Decimal:
        """
        Calculate verification multiplier.

        Args:
            verification_status: Status (verified, partially_verified, unverified)

        Returns:
            Verification multiplier (1.0 - 1.2)
        """
        if verification_status == "verified":
            return self.VERIFICATION_MULTIPLIERS["verified"]
        elif verification_status == "partially_verified":
            return self.VERIFICATION_MULTIPLIERS["partially_verified"]
        else:
            return self.VERIFICATION_MULTIPLIERS["unverified"]

    def calculate_early_contributor_multiplier(self) -> Decimal:
        """
        Calculate early contributor bonus based on total datasets.

        Returns:
            Early contributor multiplier (1.0 - 1.5)
        """
        if self.total_datasets_in_db < 100:
            return self.EARLY_CONTRIBUTOR_MULTIPLIERS["first_100"]
        elif self.total_datasets_in_db < 500:
            return self.EARLY_CONTRIBUTOR_MULTIPLIERS["101_500"]
        elif self.total_datasets_in_db < 1000:
            return self.EARLY_CONTRIBUTOR_MULTIPLIERS["501_1000"]
        else:
            return self.EARLY_CONTRIBUTOR_MULTIPLIERS["1001_plus"]

    def calculate_points(
        self,
        rarity_score: int,
        quality_score: float,
        sample_count: int = 1,
        is_first_bulk: bool = False,
        subject_rarity_tier: Optional[str] = None,
        specificity_grade: Optional[str] = None,
        verification_status: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Calculate total points for a submission.

        Formula:
        points = rarity_score × quality_multiplier × bulk_multiplier ×
                 subject_rarity_multiplier × specificity_multiplier ×
                 verification_multiplier × early_contributor_multiplier

        Args:
            rarity_score: Rarity score (0-100)
            quality_score: Quality score (0.0-1.0)
            sample_count: Number of samples
            is_first_bulk: First bulk contributor flag
            subject_rarity_tier: Rarity tier of subject
            specificity_grade: Grade A-F
            verification_status: Verification status

        Returns:
            Dict with points and all multiplier breakdowns
        """
        # Calculate individual multipliers
        quality_mult = self.calculate_quality_multiplier(quality_score)
        bulk_mult = self.calculate_bulk_multiplier(sample_count, is_first_bulk)
        subject_mult = self.calculate_subject_rarity_multiplier(subject_rarity_tier)
        specificity_mult = self.calculate_specificity_multiplier(specificity_grade)
        verification_mult = self.calculate_verification_multiplier(verification_status)
        early_mult = self.calculate_early_contributor_multiplier()

        # Calculate total multiplier
        total_multiplier = (
            quality_mult * bulk_mult * subject_mult *
            specificity_mult * verification_mult * early_mult
        )

        # Calculate final points
        points = int(rarity_score * total_multiplier)

        # Log calculation
        logger.info(
            f"Points calculation: rarity={rarity_score}, quality={quality_mult}x, "
            f"bulk={bulk_mult}x, subject={subject_mult}x, "
            f"specificity={specificity_mult}x, verification={verification_mult}x, "
            f"early={early_mult}x → total_mult={total_multiplier}x → points={points}"
        )

        return {
            "points": points,
            "rarity_score": rarity_score,
            "quality_multiplier": float(quality_mult),
            "bulk_multiplier": float(bulk_mult),
            "subject_rarity_multiplier": float(subject_mult),
            "specificity_multiplier": float(specificity_mult),
            "verification_multiplier": float(verification_mult),
            "early_contributor_multiplier": float(early_mult),
            "total_multiplier": float(total_multiplier),
            "breakdown": {
                "base_points": rarity_score,
                "quality_adjusted": int(rarity_score * quality_mult),
                "bulk_adjusted": int(rarity_score * quality_mult * bulk_mult),
                "subject_adjusted": int(rarity_score * quality_mult * bulk_mult * subject_mult),
                "specificity_adjusted": int(
                    rarity_score * quality_mult * bulk_mult * subject_mult * specificity_mult
                ),
                "verification_adjusted": int(
                    rarity_score * quality_mult * bulk_mult * subject_mult *
                    specificity_mult * verification_mult
                ),
                "final_points": points
            }
        }

    def get_next_tier_points(self, current_points: int) -> Dict[str, Any]:
        """
        Get points needed for next tier.

        Args:
            current_points: Current total points

        Returns:
            Dict with next tier info
        """
        tiers = [
            ("Legend", 100000),
            ("Diamond", 50000),
            ("Platinum", 25000),
            ("Gold", 10000),
            ("Silver", 5000),
            ("Bronze", 1000),
            ("Contributor", 0)
        ]

        current_tier = None
        next_tier = None
        next_threshold = None

        for tier_name, threshold in tiers:
            if current_points >= threshold:
                current_tier = tier_name
                break

        if current_tier and current_tier != "Legend":
            # Find next tier
            for tier_name, threshold in tiers:
                if threshold > (tiers[tiers.index((current_tier, next(t for n, t in tiers if n == current_tier)))])
                    threshold for n, t in tiers if n == current_tier):
                    next_tier = tier_name
                    next_threshold = threshold
                    break

        if not next_tier:
            # Already at Legend tier
            next_tier = "Legend"
            next_threshold = 100000

        points_needed = max(0, next_threshold - current_points)

        return {
            "current_tier": current_tier,
            "next_tier": next_tier,
            "next_threshold": next_threshold,
            "points_needed": points_needed,
            "progress_percent": min(100, int((current_points / next_threshold * 100)))
        }


def create_points_calculator() -> PointsCalculator:
    """Factory function to create calculator instance."""
    return PointsCalculator()
