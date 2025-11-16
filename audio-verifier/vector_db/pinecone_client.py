"""Pinecone vector database client for centralized embedding storage."""

import logging
import os
from typing import Any, Dict, List, Optional, Tuple
from pinecone import Pinecone

logger = logging.getLogger(__name__)


class PineconeClient:
    """Manages Pinecone index operations for vector embeddings."""

    def __init__(self):
        """Initialize Pinecone client with API key and environment."""
        api_key = os.getenv("PINECONE_API_KEY")
        if not api_key:
            raise RuntimeError("PINECONE_API_KEY must be set")

        self.client = Pinecone(api_key=api_key)
        self.text_index_name = os.getenv("PINECONE_TEXT_INDEX", "sonar-audio-datasets")
        self.audio_index_name = os.getenv("PINECONE_AUDIO_INDEX", "sonar-audio-features")
        
        # Get index references for both text and audio
        try:
            self.text_index = self.client.Index(self.text_index_name)
            logger.info(f"Connected to Pinecone text index: {self.text_index_name}")
        except Exception as e:
            logger.error(f"Failed to connect to text index: {e}")
            raise
        
        try:
            self.audio_index = self.client.Index(self.audio_index_name)
            logger.info(f"Connected to Pinecone audio index: {self.audio_index_name}")
        except Exception as e:
            logger.warning(f"Failed to connect to audio index (optional): {e}")
            self.audio_index = None

    def upsert_text_vector(
        self,
        vector_id: str,
        embedding: List[float],
        metadata: Dict[str, Any]
    ) -> bool:
        """
        Upsert text embedding vector to Pinecone.

        Args:
            vector_id: Unique ID for vector (use session_id)
            embedding: 1536-dimensional vector from text-embedding-3-small
            metadata: Dict with fields like title, description, tags, languages, verification_id

        Returns:
            True if successful
        """
        try:
            self.text_index.upsert(
                vectors=[(vector_id, embedding, metadata)],
                namespace="default"
            )
            logger.debug(f"Upserted text vector {vector_id[:8]}...")
            return True
        except Exception as e:
            logger.error(f"Failed to upsert text vector: {e}")
            return False

    def upsert_audio_vector(
        self,
        vector_id: str,
        embedding: List[float],
        metadata: Dict[str, Any]
    ) -> bool:
        """
        Upsert audio feature vector to separate namespace.

        Args:
            vector_id: Unique ID for vector (use session_id)
            embedding: Audio feature vector (variable dimension)
            metadata: Dict with audio feature info

        Returns:
            True if successful
        """
        if not self.audio_index:
            logger.warning("Audio index not available, skipping audio vector upsert")
            return False

        try:
            self.audio_index.upsert(
                vectors=[(vector_id, embedding, metadata)],
                namespace="audio-features"
            )
            logger.debug(f"Upserted audio vector {vector_id[:8]}...")
            return True
        except Exception as e:
            logger.error(f"Failed to upsert audio vector: {e}")
            return False

    def query_text_vectors(
        self,
        query_embedding: List[float],
        top_k: int = 10,
        similarity_threshold: float = 0.7
    ) -> List[Dict[str, Any]]:
        """
        Query text vectors using semantic similarity.

        Args:
            query_embedding: Query vector
            top_k: Number of results to return
            similarity_threshold: Minimum score threshold

        Returns:
            List of matching vectors with scores and metadata
        """
        try:
            results = self.text_index.query(
                vector=query_embedding,
                top_k=top_k,
                namespace="default",
                include_metadata=True
            )

            matches = []
            for match in results.get("matches", []):
                if match.get("score", 0) >= similarity_threshold:
                    matches.append({
                        "vector_id": match.get("id"),
                        "similarity_score": float(match.get("score", 0)),
                        "metadata": match.get("metadata", {})
                    })

            logger.debug(f"Found {len(matches)} text vector matches")
            return matches
        except Exception as e:
            logger.error(f"Failed to query text vectors: {e}")
            return []

    def query_audio_vectors(
        self,
        query_embedding: List[float],
        top_k: int = 10,
        similarity_threshold: float = 0.7
    ) -> List[Dict[str, Any]]:
        """
        Query audio feature vectors using similarity.

        Args:
            query_embedding: Query audio vector
            top_k: Number of results to return
            similarity_threshold: Minimum score threshold

        Returns:
            List of matching audio vectors with scores and metadata
        """
        try:
            audio_index = self.client.Index(self.audio_index_name)
            results = audio_index.query(
                vector=query_embedding,
                top_k=top_k,
                namespace="audio-features",
                include_metadata=True
            )

            matches = []
            for match in results.get("matches", []):
                if match.get("score", 0) >= similarity_threshold:
                    matches.append({
                        "vector_id": match.get("id"),
                        "similarity_score": float(match.get("score", 0)),
                        "metadata": match.get("metadata", {})
                    })

            logger.debug(f"Found {len(matches)} audio vector matches")
            return matches
        except Exception as e:
            logger.error(f"Failed to query audio vectors: {e}")
            return []

    def delete_vector(self, vector_id: str) -> bool:
        """
        Delete vector from text index.

        Args:
            vector_id: Vector to delete

        Returns:
            True if successful
        """
        try:
            self.text_index.delete(ids=[vector_id], namespace="default")
            logger.debug(f"Deleted vector {vector_id[:8]}...")
            return True
        except Exception as e:
            logger.error(f"Failed to delete vector: {e}")
            return False

    def get_index_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the Pinecone index.

        Returns:
            Index metadata and statistics
        """
        try:
            stats = self.text_index.describe_index_stats()
            return {
                "total_vector_count": stats.get("total_vector_count", 0),
                "dimension": stats.get("dimension", 0),
                "namespaces": stats.get("namespaces", {})
            }
        except Exception as e:
            logger.error(f"Failed to get index stats: {e}")
            return {}

    def list_vectors_by_metadata(
        self,
        metadata_filter: Dict[str, Any],
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        List vectors matching metadata filter (requires Pinecone Pro).

        Args:
            metadata_filter: Metadata filter dict
            limit: Max results

        Returns:
            List of matching vectors
        """
        try:
            results = self.text_index.query(
                vector=[0.0] * 1536,  # dummy vector
                filter=metadata_filter,
                top_k=limit,
                namespace="default",
                include_metadata=True
            )
            return results.get("matches", [])
        except Exception as e:
            logger.warning(f"Metadata filtering not available: {e}")
            return []
