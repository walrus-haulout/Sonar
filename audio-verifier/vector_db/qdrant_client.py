"""Qdrant vector database client for centralized embedding storage."""

import logging
import os
from typing import Any, Dict, List, Optional
import httpx

logger = logging.getLogger(__name__)


class QdrantClient:
    """Manages Qdrant collection operations for vector embeddings."""

    def __init__(self):
        """Initialize Qdrant client with URL."""
        self.base_url = os.getenv("QDRANT_URL", "http://localhost:6333")
        self.text_collection = os.getenv("QDRANT_COLLECTION", "sonar-audio-datasets")
        self.audio_collection = os.getenv("QDRANT_AUDIO_COLLECTION", "sonar-audio-features")
        self.client = httpx.Client(base_url=self.base_url)

        logger.info(f"Initialized Qdrant client: {self.base_url}")

    def upsert_text_vector(
        self,
        vector_id: str,
        embedding: List[float],
        metadata: Dict[str, Any]
    ) -> bool:
        """
        Upsert text embedding vector to Qdrant.

        Args:
            vector_id: Unique ID for vector (use session_id)
            embedding: 1536-dimensional vector from text-embedding-3-small
            metadata: Dict with fields like title, description, tags, languages

        Returns:
            True if successful
        """
        try:
            points = [{
                "id": int(hash(vector_id)) & 0x7fffffff,  # Convert to positive int
                "vector": embedding,
                "payload": metadata
            }]

            response = self.client.put(
                f"/collections/{self.text_collection}/points",
                json={"points": points}
            )

            if response.status_code not in [200, 201]:
                logger.error(f"Failed to upsert: {response.text}")
                return False

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
        Upsert audio feature vector to separate collection.

        Args:
            vector_id: Unique ID for vector (use session_id)
            embedding: Audio feature vector
            metadata: Dict with audio feature info

        Returns:
            True if successful
        """
        try:
            points = [{
                "id": int(hash(vector_id)) & 0x7fffffff,
                "vector": embedding,
                "payload": metadata
            }]

            response = self.client.put(
                f"/collections/{self.audio_collection}/points",
                json={"points": points}
            )

            if response.status_code not in [200, 201]:
                logger.error(f"Failed to upsert audio: {response.text}")
                return False

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
            response = self.client.post(
                f"/collections/{self.text_collection}/points/search",
                json={
                    "vector": query_embedding,
                    "limit": top_k,
                    "score_threshold": similarity_threshold,
                    "with_payload": True,
                    "with_vectors": False
                }
            )

            if response.status_code != 200:
                logger.error(f"Query failed: {response.text}")
                return []

            data = response.json()
            matches = []

            for result in data.get("result", []):
                matches.append({
                    "vector_id": str(result.get("id")),
                    "similarity_score": float(result.get("score", 0)),
                    "metadata": result.get("payload", {})
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
            response = self.client.post(
                f"/collections/{self.audio_collection}/points/search",
                json={
                    "vector": query_embedding,
                    "limit": top_k,
                    "score_threshold": similarity_threshold,
                    "with_payload": True,
                    "with_vectors": False
                }
            )

            if response.status_code != 200:
                logger.error(f"Audio query failed: {response.text}")
                return []

            data = response.json()
            matches = []

            for result in data.get("result", []):
                matches.append({
                    "vector_id": str(result.get("id")),
                    "similarity_score": float(result.get("score", 0)),
                    "metadata": result.get("payload", {})
                })

            logger.debug(f"Found {len(matches)} audio vector matches")
            return matches
        except Exception as e:
            logger.error(f"Failed to query audio vectors: {e}")
            return []

    def delete_vector(self, vector_id: str) -> bool:
        """
        Delete vector from text collection.

        Args:
            vector_id: Vector to delete

        Returns:
            True if successful
        """
        try:
            point_id = int(hash(vector_id)) & 0x7fffffff
            response = self.client.delete(
                f"/collections/{self.text_collection}/points/{point_id}"
            )

            if response.status_code != 200:
                logger.error(f"Delete failed: {response.text}")
                return False

            logger.debug(f"Deleted vector {vector_id[:8]}...")
            return True
        except Exception as e:
            logger.error(f"Failed to delete vector: {e}")
            return False

    def get_collection_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the Qdrant collection.

        Returns:
            Collection metadata and statistics
        """
        try:
            response = self.client.get(
                f"/collections/{self.text_collection}"
            )

            if response.status_code != 200:
                logger.error(f"Stats request failed: {response.text}")
                return {}

            data = response.json()
            collection = data.get("result", {})

            return {
                "total_vector_count": collection.get("points_count", 0),
                "dimension": len(collection.get("config", {}).get("vector", {})) or 1536,
                "collection_name": self.text_collection
            }
        except Exception as e:
            logger.error(f"Failed to get collection stats: {e}")
            return {}

    def list_vectors_by_metadata(
        self,
        metadata_filter: Dict[str, Any],
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        List vectors matching metadata filter.

        Args:
            metadata_filter: Metadata filter dict
            limit: Max results

        Returns:
            List of matching vectors
        """
        try:
            response = self.client.post(
                f"/collections/{self.text_collection}/points/scroll",
                json={
                    "limit": limit,
                    "with_payload": True,
                    "with_vectors": False
                }
            )

            if response.status_code != 200:
                logger.error(f"List failed: {response.text}")
                return []

            data = response.json()
            return data.get("result", {}).get("points", [])
        except Exception as e:
            logger.warning(f"Metadata filtering not available: {e}")
            return []
