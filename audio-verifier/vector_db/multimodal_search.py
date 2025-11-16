"""
Multi-Modal Search combining text and audio embeddings.

Enables search using:
- Text queries (title, description, tags)
- Audio features (spectrograms, MFCCs)
- Combined text + audio for comprehensive similarity
"""

import logging
from typing import Any, Dict, List, Optional
from .vector_service import VectorService
from .pinecone_client import PineconeClient

logger = logging.getLogger(__name__)


class MultiModalSearch:
    """Unified search across text and audio modalities."""

    def __init__(self):
        """Initialize multi-modal search with vector services."""
        self.vector_service = VectorService()
        self.pinecone = PineconeClient()

    async def search_by_text(
        self,
        query: str,
        top_k: int = 10,
        threshold: float = 0.7
    ) -> List[Dict[str, any]]:
        """
        Search by text query.

        Args:
            query: Text query
            top_k: Number of results
            threshold: Similarity threshold

        Returns:
            List of results with scores and metadata
        """
        return await self.vector_service.search_similar_text(
            query,
            top_k=top_k,
            similarity_threshold=threshold
        )

    async def search_by_audio(
        self,
        audio_embedding: List[float],
        top_k: int = 10,
        threshold: float = 0.7
    ) -> List[Dict[str, any]]:
        """
        Search by audio feature vector.

        Args:
            audio_embedding: Audio feature vector
            top_k: Number of results
            threshold: Similarity threshold

        Returns:
            List of results with scores and metadata
        """
        return await self.vector_service.search_similar_audio(
            audio_embedding,
            top_k=top_k,
            similarity_threshold=threshold
        )

    async def search_combined(
        self,
        query: Optional[str] = None,
        audio_embedding: Optional[List[float]] = None,
        top_k: int = 10,
        threshold: float = 0.7,
        text_weight: float = 0.6,
        audio_weight: float = 0.4
    ) -> List[Dict[str, Any]]:
        """
        Combined search using text and/or audio.

        Args:
            query: Optional text query
            audio_embedding: Optional audio vector
            top_k: Number of results
            threshold: Similarity threshold
            text_weight: Weight for text similarity (0-1)
            audio_weight: Weight for audio similarity (0-1)

        Returns:
            Ranked results combining both modalities
        """
        if not query and not audio_embedding:
            logger.warning("No query provided for search")
            return []

        # Normalize weights
        total_weight = text_weight + audio_weight
        if total_weight == 0:
            total_weight = 1
        text_weight /= total_weight
        audio_weight /= total_weight

        results_map: Dict[str, Dict[str, Any]] = {}

        # Search by text
        if query:
            text_results = await self.search_by_text(query, top_k=top_k * 2, threshold=threshold)
            for result in text_results:
                vec_id = result["vector_id"]
                if vec_id not in results_map:
                    results_map[vec_id] = {
                        "vector_id": vec_id,
                        "metadata": result.get("metadata", {}),
                        "combined_score": 0,
                        "scores": {}
                    }
                results_map[vec_id]["combined_score"] += (
                    result["similarity_score"] * text_weight
                )
                results_map[vec_id]["scores"]["text"] = result["similarity_score"]

        # Search by audio
        if audio_embedding:
            audio_results = await self.search_by_audio(
                audio_embedding,
                top_k=top_k * 2,
                threshold=threshold
            )
            for result in audio_results:
                vec_id = result["vector_id"]
                if vec_id not in results_map:
                    results_map[vec_id] = {
                        "vector_id": vec_id,
                        "metadata": result.get("metadata", {}),
                        "combined_score": 0,
                        "scores": {}
                    }
                results_map[vec_id]["combined_score"] += (
                    result["similarity_score"] * audio_weight
                )
                results_map[vec_id]["scores"]["audio"] = result["similarity_score"]

        # Sort by combined score
        sorted_results = sorted(
            results_map.values(),
            key=lambda x: x["combined_score"],
            reverse=True
        )

        return sorted_results[:top_k]

    async def search_with_filtering(
        self,
        query: Optional[str] = None,
        audio_embedding: Optional[List[float]] = None,
        filters: Optional[Dict[str, Any]] = None,
        top_k: int = 10,
        threshold: float = 0.7
    ) -> List[Dict[str, Any]]:
        """
        Combined search with metadata filtering.

        Args:
            query: Optional text query
            audio_embedding: Optional audio vector
            filters: Metadata filters (languages, tags, quality_score_min, etc.)
            top_k: Number of results
            threshold: Similarity threshold

        Returns:
            Filtered and ranked results
        """
        results = await self.search_combined(
            query=query,
            audio_embedding=audio_embedding,
            top_k=top_k * 2,
            threshold=threshold
        )

        if not filters:
            return results[:top_k]

        # Apply filters
        filtered = []
        for result in results:
            metadata = result.get("metadata", {})

            # Language filter
            if "languages" in filters:
                if not any(lang in metadata.get("languages", []) for lang in filters["languages"]):
                    continue

            # Tag filter
            if "tags" in filters:
                if not any(tag in metadata.get("tags", []) for tag in filters["tags"]):
                    continue

            # Quality score filter
            if "quality_score_min" in filters:
                if metadata.get("quality_score", 0) < filters["quality_score_min"]:
                    continue

            # Creator filter
            if "creator" in filters:
                if metadata.get("creator") != filters["creator"]:
                    continue

            filtered.append(result)

            if len(filtered) >= top_k:
                break

        return filtered

    async def get_recommendations(
        self,
        dataset_id: str,
        num_recommendations: int = 5,
        strategy: str = "similar"
    ) -> List[Dict[str, Any]]:
        """
        Get dataset recommendations based on similarity.

        Args:
            dataset_id: Reference dataset ID
            num_recommendations: Number of recommendations
            strategy: "similar" (most similar) or "diverse" (varied but related)

        Returns:
            List of recommended datasets
        """
        try:
            # Fetch dataset metadata from Pinecone or database
            # This would query the vector by ID and use its embedding
            logger.info(f"Getting {strategy} recommendations for dataset {dataset_id}")

            if strategy == "diverse":
                # For diverse recommendations, we'd want to diversify results
                # using maximal margin sampling or similar techniques
                pass

            return []

        except Exception as e:
            logger.error(f"Failed to get recommendations: {e}")
            return []

    async def get_semantic_clusters(
        self,
        num_clusters: int = 10,
        sample_size: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Get semantic clusters of similar datasets.

        Args:
            num_clusters: Number of clusters
            sample_size: Sample size (None for all vectors)

        Returns:
            List of clusters with representative datasets
        """
        try:
            logger.info(f"Computing {num_clusters} semantic clusters...")
            # Would use clustering algorithm on embeddings
            # Returns cluster assignments and representatives
            return []

        except Exception as e:
            logger.error(f"Failed to compute clusters: {e}")
            return []

    async def get_trending_topics(
        self,
        time_window_days: int = 7,
        top_n: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get trending topics based on search queries and embeddings.

        Args:
            time_window_days: Look back window
            top_n: Top N topics to return

        Returns:
            List of trending topics with metadata
        """
        try:
            logger.info(f"Computing trending topics (last {time_window_days} days)...")
            # Would aggregate search queries and compute trends
            return []

        except Exception as e:
            logger.error(f"Failed to compute trending topics: {e}")
            return []
