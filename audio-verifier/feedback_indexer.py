"""Semantic indexer for user feedback comments.

Generates embeddings for feedback using OpenRouter API and stores in PostgreSQL pgvector
for semantic similarity search. Supports dual-write to Pinecone for cloud search.
"""

import asyncio
import asyncpg
import logging
import os
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


class FeedbackIndexer:
    """Manages vector embeddings for user feedback."""

    def __init__(self, database_url: Optional[str] = None):
        """Initialize feedback indexer.

        Args:
            database_url: PostgreSQL connection URL (defaults to DATABASE_URL env var)
        """
        self.database_url = database_url or os.getenv("DATABASE_URL")
        self._pool: Optional[asyncpg.Pool] = None

        # Lazy import to avoid circular dependencies
        self._vector_service = None

    async def _get_vector_service(self):
        """Lazy load vector service on first use."""
        if self._vector_service is None:
            from vector_db.vector_service import VectorService

            self._vector_service = VectorService()
        return self._vector_service

    async def _get_pool(self) -> asyncpg.Pool:
        """Get or create PostgreSQL connection pool."""
        if self._pool is None:
            self._pool = await asyncpg.create_pool(
                self.database_url, min_size=1, max_size=10
            )
        return self._pool

    async def index_feedback(
        self,
        feedback_id: str,
        feedback_text: str,
        session_id: str,
        vote: str,
        category: Optional[str] = None,
    ) -> bool:
        """Index single feedback comment with embedding.

        Args:
            feedback_id: UUID of feedback record
            feedback_text: User's feedback comment
            session_id: Associated verification session ID
            vote: 'helpful' or 'not_helpful'
            category: Optional feedback category

        Returns:
            True if indexing successful, False otherwise
        """
        if not feedback_text or not feedback_text.strip():
            logger.warning(f"Skipping feedback {feedback_id[:8]}... - empty text")
            return False

        try:
            # Generate embedding via OpenRouter
            vector_service = await self._get_vector_service()
            embedding = await vector_service.generate_text_embedding(feedback_text)

            if not embedding:
                logger.error(f"Failed to generate embedding for feedback {feedback_id[:8]}...")
                return False

            # Write to PostgreSQL
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE verification_feedback SET embedding = $1::vector, qdrant_synced = TRUE WHERE id = $2",
                    embedding,
                    feedback_id,
                )

            logger.info(
                f"Indexed feedback {feedback_id[:8]}... - embedding: {len(embedding)}d"
            )
            return True

        except Exception as e:
            logger.error(
                f"Failed to index feedback {feedback_id[:8]}...: {e}", exc_info=True
            )
            return False

    async def batch_index_feedback(self, limit: int = 100) -> int:
        """Batch index feedback without embeddings.

        Processes unindexed feedback and generates embeddings. Useful for:
        - Backfilling existing feedback
        - Periodic re-indexing

        Args:
            limit: Max feedback to process in this batch

        Returns:
            Number of feedback items successfully indexed
        """
        pool = await self._get_pool()

        try:
            async with pool.acquire() as conn:
                feedbacks = await conn.fetch(
                    """
                    SELECT id, feedback_text, session_id, vote, feedback_category
                    FROM verification_feedback
                    WHERE feedback_text IS NOT NULL
                    AND feedback_text != ''
                    AND embedding IS NULL
                    ORDER BY created_at DESC
                    LIMIT $1
                    """,
                    limit,
                )

            logger.info(f"Batch indexing {len(feedbacks)} feedback items...")

            indexed = 0
            for fb in feedbacks:
                success = await self.index_feedback(
                    str(fb["id"]),
                    fb["feedback_text"],
                    str(fb["session_id"]),
                    fb["vote"],
                    fb["feedback_category"],
                )
                if success:
                    indexed += 1

            logger.info(f"Successfully indexed {indexed}/{len(feedbacks)} feedback items")
            return indexed

        except Exception as e:
            logger.error(f"Batch indexing failed: {e}", exc_info=True)
            return 0

    async def find_similar_feedback(
        self,
        query_text: str,
        limit: int = 20,
        similarity_threshold: float = 0.75,
        vote_filter: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Find similar feedback comments using semantic search.

        Uses pgvector cosine similarity search. Finds feedback with embeddings
        closest to the query embedding.

        Args:
            query_text: Query text to find similar feedback for
            limit: Max results to return
            similarity_threshold: Min similarity score (0-1)
            vote_filter: Filter by 'helpful' or 'not_helpful'

        Returns:
            List of similar feedback with similarity scores
        """
        try:
            # Generate query embedding
            vector_service = await self._get_vector_service()
            query_embedding = await vector_service.generate_text_embedding(query_text)

            if not query_embedding:
                logger.error("Failed to generate query embedding")
                return []

            pool = await self._get_pool()

            async with pool.acquire() as conn:
                # Build WHERE clause for vote filter
                vote_clause = ""
                params = [query_embedding, similarity_threshold, limit]

                if vote_filter:
                    vote_clause = "AND vote = $4"
                    params.append(vote_filter)

                results = await conn.fetch(
                    f"""
                    SELECT id, feedback_text, session_id, vote, feedback_category,
                           1 - (embedding <=> $1::vector) as similarity
                    FROM verification_feedback
                    WHERE embedding IS NOT NULL
                    AND (1 - (embedding <=> $1::vector)) > $2
                    {vote_clause}
                    ORDER BY similarity DESC
                    LIMIT $3
                    """,
                    *params,
                )

            logger.info(f"Found {len(results)} similar feedback items")

            return [
                {
                    "feedback_id": str(r["id"]),
                    "text": r["feedback_text"][:200],  # Preview
                    "full_text": r["feedback_text"],
                    "session_id": str(r["session_id"]),
                    "vote": r["vote"],
                    "category": r["feedback_category"],
                    "similarity": float(r["similarity"]),
                }
                for r in results
            ]

        except Exception as e:
            logger.error(f"Semantic search failed: {e}", exc_info=True)
            return []

    async def get_feedback_stats(self) -> Dict[str, Any]:
        """Get statistics about feedback indexing.

        Returns:
            Dict with total, indexed, unindexed counts
        """
        pool = await self._get_pool()

        try:
            async with pool.acquire() as conn:
                total = await conn.fetchval("SELECT COUNT(*) FROM verification_feedback WHERE feedback_text IS NOT NULL")
                indexed = await conn.fetchval("SELECT COUNT(*) FROM verification_feedback WHERE embedding IS NOT NULL")

            return {
                "total_feedback": total,
                "indexed": indexed,
                "unindexed": total - indexed,
                "indexed_percentage": round(100.0 * indexed / max(total, 1), 2),
            }

        except Exception as e:
            logger.error(f"Failed to get feedback stats: {e}", exc_info=True)
            return {
                "total_feedback": 0,
                "indexed": 0,
                "unindexed": 0,
                "indexed_percentage": 0.0,
            }


if __name__ == "__main__":
    """CLI for batch indexing feedback."""

    async def main():
        """Backfill existing feedback with embeddings."""
        import sys

        indexer = FeedbackIndexer()

        if len(sys.argv) > 1 and sys.argv[1] == "stats":
            stats = await indexer.get_feedback_stats()
            print(f"Feedback Statistics:")
            print(f"  Total: {stats['total_feedback']}")
            print(f"  Indexed: {stats['indexed']}")
            print(f"  Unindexed: {stats['unindexed']}")
            print(f"  Completion: {stats['indexed_percentage']}%")
        else:
            print("Starting batch indexing...")
            indexed = await indexer.batch_index_feedback(limit=100)
            print(f"Indexed {indexed} feedback items")

            stats = await indexer.get_feedback_stats()
            print(f"Remaining: {stats['unindexed']} unindexed")

    asyncio.run(main())
