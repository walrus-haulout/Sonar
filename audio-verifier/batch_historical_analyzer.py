#!/usr/bin/env python3
"""
Batch Historical Analyzer.

Backfill all historical verification data with rarity scores,
subjects, embeddings, and other missing fields.
"""

import asyncio
import asyncpg
import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

from semantic_indexer import SemanticIndexer
from subject_extractor import SubjectExtractor
from subject_rarity_researcher import SubjectRarityResearcher
from saturation_calculator import SaturationCalculator
from bulk_detector import BulkDetector
from gemini_rarity_analyzer import GeminiRarityAnalyzer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class BatchHistoricalAnalyzer:
    """Analyze all historical verifications in batches."""

    def __init__(self):
        """Initialize batch analyzer."""
        self.database_url = os.getenv("DATABASE_URL")
        if not self.database_url:
            raise RuntimeError("DATABASE_URL must be set")

        self.semantic_indexer = SemanticIndexer()
        self.subject_extractor = SubjectExtractor()
        self.rarity_researcher = SubjectRarityResearcher()
        self.saturation_calc = SaturationCalculator()
        self.bulk_detector = BulkDetector()
        self.gemini_analyzer = GeminiRarityAnalyzer()
        self._pool: Optional[asyncpg.Pool] = None

    async def _get_pool(self) -> asyncpg.Pool:
        """Get or create database connection pool."""
        if self._pool is None:
            self._pool = await asyncpg.create_pool(
                self.database_url,
                min_size=1,
                max_size=5,
                command_timeout=120
            )
        return self._pool

    async def analyze_all_historical(
        self,
        batch_size: int = 50,
        limit: Optional[int] = None
    ) -> Dict[str, int]:
        """
        Analyze all historical verifications.

        Args:
            batch_size: Process in batches of N
            limit: Max sessions to process (None = all)

        Returns:
            Statistics about what was processed
        """
        pool = await self._get_pool()

        try:
            async with pool.acquire() as conn:
                # Get total count
                total = await conn.fetchval(
                    "SELECT COUNT(*) FROM verification_sessions WHERE status = 'completed'"
                )

                if limit:
                    total = min(total, limit)

                logger.info(f"Analyzing {total} historical sessions...")

                processed = 0
                updated = 0
                failed = 0

                # Process in batches
                offset = 0
                while offset < total:
                    batch = await conn.fetch(
                        """
                        SELECT id, initial_data, results
                        FROM verification_sessions
                        WHERE status = 'completed'
                        ORDER BY created_at DESC
                        LIMIT $1 OFFSET $2
                        """,
                        batch_size,
                        offset
                    )

                    if not batch:
                        break

                    for session in batch:
                        try:
                            success = await self._analyze_session(session, conn)
                            if success:
                                updated += 1
                            processed += 1

                            # Progress update
                            if processed % 10 == 0:
                                logger.info(f"Progress: {processed}/{total} processed, {updated} updated")

                        except Exception as e:
                            logger.error(f"Error processing session {session['id']}: {e}")
                            failed += 1

                    offset += batch_size

                return {
                    "total_sessions": total,
                    "processed": processed,
                    "updated": updated,
                    "failed": failed
                }

        finally:
            await self._cleanup()

    async def _analyze_session(
        self,
        session: asyncpg.Record,
        conn: asyncpg.Connection
    ) -> bool:
        """
        Analyze a single historical session.

        Args:
            session: Session record
            conn: Database connection

        Returns:
            True if successfully updated
        """
        try:
            session_id = str(session["id"])
            initial_data = json.loads(session["initial_data"]) if session["initial_data"] else {}
            results = json.loads(session["results"]) if session["results"] else {}

            # Extract data
            title = initial_data.get("title", "")
            description = initial_data.get("description", "")
            tags = initial_data.get("tags", [])
            languages = initial_data.get("languages", [])
            transcript = results.get("transcript", "")
            quality_score = results.get("quality", {}).get("score", 0)

            # Step 1: Extract subject
            subject = await self.subject_extractor.extract_subject(
                title, description, tags=tags
            )

            if not subject:
                logger.warning(f"Could not extract subject for {session_id[:8]}...")
                subject = title or "Unknown"

            # Step 2: Generate embedding
            success = await self.semantic_indexer.index_session(
                session_id=session_id,
                title=title,
                description=description,
                tags=tags,
                languages=languages,
                transcript=transcript
            )

            if not success:
                logger.warning(f"Could not index embedding for {session_id[:8]}...")

            # Step 3: Get subject rarity
            sample_count = initial_data.get("sample_count", 1)
            rarity_data = await self.rarity_researcher.research_subject_rarity(subject)

            # Step 4: Find similar entries
            similar = await self.semantic_indexer.find_similar(session_id, limit=50)
            similar_count = len(similar)

            # Step 5: Check saturation
            saturation = self.saturation_calc.calculate_saturation_status(
                similar_count,
                rarity_data["dynamic_threshold"]
            )

            # Step 6: Check bulk status
            is_bulk = self.bulk_detector.is_bulk_submission(sample_count)
            is_first_bulk = False
            if is_bulk:
                is_first_bulk = await self.bulk_detector.is_first_bulk_for_subject(subject, session_id)

            # Step 7: Prepare analysis data
            analysis_data = {
                "title": title,
                "description": description,
                "subject": subject,
                "sample_count": sample_count,
                "quality_score": quality_score,
                "languages": languages,
                "tags": tags,
                "transcript_preview": transcript[:200] if transcript else "",
                "is_bulk": is_bulk,
                "is_first_bulk": is_first_bulk,
                "subject_rarity_tier": rarity_data["rarity_tier"],
                "subject_rarity_multiplier": rarity_data["rarity_multiplier"],
                "dynamic_threshold": rarity_data["dynamic_threshold"],
                "similar_count": similar_count,
                "saturation_status": saturation["status"],
                "saturation_penalty": saturation["penalty"],
                "saturation_penalty_applied": saturation["penalty_applied"]
            }

            # Step 8: Call Gemini for final analysis
            # Simplified version - full version would use all components
            rarity_score = self._estimate_rarity_score(analysis_data, rarity_data)

            # Step 9: Update database
            await conn.execute(
                """
                UPDATE verification_sessions
                SET subject = $1,
                    sample_count = $2,
                    subject_rarity_tier = $3,
                    subject_rarity_multiplier = $4,
                    dynamic_saturation_threshold = $5,
                    total_subject_samples = $6,
                    similar_count = $7,
                    saturation_status = $8,
                    saturation_penalty_applied = $9,
                    is_first_bulk_contributor = $10,
                    rarity_score = $11
                WHERE id = $12
                """,
                subject,
                sample_count,
                analysis_data["subject_rarity_tier"],
                analysis_data["subject_rarity_multiplier"],
                analysis_data["dynamic_threshold"],
                similar_count,
                similar_count,
                analysis_data["saturation_status"],
                analysis_data["saturation_penalty_applied"],
                is_first_bulk,
                rarity_score,
                session_id
            )

            logger.debug(
                f"Updated {session_id[:8]}... - subject: {subject}, "
                f"rarity: {rarity_score}/100"
            )

            return True

        except Exception as e:
            logger.error(f"Error analyzing session: {e}", exc_info=True)
            return False

    def _estimate_rarity_score(
        self,
        analysis_data: Dict,
        rarity_data: Dict
    ) -> int:
        """
        Estimate rarity score from analysis data.

        This is simplified - full version uses Gemini.

        Args:
            analysis_data: Analysis results
            rarity_data: Subject rarity info

        Returns:
            Estimated rarity score (0-100)
        """
        base_score = 50

        # Subject rarity bonus
        rarity_multiplier = rarity_data.get("rarity_multiplier", 1.0)
        if rarity_multiplier == 5.0:
            base_score += 30
        elif rarity_multiplier == 3.0:
            base_score += 20
        elif rarity_multiplier == 2.0:
            base_score += 10
        elif rarity_multiplier == 0.5:
            base_score -= 20

        # Quality bonus
        quality = analysis_data.get("quality_score", 0)
        if quality > 0.9:
            base_score += 15
        elif quality > 0.75:
            base_score += 10
        elif quality < 0.5:
            base_score -= 10

        # Saturation penalty
        if analysis_data.get("saturation_penalty_applied"):
            base_score += analysis_data.get("saturation_penalty", 0)

        # Bulk bonus
        if analysis_data.get("is_first_bulk"):
            base_score += 20

        # Cap at 0-100
        return max(0, min(100, base_score))

    async def _cleanup(self):
        """Clean up resources."""
        await self.semantic_indexer.close()
        await self.rarity_researcher.close()
        await self.saturation_calc.close()
        await self.bulk_detector.close()

        if self._pool:
            await self._pool.close()


async def main():
    """Run batch analysis."""
    analyzer = BatchHistoricalAnalyzer()

    # Analyze all historical data
    stats = await analyzer.analyze_all_historical(batch_size=50)

    logger.info("=" * 60)
    logger.info("BATCH ANALYSIS COMPLETE")
    logger.info("=" * 60)
    logger.info(f"Total sessions: {stats['total_sessions']}")
    logger.info(f"Processed: {stats['processed']}")
    logger.info(f"Updated: {stats['updated']}")
    logger.info(f"Failed: {stats['failed']}")
    logger.info(f"Success rate: {stats['updated']/stats['processed']*100:.1f}%")


if __name__ == "__main__":
    asyncio.run(main())
