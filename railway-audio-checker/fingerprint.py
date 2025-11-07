"""
Audio Fingerprinting for Copyright Detection
Uses Chromaprint and AcoustID to detect copyrighted music
"""

import acoustid
import io
from typing import Dict, Any, Optional
from pydub import AudioSegment


class CopyrightDetector:
    """Detects copyrighted audio using acoustic fingerprinting"""

    def __init__(self, acoustid_api_key: Optional[str] = None):
        """
        Initialize copyright detector

        Args:
            acoustid_api_key: AcoustID API key (optional, uses test key if not provided)
        """
        # Note: Get a free API key at https://acoustid.org/api-key
        self.api_key = acoustid_api_key or "test"  # Replace with actual key
        self.confidence_threshold = 0.8  # 80% match threshold

    async def check_copyright(self, audio_bytes: bytes) -> Dict[str, Any]:
        """
        Check if audio contains copyrighted content

        Args:
            audio_bytes: Raw audio file bytes

        Returns:
            Dict with copyright detection results
        """
        try:
            # Convert audio to format suitable for fingerprinting
            audio = AudioSegment.from_file(io.BytesIO(audio_bytes))

            # Chromaprint works best with specific formats
            # Export as WAV for fingerprinting
            wav_io = io.BytesIO()
            audio.export(wav_io, format="wav")
            wav_bytes = wav_io.getvalue()

            # Generate fingerprint and query AcoustID
            matches = []
            detected = False
            max_confidence = 0.0

            try:
                # Duration in seconds (required by AcoustID)
                duration = len(audio) / 1000.0

                # Query AcoustID API
                results = acoustid.match(
                    self.api_key,
                    wav_bytes,
                    parse=True,
                    force_fpcalc=True
                )

                # Process results
                for score, recording_id, title, artist in results:
                    if score >= self.confidence_threshold:
                        detected = True
                        matches.append({
                            "title": title or "Unknown",
                            "artist": artist or "Unknown",
                            "confidence": round(score, 3),
                            "recording_id": recording_id
                        })
                    max_confidence = max(max_confidence, score)

            except acoustid.NoBackendError:
                # Chromaprint binary not found
                return {
                    "copyright": {
                        "checked": False,
                        "detected": False,
                        "confidence": 0.0,
                        "matches": [],
                        "error": "Chromaprint not installed - copyright check skipped"
                    }
                }
            except acoustid.FingerprintGenerationError:
                # Could not generate fingerprint
                return {
                    "copyright": {
                        "checked": False,
                        "detected": False,
                        "confidence": 0.0,
                        "matches": [],
                        "error": "Could not generate audio fingerprint"
                    }
                }
            except Exception as e:
                # Other AcoustID errors (API issues, etc.)
                return {
                    "copyright": {
                        "checked": False,
                        "detected": False,
                        "confidence": 0.0,
                        "matches": [],
                        "error": f"AcoustID lookup failed: {str(e)}"
                    }
                }

            return {
                "copyright": {
                    "checked": True,
                    "detected": detected,
                    "confidence": round(max_confidence, 3),
                    "matches": matches[:5],  # Return top 5 matches
                    "passed": not detected
                }
            }

        except Exception as e:
            return {
                "copyright": {
                    "checked": False,
                    "detected": False,
                    "confidence": 0.0,
                    "matches": [],
                    "error": f"Failed to check copyright: {str(e)}"
                }
            }

    def _format_match(self, score: float, title: str, artist: str) -> str:
        """Format a match result as a string"""
        confidence_pct = score * 100
        if artist:
            return f"{title} by {artist} ({confidence_pct:.1f}% match)"
        return f"{title} ({confidence_pct:.1f}% match)"
