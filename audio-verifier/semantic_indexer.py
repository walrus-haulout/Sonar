"""
Semantic Indexer with Vector Embeddings.

Generates embeddings for audio metadata and enables semantic similarity search.
Uses pgvector for PostgreSQL vector storage.
"""

import asyncio
import asyncpg
import logging
import os
import httpx
import json
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class SemanticIndexer:
    """Manages vector embeddings and semantic search."""

    def __init__(self, embedding_model: str = "text-embedding-3-small"):
        """
        Initialize semantic indexer.

        Args:
            embedding_model: OpenRouter embedding model to use
        """
        self.database_url = os.getenv("DATABASE_URL")
        if not self.database_url:
            raise RuntimeError("DATABASE_URL must be set")

        self.openrouter_api_key = os.getenv("OPENROUTER_API_KEY")
        if not self.openrouter_api_key:
            raise RuntimeError("OPENROUTER_API_KEY must be set")

        self.embedding_model = embedding_model
        self._pool: Optional[asyncpg.Pool] = None
        self._embedding_cache: Dict[str, List[float]] = {}

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
        Generate embedding for text using OpenRouter.

        Args:
            text: Text to embed

        Returns:
            Embedding vector or None if error
        """
        # Check cache first
        if text in self._embedding_cache:
            return self._embedding_cache[text]

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://openrouter.ai/api/v1/embeddings",
                    headers={
                        "Authorization": f"Bearer {self.openrouter_api_key}",
                        "HTTP-Referer": "https://sonar-protocol.com",
                        "X-Title": "Sonar Audio Verifier"
                    },
                    json={
                        "model": "text-embedding-3-small",
                        "input": text
                    },
                    timeout=30.0
                )

                if response.status_code != 200:
                    logger.error(
                        f"Embedding API error: {response.status_code} - {response.text}"
                    )
                    return None

                data = response.json()
                embedding = data["data"][0]["embedding"]

                # Cache result
                self._embedding_cache[text] = embedding
                return embedding

        except Exception as e:
            logger.error(f"Error generating embedding: {e}", exc_info=True)
            return None

    async def index_session(
        self,
        session_id: str,
        title: str,
        description: str,
        tags: List[str],
        languages: List[str],
        transcript: Optional[str] = None
    ) -> bool:
        """
        Index a verification session with embeddings.

        Args:
            session_id: Verification session ID
            title: Dataset title
            description: Dataset description
            tags: List of tags
            languages: List of languages
            transcript: Optional transcript text

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

            # Store in database
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

            logger.debug(f"Indexed session {session_id[:8]}... with embedding")
            return True

        except Exception as e:
            logger.error(f"Error indexing session: {e}", exc_info=True)
            return False

    async def find_similar(
        self,
        session_id: str,
        limit: int = 10,
        similarity_threshold: float = 0.7
    ) -> List[Dict[str, any]]:
        """
        Find similar sessions using semantic search.

        Args:
            session_id: Session to find similar entries for
            limit: Maximum results to return
            similarity_threshold: Minimum cosine similarity

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

                # Find similar sessions using vector similarity
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
                        "session_id": str(s["id"]),
                        "verification_id": s["verification_id"],
                        "similarity_score": float(s["similarity"])
                    }
                    for s in similar
                ]

        except Exception as e:
            logger.error(f"Error searching similar: {e}", exc_info=True)
            return []

    async def batch_index(self, limit: int = 1000) -> int:
        """
        Batch index sessions that don't have embeddings.

        Args:
            limit: Maximum sessions to process

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
                        transcript=results.get("transcript", "")
                    )

                    if success:
                        indexed += 1

                logger.info(f"Batch indexed {indexed} sessions")
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

    async def close(self):
        """Close database connection."""
        if self._pool:
            await self._pool.close()
            self._pool = None


def create_semantic_indexer() -> SemanticIndexer:
    """Factory function to create indexer instance."""
    return SemanticIndexer()
