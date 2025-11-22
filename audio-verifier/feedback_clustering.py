"""Clustering and theme detection for user feedback.

Uses scikit-learn to cluster feedback embeddings into semantic themes.
Supports both DBSCAN (density-based) and KMeans (fixed K) clustering.
"""

import asyncpg
import logging
import os
from typing import List, Dict, Any, Optional

import numpy as np
from sklearn.cluster import DBSCAN, KMeans

logger = logging.getLogger(__name__)


class FeedbackClusterer:
    """Cluster feedback into semantic themes."""

    def __init__(self, database_url: Optional[str] = None):
        """Initialize feedback clusterer.

        Args:
            database_url: PostgreSQL connection URL (defaults to DATABASE_URL env var)
        """
        self.database_url = database_url or os.getenv("DATABASE_URL")
        self._pool: Optional[asyncpg.Pool] = None

    async def _get_pool(self) -> asyncpg.Pool:
        """Get or create PostgreSQL connection pool."""
        if self._pool is None:
            self._pool = await asyncpg.create_pool(
                self.database_url, min_size=1, max_size=10
            )
        return self._pool

    async def cluster_feedback(
        self,
        method: str = "dbscan",
        min_samples: int = 3,
        eps: float = 0.3,
        num_clusters: int = 10,
        vote_filter: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Cluster feedback into themes.

        Uses either DBSCAN (density-based) or KMeans (fixed K) clustering.
        DBSCAN automatically discovers the number of clusters and handles outliers.
        KMeans requires specifying K but can be useful for fixed-size groupings.

        Args:
            method: 'dbscan' (default) or 'kmeans'
            min_samples: DBSCAN only - min points per cluster (default: 3)
            eps: DBSCAN only - max distance between points (default: 0.3)
            num_clusters: KMeans only - number of clusters (default: 10)
            vote_filter: Filter by 'helpful' or 'not_helpful' (optional)

        Returns:
            List of clusters with metadata and representative feedback
        """
        pool = await self._get_pool()

        try:
            # Fetch all feedback with embeddings
            async with pool.acquire() as conn:
                vote_clause = "AND vote = $1" if vote_filter else ""
                params = [vote_filter] if vote_filter else []

                results = await conn.fetch(
                    f"""
                    SELECT id, feedback_text, session_id, vote, embedding, created_at
                    FROM verification_feedback
                    WHERE embedding IS NOT NULL
                    AND feedback_text IS NOT NULL
                    AND feedback_text != ''
                    {vote_clause}
                    ORDER BY created_at DESC
                    """,
                    *params,
                )

            if len(results) < min_samples:
                logger.warning(
                    f"Not enough feedback to cluster: {len(results)} < {min_samples}"
                )
                return []

            logger.info(f"Clustering {len(results)} feedback items using {method}...")

            # Convert to numpy array
            embeddings = np.array([list(r["embedding"]) for r in results])
            feedback_ids = [str(r["id"]) for r in results]
            feedback_texts = [r["feedback_text"] for r in results]
            votes = [r["vote"] for r in results]

            # Cluster using chosen method
            if method == "dbscan":
                clusterer = DBSCAN(eps=eps, min_samples=min_samples, metric="cosine")
                labels = clusterer.fit_predict(embeddings)
            else:  # kmeans
                clusterer = KMeans(n_clusters=num_clusters, random_state=42, n_init=10)
                labels = clusterer.fit_predict(embeddings)

            # Organize results by cluster
            clusters = {}
            for idx, label in enumerate(labels):
                if label == -1:  # DBSCAN noise point - skip
                    continue
                if label not in clusters:
                    clusters[label] = []
                clusters[label].append(
                    {
                        "feedback_id": feedback_ids[idx],
                        "text": feedback_texts[idx],
                        "session_id": str(results[idx]["session_id"]),
                        "vote": votes[idx],
                        "embedding_idx": idx,
                    }
                )

            # Format output with cluster summaries
            output = []
            for cluster_id, items in clusters.items():
                # Get cluster indices to compute centroid
                cluster_indices = [item["embedding_idx"] for item in items]
                centroid = embeddings[cluster_indices].mean(axis=0)

                # Select representative feedback (closest to centroid)
                distances = [
                    np.linalg.norm(embeddings[idx] - centroid) for idx in cluster_indices
                ]
                rep_idx = cluster_indices[np.argmin(distances)]

                # Count vote distribution in cluster
                helpful_count = sum(1 for item in items if item["vote"] == "helpful")
                not_helpful_count = len(items) - helpful_count

                output.append(
                    {
                        "cluster_id": int(cluster_id),
                        "size": len(items),
                        "representative_text": feedback_texts[rep_idx],
                        "representative_id": feedback_ids[rep_idx],
                        "vote_distribution": {
                            "helpful": helpful_count,
                            "not_helpful": not_helpful_count,
                        },
                        "sample_feedback": items[:5],  # Top 5 per cluster
                        "centroid_quality": float(
                            1 - np.min(distances)
                        ),  # How representative is the chosen example
                    }
                )

            # Sort by cluster size (largest first)
            output.sort(key=lambda x: x["size"], reverse=True)

            logger.info(
                f"Found {len(output)} clusters from {len(results)} feedback items"
            )
            return output

        except Exception as e:
            logger.error(f"Clustering failed: {e}", exc_info=True)
            return []

    async def get_feedback_themes(
        self, top_n: int = 5, vote_filter: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get top feedback themes using DBSCAN clustering.

        Automatically discovers themes in feedback data. Useful for:
        - Identifying common user complaints ("price too high")
        - Finding praise patterns ("very accurate analysis")
        - Detecting systematic issues with the AI

        Args:
            top_n: Return top N themes (by size)
            vote_filter: Filter by 'helpful' or 'not_helpful'

        Returns:
            Top N clusters representing feedback themes
        """
        clusters = await self.cluster_feedback(
            method="dbscan",
            min_samples=3,
            eps=0.25,  # Tighter clustering to find more specific themes
            vote_filter=vote_filter,
        )

        return clusters[:top_n]

    async def analyze_feedback_quality(self) -> Dict[str, Any]:
        """Analyze overall quality of feedback data.

        Returns statistics about feedback embeddings and clustering quality.

        Returns:
            Dict with clustering statistics
        """
        pool = await self._get_pool()

        try:
            async with pool.acquire() as conn:
                stats = await conn.fetchrow(
                    """
                    SELECT
                        COUNT(*) as total,
                        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embedding,
                        COUNT(CASE WHEN vote = 'helpful' THEN 1 END) as helpful_count,
                        COUNT(CASE WHEN vote = 'not_helpful' THEN 1 END) as not_helpful_count,
                        ROUND(AVG(LENGTH(feedback_text))::numeric, 1) as avg_feedback_length
                    FROM verification_feedback
                    WHERE feedback_text IS NOT NULL
                    """
                )

            return {
                "total_feedback": stats["total"],
                "with_embedding": stats["with_embedding"],
                "coverage_percent": round(
                    100.0 * stats["with_embedding"] / max(stats["total"], 1), 2
                ),
                "helpful_feedback": stats["helpful_count"],
                "not_helpful_feedback": stats["not_helpful_count"],
                "avg_feedback_length": stats["avg_feedback_length"],
            }

        except Exception as e:
            logger.error(f"Failed to analyze feedback quality: {e}", exc_info=True)
            return {}
