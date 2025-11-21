"""
Audio Fingerprinting for Copyright Detection
Uses Chromaprint and AcoustID to detect copyrighted music
"""

import asyncio
import os
import tempfile
from typing import Any, Dict, Iterable, Optional

import acoustid


class CopyrightDetector:
    """Detects copyrighted audio using acoustic fingerprinting."""

    def __init__(self, acoustid_api_key: Optional[str] = None):
        """
        Args:
            acoustid_api_key: AcoustID API key (optional, uses test key if not provided)
        """
        self.api_key = acoustid_api_key or "test"
        self.confidence_threshold = 0.8  # 80% match threshold

    async def check_copyright(self, audio_bytes: bytes) -> Dict[str, Any]:
        """
        Legacy API: analyze audio from bytes by spilling to a temp file.
        """
        with tempfile.NamedTemporaryFile(suffix=".tmp", delete=False) as temp_file:
            temp_file.write(audio_bytes)
            temp_path = temp_file.name
        try:
            return await self.check_copyright_from_path(temp_path)
        finally:
            try:
                os.unlink(temp_path)
            except OSError:
                pass

    async def check_copyright_from_path(self, file_path: str) -> Dict[str, Any]:
        """
        Analyze audio directly from disk, generating a Chromaprint fingerprint.
        """
        try:
            lookup_results = await asyncio.to_thread(self._fingerprint_and_lookup, file_path)
            return self._format_results(lookup_results)
        except acoustid.NoBackendError:
            return self._error_result("Chromaprint not installed - copyright check skipped")
        except acoustid.FingerprintGenerationError:
            return self._error_result("Could not generate audio fingerprint")
        except Exception as exc:
            return self._error_result(f"AcoustID lookup failed: {exc}")

    def _fingerprint_and_lookup(self, file_path: str) -> Iterable[tuple[float, str, str, str]]:
        duration, fingerprint = acoustid.fingerprint_file(file_path)
        results = acoustid.lookup(
            self.api_key,
            fingerprint,
            duration,
        )
        # Parse raw results: extract (score, recording_id, title, artist) tuples
        for result in results.get("results", []):
            recordings = result.get("recordings", [])
            for recording in recordings:
                score = result.get("score", 0.0)
                recording_id = recording.get("id", "")
                title = recording.get("title", "")
                artist = recording.get("artists", [{}])[0].get("name", "")
                yield (score, recording_id, title, artist)

    def _format_results(self, lookup_results: Iterable[tuple[float, str, str, str]]) -> Dict[str, Any]:
        matches = []
        detected = False
        max_confidence = 0.0

        for score, recording_id, title, artist in lookup_results:
            max_confidence = max(max_confidence, score)
            if score >= self.confidence_threshold:
                detected = True
                matches.append({
                    "title": title or "Unknown",
                    "artist": artist or "Unknown",
                    "confidence": round(score, 3),
                    "recording_id": recording_id
                })

        return {
            "copyright": {
                "checked": True,
                "detected": detected,
                "confidence": round(max_confidence, 3),
                "matches": matches[:5],
                "passed": not detected
            }
        }

    def _error_result(self, message: str) -> Dict[str, Any]:
        return {
            "copyright": {
                "checked": False,
                "detected": False,
                "confidence": 0.0,
                "matches": [],
                "error": message
            }
        }
