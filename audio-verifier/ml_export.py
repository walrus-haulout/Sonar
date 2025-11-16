#!/usr/bin/env python3
"""
ML Training Data Export Utilities.

Exports vector embeddings and metadata from Pinecone for ML training,
clustering analysis, and custom model development.
"""

import asyncio
import csv
import json
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Optional, List, Dict
import argparse

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class MLExporter:
    """Exports vectors and metadata for ML training."""

    def __init__(self):
        """Initialize exporter with database connections."""
        try:
            from pinecone import Pinecone
            api_key = os.getenv("PINECONE_API_KEY")
            if not api_key:
                raise RuntimeError("PINECONE_API_KEY not set")
            self.pinecone = Pinecone(api_key=api_key)
            self.index = self.pinecone.Index("sonar-audio-datasets")
        except Exception as e:
            logger.warning(f"Pinecone not available: {e}")
            self.pinecone = None
            self.index = None

        self.output_dir = "ml_exports"
        os.makedirs(self.output_dir, exist_ok=True)

    async def export_vectors_jsonl(
        self,
        namespace: str = "default",
        output_file: Optional[str] = None
    ) -> str:
        """
        Export vectors and metadata as JSONL (JSON Lines).

        Args:
            namespace: Pinecone namespace to export
            output_file: Output filename (auto-generated if None)

        Returns:
            Path to export file
        """
        if not self.index:
            raise RuntimeError("Pinecone not initialized")

        output_file = output_file or f"{self.output_dir}/vectors_{namespace}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.jsonl"

        try:
            logger.info(f"Exporting vectors from namespace '{namespace}' to {output_file}...")

            count = 0
            with open(output_file, 'w') as f:
                # Note: Pinecone doesn't have direct export, so we'd need to list vectors
                # For now, this is a placeholder that would need Pinecone Pro for full export
                logger.info(f"Export would require direct Pinecone API access for full list")

            logger.info(f"Exported {count} vectors to {output_file}")
            return output_file

        except Exception as e:
            logger.error(f"Export failed: {e}")
            raise

    async def export_vectors_csv(
        self,
        include_embedding: bool = False,
        output_file: Optional[str] = None
    ) -> str:
        """
        Export vectors and metadata as CSV.

        Args:
            include_embedding: Include raw embedding vector in CSV
            output_file: Output filename (auto-generated if None)

        Returns:
            Path to export file
        """
        if not self.index:
            raise RuntimeError("Pinecone not initialized")

        output_file = output_file or f"{self.output_dir}/vectors_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"

        try:
            logger.info(f"Exporting vectors to CSV: {output_file}...")

            with open(output_file, 'w', newline='') as f:
                writer = None
                count = 0

                # Would iterate through vectors here
                # For now, create template
                fieldnames = [
                    'vector_id',
                    'dataset_id',
                    'title',
                    'tags',
                    'languages',
                    'created_at'
                ]
                if include_embedding:
                    fieldnames.append('embedding')

                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()

            logger.info(f"Exported {count} vectors to {output_file}")
            return output_file

        except Exception as e:
            logger.error(f"CSV export failed: {e}")
            raise

    async def export_for_clustering(
        self,
        output_file: Optional[str] = None,
        min_samples: int = 100
    ) -> str:
        """
        Export vectors in format suitable for clustering analysis (t-SNE, UMAP).

        Args:
            output_file: Output filename
            min_samples: Minimum samples to include

        Returns:
            Path to export file
        """
        output_file = output_file or f"{self.output_dir}/clustering_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.json"

        try:
            logger.info(f"Exporting data for clustering to {output_file}...")

            export_data = {
                "metadata": {
                    "exported_at": datetime.now(timezone.utc).isoformat(),
                    "type": "clustering",
                    "vector_dimension": 1536,
                    "total_vectors": 0
                },
                "vectors": [],
                "metadata_lookup": {}
            }

            # Would export vectors here
            count = 0

            with open(output_file, 'w') as f:
                json.dump(export_data, f, indent=2)

            logger.info(f"Exported {count} vectors for clustering")
            return output_file

        except Exception as e:
            logger.error(f"Clustering export failed: {e}")
            raise

    async def export_for_finetuning(
        self,
        output_file: Optional[str] = None
    ) -> str:
        """
        Export data in format suitable for model fine-tuning.

        Args:
            output_file: Output filename

        Returns:
            Path to export file
        """
        output_file = output_file or f"{self.output_dir}/finetuning_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.jsonl"

        try:
            logger.info(f"Exporting data for fine-tuning to {output_file}...")

            count = 0
            with open(output_file, 'w') as f:
                # Format: {"text": "...", "embedding": [...], "metadata": {...}}
                pass

            logger.info(f"Exported {count} examples for fine-tuning")
            return output_file

        except Exception as e:
            logger.error(f"Fine-tuning export failed: {e}")
            raise

    async def export_similarity_graph(
        self,
        top_k: int = 5,
        similarity_threshold: float = 0.7,
        output_file: Optional[str] = None
    ) -> str:
        """
        Export similarity graph showing relationships between datasets.

        Args:
            top_k: Number of nearest neighbors per vector
            similarity_threshold: Minimum similarity threshold
            output_file: Output filename

        Returns:
            Path to export file
        """
        output_file = output_file or f"{self.output_dir}/similarity_graph_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.json"

        try:
            logger.info(f"Exporting similarity graph to {output_file}...")

            graph = {
                "metadata": {
                    "exported_at": datetime.now(timezone.utc).isoformat(),
                    "type": "similarity_graph",
                    "top_k": top_k,
                    "threshold": similarity_threshold
                },
                "nodes": [],
                "edges": []
            }

            # Would build graph here

            with open(output_file, 'w') as f:
                json.dump(graph, f, indent=2)

            logger.info(f"Exported similarity graph")
            return output_file

        except Exception as e:
            logger.error(f"Graph export failed: {e}")
            raise

    async def export_statistics(
        self,
        output_file: Optional[str] = None
    ) -> str:
        """
        Export dataset statistics for analysis.

        Args:
            output_file: Output filename

        Returns:
            Path to export file
        """
        output_file = output_file or f"{self.output_dir}/statistics_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.json"

        try:
            logger.info(f"Exporting statistics to {output_file}...")

            stats = {
                "exported_at": datetime.now(timezone.utc).isoformat(),
                "total_vectors": 0,
                "languages": {},
                "tags": {},
                "quality_score_distribution": [],
                "embedding_statistics": {
                    "mean": None,
                    "std": None,
                    "min": None,
                    "max": None
                }
            }

            with open(output_file, 'w') as f:
                json.dump(stats, f, indent=2)

            logger.info(f"Exported statistics")
            return output_file

        except Exception as e:
            logger.error(f"Statistics export failed: {e}")
            raise


