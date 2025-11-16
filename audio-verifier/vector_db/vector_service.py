"""Unified vector service handling both PostgreSQL and Pinecone."""

import asyncio
import logging
import httpx
import os
import time
from typing import Any, Dict, List, Optional
from .pinecone_client import PineconeClient

logger = logging.getLogger(__name__)


class RateLimiter:
    """Simple rate limiter with token bucket algorithm."""

    def __init__(self, requests_per_second: float = 5.0):
        self.requests_per_second = requests_per_second
        self.min_interval = 1.0 / requests_per_second
        self.last_request_time = 0.0

    async def wait_if_needed(self) -> None:
        """Wait if necessary to maintain rate limit."""
        elapsed = time.time() - self.last_request_time
        if elapsed < self.min_interval:
            await asyncio.sleep(self.min_interval - elapsed)
        self.last_request_time = time.time()


class VectorService:
    """Unified interface for vector operations across PostgreSQL and Pinecone."""

    def __init__(self):
        """Initialize vector service with Pinecone client and embedding API."""
        self.openrouter_api_key = os.getenv("OPENROUTER_API_KEY")
        if not self.openrouter_api_key:
            raise RuntimeError("OPENROUTER_API_KEY must be set")

        self.embedding_model = "text-embedding-3-small"
        self._embedding_cache: Dict[str, List[float]] = {}
        self._rate_limiter = RateLimiter(requests_per_second=5.0)

        try:
            self.pinecone = PineconeClient()
        except Exception as e:
            logger.warning(f"Pinecone not available: {e}")
            self.pinecone = None

    async def generate_text_embedding(self, text: str) -> Optional[List[float]]:
        """
        Generate embedding for text using OpenRouter with rate limiting.

        Args:
            text: Text to embed

        Returns:
            Embedding vector or None if error
        """
        # Check cache first
        if text in self._embedding_cache:
            return self._embedding_cache[text]

        try:
            # Rate limit API calls
            await self._rate_limiter.wait_if_needed()

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://openrouter.ai/api/v1/embeddings",
                    headers={
                        "Authorization": f"Bearer {self.openrouter_api_key}",
                        "HTTP-Referer": "https://sonar-protocol.com",
                        "X-Title": "Sonar Audio Verifier",
                    },
                    json={
                        "model": self.embedding_model,
                        "input": text,
                    },
                    timeout=30.0,
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

    async def index_to_pinecone(
        self,
        session_id: str,
        embedding: List[float],
        metadata: Dict[str, Any],
    ) -> bool:
        """
        Index vector to Pinecone.

        Args:
            session_id: Session ID
            embedding: Text embedding vector
            metadata: Metadata dict with title, description, tags, etc.

        Returns:
            True if successful
        """
        if not self.pinecone:
            logger.warning("Pinecone not available, skipping vector indexing")
            return False

        return self.pinecone.upsert_text_vector(session_id, embedding, metadata)

    async def index_audio_to_pinecone(
        self,
        session_id: str,
        audio_embedding: List[float],
        metadata: Dict[str, Any],
    ) -> bool:
        """
        Index audio feature vector to Pinecone.

        Args:
            session_id: Session ID
            audio_embedding: Audio feature vector
            metadata: Audio metadata

        Returns:
            True if successful
        """
        if not self.pinecone:
            logger.warning("Pinecone not available, skipping audio vector indexing")
            return False

        return self.pinecone.upsert_audio_vector(session_id, audio_embedding, metadata)

    async def search_similar_text(
        self,
        query_text: str,
        top_k: int = 10,
        similarity_threshold: float = 0.7,
    ) -> List[Dict[str, Any]]:
        """
        Search for similar datasets using text similarity.

        Args:
            query_text: Query text
            top_k: Number of results
            similarity_threshold: Minimum similarity score

        Returns:
            List of similar vectors with metadata
        """
        if not self.pinecone:
            logger.warning("Pinecone not available, returning empty results")
            return []

        # Generate embedding for query
        query_embedding = await self.generate_text_embedding(query_text)
        if not query_embedding:
            logger.error("Failed to generate query embedding")
            return []

        # Query Pinecone
        return self.pinecone.query_text_vectors(
            query_embedding, top_k=top_k, similarity_threshold=similarity_threshold
        )

    async def search_similar_audio(
        self,
        query_embedding: List[float],
        top_k: int = 10,
        similarity_threshold: float = 0.7,
    ) -> List[Dict[str, Any]]:
        """
        Search for similar datasets using audio features.

        Args:
            query_embedding: Audio feature query vector
            top_k: Number of results
            similarity_threshold: Minimum similarity score

        Returns:
            List of similar audio vectors with metadata
        """
        if not self.pinecone:
            logger.warning("Pinecone not available, returning empty results")
            return []

        return self.pinecone.query_audio_vectors(
            query_embedding, top_k=top_k, similarity_threshold=similarity_threshold
        )

    async def search_multi_modal(
        self,
        text_query: Optional[str] = None,
        audio_embedding: Optional[List[float]] = None,
        top_k: int = 10,
        text_weight: float = 0.6,
        audio_weight: float = 0.4,
    ) -> List[Dict[str, Any]]:
        """
        Combined search using text and/or audio vectors with weighted ranking.

        Args:
            text_query: Optional text query
            audio_embedding: Optional audio feature vector
            top_k: Number of results
            text_weight: Weight for text similarity (0-1)
            audio_weight: Weight for audio similarity (0-1)

        Returns:
            Combined ranked results
        """
        results_map: Dict[str, Dict[str, Any]] = {}

        # Search text
        if text_query:
            text_results = await self.search_similar_text(
                text_query, top_k=top_k * 2
            )
            for result in text_results:
                vec_id = result["vector_id"]
                if vec_id not in results_map:
                    results_map[vec_id] = result.copy()
                    results_map[vec_id]["combined_score"] = 0
                results_map[vec_id]["combined_score"] += (
                    result["similarity_score"] * text_weight
                )
                results_map[vec_id]["text_score"] = result["similarity_score"]

        # Search audio
        if audio_embedding:
            audio_results = await self.search_similar_audio(
                audio_embedding, top_k=top_k * 2
            )
            for result in audio_results:
                vec_id = result["vector_id"]
                if vec_id not in results_map:
                    results_map[vec_id] = result.copy()
                    results_map[vec_id]["combined_score"] = 0
                results_map[vec_id]["combined_score"] += (
                    result["similarity_score"] * audio_weight
                )
                results_map[vec_id]["audio_score"] = result["similarity_score"]

        # Sort by combined score and return top_k
        sorted_results = sorted(
            results_map.values(), key=lambda x: x["combined_score"], reverse=True
        )
        return sorted_results[:top_k]

    def clear_embedding_cache(self):
        """Clear in-memory embedding cache."""
        self._embedding_cache.clear()
        logger.info("Cleared embedding cache")
