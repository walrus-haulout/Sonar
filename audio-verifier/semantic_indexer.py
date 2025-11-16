"""
Semantic Indexer with Dual Vector Storage (PostgreSQL + Qdrant).

Generates embeddings for audio metadata and stores in both PostgreSQL (pgvector)
and Qdrant for semantic similarity search and AI training data.
"""

import asyncio
import asyncpg
import logging
import os
import httpx
import json
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timezone
from vector_db.vector_service import VectorService

logger = logging.getLogger(__name__)


class SemanticIndexer:
    """Manages vector embeddings with dual storage (PostgreSQL + Qdrant)."""

    def __init__(self, embedding_model: str = "text-embedding-3-small"):
        """
        Initialize semantic indexer.

        Args:
            embedding_model: OpenRouter embedding model to use
        """
        self.database_url = os.getenv("DATABASE_URL")
        if not self.database_url:
            raise RuntimeError("DATABASE_URL must be set")

        self.embedding_model = embedding_model
        self._pool: Optional[asyncpg.Pool] = None

        # Initialize centralized vector service
        try:
            self.vector_service = VectorService()
            logger.info("Initialized VectorService with Qdrant support")
        except Exception as e:
            logger.warning(f"VectorService initialization failed: {e}")
            self.vector_service = None

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

    async def _generate_embedding(self, text: str) -> Optional[List[float]]:
        """
        Generate embedding for text using VectorService.

        Args:
            text: Text to embed

        Returns:
            Embedding vector or None if error
        """
        if not self.vector_service:
            logger.error("VectorService not available for embedding generation")
            return None

        return await self.vector_service.generate_text_embedding(text)

    async def index_session(
        self,
        session_id: str,
        title: str,
        description: str,
        tags: List[str],
        languages: List[str],
        transcript: Optional[str] = None,
        dataset_id: Optional[str] = None
    ) -> bool:
        """
        Index a verification session with embeddings (dual write to PostgreSQL + Qdrant).

        Args:
            session_id: Verification session ID
            title: Dataset title
            description: Dataset description
            tags: List of tags
            languages: List of languages
            transcript: Optional transcript text
            dataset_id: Optional dataset ID for metadata

        Returns:
            True if successful
        """
        try:
            # Combine text for embedding
            text_parts = [
                title or "",
                description or "",
                " ".join(tags) if tags else "",
                " ".join(languages) if languages else "",
                transcript[:2000] if transcript else ""  # Limit transcript length
            ]
            combined_text = " ".join([t for t in text_parts if t])

            if not combined_text.strip():
                logger.warning(f"No text to embed for session {session_id[:8]}...")
                return False

            # Generate embedding
            embedding = await self._generate_embedding(combined_text)
            if not embedding:
                return False

            # Prepare metadata for Qdrant
            metadata = {
                "session_id": session_id,
                "dataset_id": dataset_id or "",
                "title": title,
                "tags": tags,
                "languages": languages,
                "created_at": datetime.now(timezone.utc).isoformat()
            }

            # Write to PostgreSQL
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE verification_sessions
                    SET embedding = $1::vector
                    WHERE id = $2
                    """,
                    embedding,
                    session_id
                )

            # Write to Qdrant (async, don't block on failure)
            if self.vector_service:
                await self.vector_service.index_to_qdrant(
                    session_id,
                    embedding,
                    metadata
                )
                # Mark as synced in PostgreSQL
                async with pool.acquire() as conn:
                    await conn.execute(
                        "UPDATE verification_sessions SET qdrant_synced = true WHERE id = $1",
                        session_id
                    )

            logger.info(f"Indexed session {session_id[:8]}... in PostgreSQL + Qdrant")
            return True

        except Exception as e:
            logger.error(f"Error indexing session: {e}", exc_info=True)
            return False

    async def find_similar(
        self,
        session_id: str,
        limit: int = 10,
        similarity_threshold: float = 0.7,
        use_qdrant: bool = True
    ) -> List[Dict[str, any]]:
        """
        Find similar sessions using semantic search.

        Args:
            session_id: Session to find similar entries for
            limit: Maximum results to return
            similarity_threshold: Minimum cosine similarity
            use_qdrant: Use Qdrant if available, otherwise use PostgreSQL

        Returns:
            List of similar sessions with similarity scores
        """
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                # Get embedding for this session
                embedding = await conn.fetchval(
                    "SELECT embedding FROM verification_sessions WHERE id = $1",
                    session_id
                )

                if not embedding:
                    logger.warning(f"No embedding found for session {session_id[:8]}...")
                    return []

                # Try Qdrant first if available
                if use_qdrant and self.vector_service:
                    try:
                        results = await self.vector_service.search_similar_text(
                            "",  # No text query, will use vector directly
                            top_k=limit,
                            similarity_threshold=similarity_threshold
                        )
                        if results:
                            return results
                    except Exception as e:
                        logger.warning(f"Qdrant search failed, falling back to PostgreSQL: {e}")

                # Fallback to PostgreSQL
                similar = await conn.fetch(
                    """
                    SELECT id, verification_id,
                           1 - (embedding <=> $1::vector) as similarity
                    FROM verification_sessions
                    WHERE id != $2
                    AND embedding IS NOT NULL
                    AND (1 - (embedding <=> $1::vector)) > $3
                    ORDER BY similarity DESC
                    LIMIT $4
                    """,
                    embedding,
                    session_id,
                    similarity_threshold,
                    limit
                )

                return [
                {
                "vector_id": str(s["id"]),
                "similarity_score": float(s["similarity"]),
                "metadata": {"verification_id": s["verification_id"]},
                }
                for s in similar
                ]

        except Exception as e:
            logger.error(f"Error searching similar: {e}", exc_info=True)
            return []

    async def batch_index(self, limit: int = 1000, sync_qdrant: bool = True) -> int:
        """
        Batch index sessions that don't have embeddings.

        Args:
            limit: Maximum sessions to process
            sync_qdrant: Sync to Qdrant in addition to PostgreSQL

        Returns:
            Number of sessions indexed
        """
        try:
            pool = await self._get_pool()
            async with pool.acquire() as conn:
                # Get sessions without embeddings
                sessions = await conn.fetch(
                    """
                    SELECT id, initial_data, results
                    FROM verification_sessions
                    WHERE embedding IS NULL
                    AND status = 'completed'
                    LIMIT $1
                    """,
                    limit
                )

                logger.info(f"Batch indexing {len(sessions)} sessions...")

                indexed = 0
                for session in sessions:
                    initial_data = json.loads(session["initial_data"]) if session["initial_data"] else {}
                    results = json.loads(session["results"]) if session["results"] else {}

                    success = await self.index_session(
                        session_id=str(session["id"]),
                        title=initial_data.get("title", ""),
                        description=initial_data.get("description", ""),
                        tags=initial_data.get("tags", []),
                        languages=initial_data.get("languages", []),
                        transcript=results.get("transcript", ""),
                        dataset_id=initial_data.get("dataset_id")
                    )

                    if success:
                        indexed += 1

                logger.info(f"Batch indexed {indexed}/{len(sessions)} sessions")
                return indexed

        except Exception as e:
            logger.error(f"Error in batch indexing: {e}", exc_info=True)
            return 0

    async def get_similarity_stats(self, session_id: str) -> Dict[str, any]:
        """
        Get similarity statistics for a session.

        Args:
            session_id: Session to analyze

        Returns:
            Similarity statistics
        """
        try:
            # Find similar sessions at different thresholds
            very_similar = await self.find_similar(session_id, limit=5, similarity_threshold=0.95)
            similar = await self.find_similar(session_id, limit=20, similarity_threshold=0.85)
            somewhat_similar = await self.find_similar(session_id, limit=50, similarity_threshold=0.70)

            return {
                "very_similar_count": len(very_similar),
                "similar_count": len(similar),
                "somewhat_similar_count": len(somewhat_similar),
                "very_similar": very_similar,
                "similar": similar[:10],
                "average_similarity": sum(s["similarity_score"] for s in similar) / len(similar) if similar else 0
            }

        except Exception as e:
            logger.error(f"Error getting stats: {e}", exc_info=True)
            return {}

    async def sync_unsynced_to_qdrant(self, limit: int = 1000) -> int:
        """
        Sync sessions that exist in PostgreSQL but not in Qdrant.

        Args:
            limit: Maximum sessions to sync

        Returns:
            Number of sessions synced
        """
        try:
            if not self.vector_service:
                logger.warning("VectorService not available, cannot sync to Qdrant")
                return 0

            pool = await self._get_pool()
            async with pool.acquire() as conn:
                # Get unsynced sessions with embeddings
                sessions = await conn.fetch(
                    """
                    SELECT id, initial_data, embedding
                    FROM verification_sessions
                    WHERE embedding IS NOT NULL
                    AND qdrant_synced = FALSE
                    LIMIT $1
                    """,
                    limit
                )

                logger.info(f"Syncing {len(sessions)} sessions to Qdrant...")

                synced = 0
                for session in sessions:
                    initial_data = json.loads(session["initial_data"]) if session["initial_data"] else {}

                    metadata = {
                        "session_id": str(session["id"]),
                        "dataset_id": initial_data.get("dataset_id", ""),
                        "title": initial_data.get("title", ""),
                        "tags": initial_data.get("tags", []),
                        "languages": initial_data.get("languages", []),
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }

                    success = await self.vector_service.index_to_qdrant(
                        str(session["id"]),
                        list(session["embedding"]),
                        metadata
                    )

                    if success:
                        # Mark as synced
                        await conn.execute(
                            "UPDATE verification_sessions SET qdrant_synced = true WHERE id = $1",
                            session["id"]
                        )
                        synced += 1

                logger.info(f"Synced {synced}/{len(sessions)} sessions to Qdrant")
                return synced

        except Exception as e:
            logger.error(f"Error syncing to Qdrant: {e}", exc_info=True)
            return 0

    async def close(self):
        """Close database connection."""
        if self._pool:
            await self._pool.close()
            self._pool = None


def create_semantic_indexer() -> SemanticIndexer:
    """Factory function to create indexer instance."""
    return SemanticIndexer()