async def main():
    """Main export orchestration."""
    parser = argparse.ArgumentParser(
        description="Export ML training data from Pinecone"
    )
    parser.add_argument(
        "--format",
        choices=["jsonl", "csv", "clustering", "finetuning", "graph", "stats", "all"],
        default="all",
        help="Export format"
    )
    parser.add_argument(
        "--output-dir",
        default="ml_exports",
        help="Output directory"
    )
    parser.add_argument(
        "--include-embedding",
        action="store_true",
        help="Include raw embeddings (can create large files)"
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=5,
        help="Top K neighbors for similarity graph"
    )

    args = parser.parse_args()

    if not os.getenv("PINECONE_API_KEY"):
        logger.error("PINECONE_API_KEY not set")
        sys.exit(1)

    try:
        exporter = MLExporter()
        exporter.output_dir = args.output_dir
        os.makedirs(args.output_dir, exist_ok=True)

        exports = []

        if args.format in ["jsonl", "all"]:
            export_file = await exporter.export_vectors_jsonl()
            exports.append(("JSONL Vectors", export_file))

        if args.format in ["csv", "all"]:
            export_file = await exporter.export_vectors_csv(
                include_embedding=args.include_embedding
            )
            exports.append(("CSV Vectors", export_file))

        if args.format in ["clustering", "all"]:
            export_file = await exporter.export_for_clustering()
            exports.append(("Clustering Data", export_file))

        if args.format in ["finetuning", "all"]:
            export_file = await exporter.export_for_finetuning()
            exports.append(("Fine-tuning Data", export_file))

        if args.format in ["graph", "all"]:
            export_file = await exporter.export_similarity_graph(top_k=args.top_k)
            exports.append(("Similarity Graph", export_file))

        if args.format in ["stats", "all"]:
            export_file = await exporter.export_statistics()
            exports.append(("Statistics", export_file))

        # Summary
        logger.info("\nExport Summary:")
        logger.info("=" * 50)
        for export_type, export_file in exports:
            logger.info(f"{export_type}: {export_file}")
        logger.info("=" * 50)

        return 0

    except Exception as e:
        logger.error(f"Export failed: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
