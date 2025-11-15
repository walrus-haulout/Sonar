#!/usr/bin/env python3
"""
Export Verification Sessions to CSV.

Exports all historical verification data from PostgreSQL to CSV for analysis.
Flattens JSONB columns and calculates derived metrics.
"""

import asyncio
import asyncpg
import csv
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class VerificationExporter:
    """Exports verification sessions to CSV."""

    def __init__(self):
        """Initialize exporter."""
        self.database_url = os.getenv("DATABASE_URL")
        if not self.database_url:
            raise RuntimeError("DATABASE_URL must be set")

    async def export_to_csv(
        self,
        output_path: str = "historical_verifications.csv"
    ) -> int:
        """
        Export all verification sessions to CSV.

        Args:
            output_path: Path to output CSV file

        Returns:
            Number of records exported
        """
        pool = await asyncpg.create_pool(
            self.database_url,
            min_size=1,
            max_size=5,
            command_timeout=60
        )

        try:
            async with pool.acquire() as conn:
                # Get all completed verifications
                sessions = await conn.fetch(
                    """
                    SELECT id, verification_id, status, stage, progress,
                           created_at, updated_at, initial_data, results, error
                    FROM verification_sessions
                    WHERE status IN ('completed', 'failed')
                    ORDER BY created_at DESC
                    """
                )

                logger.info(f"Exporting {len(sessions)} verification sessions...")

                # Prepare CSV rows
                rows = []
                for session in sessions:
                    row = self._flatten_session(session)
                    rows.append(row)

                # Write to CSV
                if rows:
                    fieldnames = set()
                    for row in rows:
                        fieldnames.update(row.keys())
                    fieldnames = sorted(list(fieldnames))

                    with open(output_path, 'w', newline='', encoding='utf-8') as f:
                        writer = csv.DictWriter(f, fieldnames=fieldnames, restval='')
                        writer.writeheader()
                        writer.writerows(rows)

                    logger.info(f"✓ Exported {len(rows)} sessions to {output_path}")
                    return len(rows)
                else:
                    logger.warning("No sessions to export")
                    return 0

        finally:
            await pool.close()

    def _flatten_session(self, session: asyncpg.Record) -> Dict[str, Any]:
        """Flatten verification session record."""
        # Parse JSONB columns
        initial_data = json.loads(session["initial_data"]) if session["initial_data"] else {}
        results = json.loads(session["results"]) if session["results"] else {}

        # Extract quality metrics
        quality = results.get("quality", {})
        copyright_data = results.get("copyright", {})
        analysis = results.get("analysis", {})

        # Calculate derived metrics
        duration_seconds = initial_data.get("duration_seconds", 0)
        transcript = results.get("transcript", "")
        transcript_length = len(transcript) if transcript else 0

        # Calculate words per minute if we have duration
        wpm = 0
        if duration_seconds > 0 and transcript:
            words = len(transcript.split())
            minutes = duration_seconds / 60
            wpm = int(words / minutes) if minutes > 0 else 0

        # Calculate processing time
        created_at = session["created_at"]
        updated_at = session["updated_at"]
        processing_time = 0
        if created_at and updated_at:
            delta = updated_at - created_at
            processing_time = int(delta.total_seconds())

        # Build flattened row
        row = {
            "session_id": str(session["id"]),
            "verification_id": session["verification_id"],
            "status": session["status"],
            "stage": session["stage"],
            "progress": session["progress"],
            "created_at": session["created_at"].isoformat() if session["created_at"] else None,
            "updated_at": session["updated_at"].isoformat() if session["updated_at"] else None,
            "processing_time_seconds": processing_time,
            # Initial data fields
            "title": initial_data.get("title"),
            "description": initial_data.get("description"),
            "languages": ",".join(initial_data.get("languages", [])),
            "tags": ",".join(initial_data.get("tags", [])),
            "walrus_blob_id": initial_data.get("plaintext_cid") or initial_data.get("encrypted_cid"),
            "file_size_bytes": initial_data.get("plaintext_size_bytes"),
            "duration_seconds": duration_seconds,
            "file_format": initial_data.get("file_format"),
            # Quality metrics
            "quality_score": quality.get("score"),
            "duration_valid": quality.get("duration_valid"),
            "sample_rate": quality.get("sample_rate"),
            "channels": quality.get("channels"),
            "bit_depth": quality.get("bit_depth"),
            "rms_db": quality.get("rms_db"),
            "clipping_detected": quality.get("clipping_detected"),
            "silence_percent": quality.get("silence_percent"),
            # Copyright data
            "copyright_detected": copyright_data.get("high_confidence_copyright"),
            "copyright_confidence": copyright_data.get("highest_confidence"),
            "matched_songs": ",".join(copyright_data.get("matched_songs", [])),
            "matched_artists": ",".join(copyright_data.get("matched_artists", [])),
            # Transcript data
            "transcript_preview": results.get("transcriptPreview", ""),
            "transcript_length": transcript_length,
            "words_per_minute": wpm,
            # Analysis data
            "ai_quality_score": analysis.get("qualityScore"),
            "safety_passed": results.get("safetyPassed"),
            "ai_insights": " | ".join(analysis.get("insights", [])),
            "ai_concerns": " | ".join(analysis.get("concerns", [])),
            "ai_recommendations": " | ".join(analysis.get("recommendations", [])),
            # Overall approval
            "approved": results.get("approved"),
            "error": session["error"]
        }

        return row


async def main():
    """Main export function."""
    exporter = VerificationExporter()

    # Determine output path
    output_file = Path("/Users/angel/Projects/sonar/audio-verifier/exports/historical_verifications.csv")
    output_file.parent.mkdir(exist_ok=True)

    # Export
    count = await exporter.export_to_csv(str(output_file))
    logger.info(f"Export complete: {count} records")


if __name__ == "__main__":
    asyncio.run(main())
