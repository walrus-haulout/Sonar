"""
Subject Rarity Researcher.

Research subject rarity using web search via omnisearch MCP.
Caches results to avoid repeated searches.
"""

import asyncpg
import logging
import json
from typing import Dict, Optional, Tuple
from datetime import datetime, timezone, timedelta
import os

logger = logging.getLogger(__name__)


class SubjectRarityResearcher:
    """Research and cache subject rarity information."""

    # Rarity tier definitions with multipliers
    RARITY_TIERS = {
        "Critical": {
            "multiplier": 5.0,
            "examples": ["endangered species", "extinct animal", "unique cultural sound"]
        },
        "High": {
            "multiplier": 3.0,
            "examples": ["rare species", "vintage equipment", "uncommon dialect"]
        },
        "Medium": {
            "multiplier": 2.0,
            "examples": ["some existing recordings", "regional variants", "specialized domain"]
        },
        "Standard": {
            "multiplier": 1.0,
            "examples": ["common subjects", "widely available", "mainstream"]
        },
        "Oversaturated": {
            "multiplier": 0.5,
            "examples": ["extremely common", "widely recorded", "generic variants"]
        }
    }

    def __init__(self):
        """Initialize researcher."""
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

    async def research_subject_rarity(
        self,
        subject: str,
        use_web_search: bool = True
    ) -> Dict[str, any]:
        """
        Research rarity of a subject.

        Args:
            subject: Subject to research (e.g., "Javan Hawk-Eagle")
            use_web_search: Whether to use web search if not cached

        Returns:
            Rarity info with tier, multiplier, threshold, research summary
        """
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                # Check cache first
                cached = await conn.fetchrow(
                    """
                    SELECT rarity_tier, rarity_multiplier, dynamic_threshold,
                           web_research_summary, researched_at, total_samples
                    FROM subject_rarity_cache
                    WHERE subject = $1
                    """,
                    subject
                )

                if cached:
                    # Check if cache is fresh (within 7 days)
                    if cached["researched_at"]:
                        age = datetime.now(timezone.utc) - cached["researched_at"]
                        if age < timedelta(days=7):
                            logger.debug(f"Using cached rarity for '{subject}'")
                            return {
                                "subject": subject,
                                "rarity_tier": cached["rarity_tier"],
                                "rarity_multiplier": float(cached["rarity_multiplier"]),
                                "dynamic_threshold": cached["dynamic_threshold"],
                                "web_research_summary": cached["web_research_summary"],
                                "total_samples": cached["total_samples"],
                                "cached": True
                            }

                # Not cached or expired - research if enabled
                if use_web_search:
                    result = await self._perform_web_research(subject, conn)

                    # Cache the result
                    await conn.execute(
                        """
                        INSERT INTO subject_rarity_cache
                        (subject, rarity_tier, rarity_multiplier, dynamic_threshold,
                         web_research_summary, researched_at)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT (subject) DO UPDATE
                        SET rarity_tier = $2,
                            rarity_multiplier = $3,
                            dynamic_threshold = $4,
                            web_research_summary = $5,
                            researched_at = $6
                        """,
                        subject,
                        result["rarity_tier"],
                        result["rarity_multiplier"],
                        result["dynamic_threshold"],
                        result["web_research_summary"],
                        datetime.now(timezone.utc)
                    )

                    return {**result, "cached": False}

                # Default to Standard if no cache and no web search
                return {
                    "subject": subject,
                    "rarity_tier": "Standard",
                    "rarity_multiplier": 1.0,
                    "dynamic_threshold": 25,
                    "web_research_summary": "No research performed",
                    "total_samples": 0,
                    "cached": False
                }

        except Exception as e:
            logger.error(f"Error researching subject: {e}", exc_info=True)
            # Return default on error
            return {
                "subject": subject,
                "rarity_tier": "Standard",
                "rarity_multiplier": 1.0,
                "dynamic_threshold": 25,
                "web_research_summary": f"Error: {str(e)}",
                "total_samples": 0,
                "cached": False
            }

    async def _perform_web_research(
        self,
        subject: str,
        conn: asyncpg.Connection
    ) -> Dict[str, any]:
        """
        Perform actual web research using omnisearch MCP.

        This is called during verification Stage 4 where Gemini agent
        has access to web search tools.

        Args:
            subject: Subject to research
            conn: Database connection

        Returns:
            Research results with tier determination
        """
        # This function would be called from gemini_rarity_analyzer
        # which has access to web search tools. For now, we provide
        # a placeholder that determines tier based on subject keywords.

        logger.info(f"Researching rarity for: {subject}")

        # Count existing samples of this subject
        count = await conn.fetchval(
            """
            SELECT COUNT(*)
            FROM verification_sessions
            WHERE subject = $1
            """,
            subject
        )

        # Simple heuristic-based rarity determination
        # (This will be enhanced by Gemini's web research)
        rarity_tier = self._heuristic_rarity(subject, count or 0)
        multiplier = self.RARITY_TIERS[rarity_tier]["multiplier"]
        dynamic_threshold = int(25 * multiplier)

        return {
            "subject": subject,
            "rarity_tier": rarity_tier,
            "rarity_multiplier": multiplier,
            "dynamic_threshold": dynamic_threshold,
            "web_research_summary": f"Determined as {rarity_tier} based on subject characteristics",
            "total_samples": count or 0
        }

    def _heuristic_rarity(self, subject: str, sample_count: int) -> str:
        """
        Quick heuristic rarity determination based on keywords.

        Args:
            subject: Subject string
            sample_count: Current sample count in database

        Returns:
            Rarity tier
        """
        subject_lower = subject.lower()

        # Critical: endangered, extinct, specific rare species
        critical_keywords = [
            "endangered", "extinct", "rare", "critically", "iucn",
            "javan", "vaquita", "kakapo", "aye-aye"
        ]
        if any(kw in subject_lower for kw in critical_keywords):
            return "Critical"

        # High: uncommon, specific variants
        high_keywords = [
            "regional", "dialect", "vintage", "antique", "specific breed",
            "traditional", "cultural", "indigenous", "tribal"
        ]
        if any(kw in subject_lower for kw in high_keywords):
            return "High"

        # Oversaturated: already many samples
        if sample_count >= 100:
            return "Oversaturated"

        # Medium: some existing but not abundant
        if sample_count >= 25:
            return "Medium"

        # Default: Standard
        return "Standard"

    async def get_cached_subjects(self) -> Dict[str, Dict[str, any]]:
        """Get all cached subject rarity data."""
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                subjects = await conn.fetch(
                    """
                    SELECT subject, rarity_tier, rarity_multiplier,
                           dynamic_threshold, total_samples
                    FROM subject_rarity_cache
                    ORDER BY rarity_multiplier DESC
                    """
                )

                return {
                    s["subject"]: {
                        "tier": s["rarity_tier"],
                        "multiplier": float(s["rarity_multiplier"]),
                        "threshold": s["dynamic_threshold"],
                        "samples": s["total_samples"]
                    }
                    for s in subjects
                }

        except Exception as e:
            logger.error(f"Error getting cached subjects: {e}")
            return {}

    async def clear_old_cache(self, days: int = 7) -> int:
        """Clear cache entries older than N days."""
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                cutoff = datetime.now(timezone.utc) - timedelta(days=days)
                result = await conn.execute(
                    """
                    DELETE FROM subject_rarity_cache
                    WHERE researched_at < $1
                    """,
                    cutoff
                )

                count = int(result.split()[-1]) if result else 0
                logger.info(f"Cleared {count} old cache entries")
                return count

        except Exception as e:
            logger.error(f"Error clearing cache: {e}")
            return 0

    async def close(self):
        """Close database connection."""
        if self._pool:
            await self._pool.close()
            self._pool = None


def create_subject_rarity_researcher() -> SubjectRarityResearcher:
    """Factory function to create researcher instance."""
    return SubjectRarityResearcher()
