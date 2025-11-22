"""
Audio Quality Checker
Analyzes technical audio quality for SONAR datasets
"""

import asyncio
import io
import logging
import mimetypes
import os
import platform
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from typing import Any, Dict, Optional

import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)


@contextmanager
def capture_c_stderr():
    """
    Capture stderr at C level (file descriptor 2) for soundfile/mpg123 warnings.

    Platform-aware: Only active on POSIX systems (Linux/macOS), no-op on Windows.
    Exception-safe: Always restores fd 2 and closes temp file, even on exceptions.

    Yields:
        Callable that returns captured stderr as string
    """
    # No-op on Windows
    if platform.system() == 'Windows':
        yield lambda: ""
        return

    # Save original stderr fd
    stderr_fd = sys.stderr.fileno()
    original_stderr_fd = None
    tmp_file = None

    try:
        # Duplicate original stderr fd (must close later)
        original_stderr_fd = os.dup(stderr_fd)

        # Create temp file for capture
        tmp_file = tempfile.TemporaryFile(mode='w+b')
        tmp_fd = tmp_file.fileno()

        # Flush before redirecting
        sys.stderr.flush()

        # Redirect stderr (fd 2) to temp file
        os.dup2(tmp_fd, stderr_fd)

        def get_stderr() -> str:
            """Read captured stderr content."""
            tmp_file.flush()
            tmp_file.seek(0)
            return tmp_file.read().decode('utf-8', errors='ignore')

        yield get_stderr

    finally:
        # ALWAYS restore original stderr, even on exception
        if original_stderr_fd is not None:
            sys.stderr.flush()
            os.dup2(original_stderr_fd, stderr_fd)
            os.close(original_stderr_fd)

        # ALWAYS close temp file
        if tmp_file is not None:
            tmp_file.close()


class AudioQualityChecker:
    """Checks audio quality metrics with streaming analysis to limit memory usage."""

    def __init__(self):
        # Quality thresholds
        self.MIN_DURATION = 1.0  # seconds
        self.MAX_DURATION = 3600.0  # 1 hour max
        self.MIN_SAMPLE_RATE = 8000  # Hz
        self.SILENCE_THRESHOLD = -50  # dB
        self.MAX_SILENCE_PERCENT = 30  # %
        self.CLIPPING_THRESHOLD = 0.99  # normalized amplitude
        self._silence_linear_threshold = 10 ** (self.SILENCE_THRESHOLD / 20.0)

    async def check_audio(self, audio_bytes: bytes) -> Dict[str, Any]:
        """
        Analyze audio quality from in-memory bytes.

        Retained for legacy endpoints where the audio is already loaded into RAM.
        """
        try:
            return await asyncio.to_thread(self._analyze_bytes, audio_bytes)
        except Exception as exc:
            return {
                "quality": None,
                "errors": [f"Failed to analyze audio: {exc}"]
            }

    async def check_audio_file(self, file_path: str, session_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Analyze audio quality from disk, streaming samples to avoid large allocations.

        Args:
            file_path: Path to audio file
            session_id: Session ID for structured logging
        """
        try:
            # Capture file metadata for diagnostics
            file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
            mime_type, _ = mimetypes.guess_type(file_path)
            log_context = f"[{session_id}] " if session_id else ""

            logger.info(
                f"{log_context}Quality check starting",
                extra={
                    "session_id": session_id,
                    "file_path": file_path,
                    "file_size_bytes": file_size,
                    "mime_type": mime_type or "unknown"
                }
            )

            return await asyncio.to_thread(self._analyze_file, file_path, session_id)
        except Exception as exc:
            logger.error(
                f"{log_context}Failed to analyze audio file: {exc}",
                extra={"session_id": session_id},
                exc_info=True
            )
            return {
                "quality": None,
                "errors": [f"Failed to analyze audio file: {exc}"]
            }

    def _analyze_file(self, file_path: str, session_id: Optional[str] = None) -> Dict[str, Any]:
        # Early format detection using ffprobe
        probe_result = self._probe_format(file_path, session_id)
        if probe_result.get("error"):
            return {
                "quality": None,
                "errors": [probe_result["error"]],
                "failure_reason": "format_probe_failed",
                "warnings": []
            }

        warnings = []

        try:
            # Capture C-level stderr (mpg123 warnings from soundfile) on POSIX systems
            with capture_c_stderr() as get_stderr:
                with sf.SoundFile(file_path) as audio_file:
                    result = self._analyze_stream(audio_file, session_id)

                # Parse any C-level warnings (mpg123, etc.)
                stderr_output = get_stderr()
                if stderr_output:
                    warnings = self._parse_audio_warnings(stderr_output)

            result["warnings"] = warnings
            return result
        except Exception as exc:
            logger.warning(
                f"Soundfile failed to read audio, attempting ffmpeg fallback: {exc}",
                extra={"session_id": session_id, "file_path": file_path}
            )

            # Try ffmpeg conversion to canonical PCM WAV
            try:
                converted_path = self._convert_with_ffmpeg(file_path, session_id)
                logger.info(
                    f"Successfully converted audio with ffmpeg",
                    extra={"session_id": session_id}
                )
                try:
                    with capture_c_stderr() as get_stderr:
                        with sf.SoundFile(converted_path) as audio_file:
                            result = self._analyze_stream(audio_file, session_id)

                        # Capture warnings from converted file too
                        stderr_output = get_stderr()
                        if stderr_output:
                            warnings = self._parse_audio_warnings(stderr_output)

                    result["failure_reason"] = "converted_with_ffmpeg"
                    result["warnings"] = warnings
                    return result
                finally:
                    # Clean up temporary converted file
                    if os.path.exists(converted_path):
                        os.unlink(converted_path)
            except Exception as ffmpeg_exc:
                logger.error(
                    f"Both soundfile and ffmpeg fallback failed: {ffmpeg_exc}",
                    extra={"session_id": session_id, "file_path": file_path},
                    exc_info=True
                )
                return {
                    "quality": None,
                    "errors": [f"Failed to analyze audio: soundfile and ffmpeg both failed"],
                    "failure_reason": "analysis_failed",
                    "warnings": []
                }

    def _analyze_bytes(self, audio_bytes: bytes) -> Dict[str, Any]:
        with sf.SoundFile(io.BytesIO(audio_bytes)) as audio_file:
            return self._analyze_stream(audio_file)

    def _analyze_stream(self, audio_file: sf.SoundFile, session_id: Optional[str] = None) -> Dict[str, Any]:
        audio_file.seek(0)
        sample_rate = audio_file.samplerate
        channels = audio_file.channels
        subtype = audio_file.subtype or ""
        duration = len(audio_file) / float(sample_rate) if sample_rate else 0.0
        bit_depth = self._bit_depth_from_subtype(subtype)

        logger.debug(
            "Audio format detected",
            extra={
                "session_id": session_id,
                "sample_rate": sample_rate,
                "channels": channels,
                "subtype": subtype,
                "bit_depth": bit_depth,
                "duration_seconds": duration
            }
        )

        if duration <= 0 or sample_rate <= 0:
            error_msg = f"Invalid audio metadata: duration={duration}s, sample_rate={sample_rate}Hz"
            logger.warning(error_msg, extra={"session_id": session_id})
            raise ValueError(error_msg)

        block_frames = max(sample_rate // 2, 4096)  # roughly 0.5s per block

        total_samples = 0
        silence_samples = 0
        sum_squares = 0.0
        clipping_detected = False

        while True:
            block = audio_file.read(block_frames, dtype="float32", always_2d=True)
            if block.size == 0:
                break

            # Convert multi-channel audio to mono for aggregate checks
            block_mono = block.mean(axis=1, dtype=np.float32)
            abs_block = np.abs(block_mono)

            total_samples += block_mono.size
            silence_samples += int(np.sum(abs_block < self._silence_linear_threshold))
            sum_squares += float(np.sum(block_mono ** 2))

            if not clipping_detected and np.any(abs_block >= self.CLIPPING_THRESHOLD):
                clipping_detected = True

        if total_samples == 0:
            raise ValueError("Audio file contained no samples")

        rms = np.sqrt(sum_squares / total_samples)
        rms_db = 20 * np.log10(max(rms, 1e-10))
        silence_percent = (silence_samples / total_samples) * 100.0
        volume_ok = -40 <= rms_db <= -6

        passed = all([
            self.MIN_DURATION <= duration <= self.MAX_DURATION,
            sample_rate >= self.MIN_SAMPLE_RATE,
            not clipping_detected,
            silence_percent < self.MAX_SILENCE_PERCENT,
            volume_ok
        ])

        quality = {
            "duration": round(duration, 2),
            "sample_rate": sample_rate,
            "channels": channels,
            "bit_depth": bit_depth,
            "volume_ok": volume_ok,
            "rms_db": round(rms_db, 2),
            "clipping_detected": clipping_detected,
            "silence_percent": round(silence_percent, 2),
            "quality_score": self._calculate_quality_score(passed, volume_ok, clipping_detected, silence_percent),
            "passed": passed
        }

        errors = self._get_errors(duration, sample_rate, clipping_detected, silence_percent, volume_ok, subtype)

        result = {
            "quality": quality,
            "errors": errors
        }

        if not passed:
            # Determine specific failure reason
            if clipping_detected:
                result["failure_reason"] = "clipping_detected"
            elif silence_percent >= self.MAX_SILENCE_PERCENT:
                result["failure_reason"] = "excessive_silence"
            elif not volume_ok:
                result["failure_reason"] = "volume_out_of_range"
            elif sample_rate < self.MIN_SAMPLE_RATE:
                result["failure_reason"] = "sample_rate_too_low"
            elif duration < self.MIN_DURATION or duration > self.MAX_DURATION:
                result["failure_reason"] = "duration_out_of_range"
            else:
                result["failure_reason"] = "quality_check_failed"

            logger.warning(
                "Quality check failed",
                extra={
                    "session_id": session_id,
                    "quality": quality,
                    "errors": errors,
                    "failure_reason": result["failure_reason"]
                }
            )
        else:
            logger.info(
                "Quality check passed",
                extra={
                    "session_id": session_id,
                    "quality_score": quality["quality_score"]
                }
            )

        return result

    def _probe_format(self, file_path: str, session_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Probe audio format using ffprobe to detect issues early.

        Returns:
            Dict with either format info or error message.
        """
        # Check minimum file size first
        try:
            file_size = os.path.getsize(file_path)
            if file_size < 1024:  # Less than 1KB
                return {
                    "error": f"Audio file too small: {file_size} bytes (minimum 1024 bytes for valid audio)"
                }
        except OSError as e:
            return {"error": f"Cannot access audio file: {e}"}

        # Try ffprobe format detection
        try:
            cmd = [
                "ffprobe",
                "-v", "error",
                "-show_format",
                "-show_streams",
                "-of", "json",
                file_path
            ]

            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=30
            )

            if result.returncode != 0:
                stderr = result.stderr.decode("utf-8", errors="ignore").strip()
                # Extract first error line if multiple lines
                error_line = stderr.split('\n')[0] if stderr else "Unknown format error"
                return {
                    "error": f"Format detection failed: {error_line}"
                }

            logger.debug(
                "Format probe successful",
                extra={"session_id": session_id}
            )
            return {"success": True}

        except FileNotFoundError:
            # ffprobe not available, skip format check
            logger.debug(
                "ffprobe not available, skipping format detection",
                extra={"session_id": session_id}
            )
            return {"success": True}
        except subprocess.TimeoutExpired:
            return {"error": "Format detection timeout"}
        except Exception as e:
            logger.warning(
                f"Format probe exception: {e}",
                extra={"session_id": session_id}
            )
            # Don't fail the entire check if ffprobe has issues
            return {"success": True}

    def _convert_with_ffmpeg(self, input_path: str, session_id: Optional[str] = None) -> str:
        """
        Convert audio to canonical PCM WAV format using ffmpeg.

        Args:
            input_path: Path to input audio file
            session_id: Session ID for logging

        Returns:
            Path to converted WAV file (caller responsible for cleanup)

        Raises:
            RuntimeError: If ffmpeg conversion fails
        """
        # Create temporary output file
        fd, output_path = tempfile.mkstemp(suffix=".wav", prefix="converted_")
        os.close(fd)

        try:
            # Convert to canonical format: 16-bit PCM WAV, mono or stereo
            # ffmpeg command: convert to PCM_16 WAV with automatic downmixing if needed
            cmd = [
                "ffmpeg",
                "-i", input_path,
                "-acodec", "pcm_s16le",  # 16-bit PCM
                "-ac", "2",  # 2 channels (stereo)
                "-y",  # Overwrite output file
                output_path
            ]

            logger.debug(
                f"Running ffmpeg conversion",
                extra={"session_id": session_id, "command": " ".join(cmd)}
            )

            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=60  # 60-second timeout
            )

            if result.returncode != 0:
                stderr = result.stderr.decode("utf-8", errors="ignore")
                raise RuntimeError(f"ffmpeg failed: {stderr}")

            logger.debug(
                f"ffmpeg conversion successful",
                extra={"session_id": session_id, "output_path": output_path}
            )

            return output_path
        except Exception as exc:
            # Clean up temporary file on failure
            if os.path.exists(output_path):
                os.unlink(output_path)
            raise RuntimeError(f"Audio conversion failed: {exc}") from exc

    def _bit_depth_from_subtype(self, subtype: Optional[str]) -> int:
        if not subtype:
            return 0

        subtype_upper = subtype.upper()
        mapping = {
            "PCM_16": 16,
            "PCM_24": 24,
            "PCM_32": 32,
            "PCM_U8": 8,
            "PCM_S8": 8,
            "FLOAT": 32,
            "DOUBLE": 64
        }
        return mapping.get(subtype_upper, 0)

    def _calculate_quality_score(self, passed: bool, volume_ok: bool, clipping_detected: bool, silence_percent: float) -> float:
        """Calculate overall quality score from 0.0 to 1.0."""
        if not passed:
            return 0.0

        score = 1.0
        if not volume_ok:
            score -= 0.2
        if clipping_detected:
            score -= 0.3
        score -= (silence_percent / 100.0) * 0.5

        return max(0.0, min(1.0, score))

    def _get_errors(
        self,
        duration: float,
        sample_rate: int,
        clipping: bool,
        silence_percent: float,
        volume_ok: bool,
        subtype: str = ""
    ) -> list[str]:
        """Get list of quality issues based on thresholds."""
        errors: list[str] = []

        if duration < self.MIN_DURATION:
            errors.append(f"Audio too short: {duration:.1f}s (minimum {self.MIN_DURATION}s)")
        elif duration > self.MAX_DURATION:
            errors.append(f"Audio too long: {duration:.1f}s (maximum {self.MAX_DURATION}s)")

        if sample_rate < self.MIN_SAMPLE_RATE:
            errors.append(f"Sample rate too low: {sample_rate}Hz (minimum {self.MIN_SAMPLE_RATE}Hz)")

        if clipping:
            errors.append("Audio is clipping - reduce input gain")

        if silence_percent >= self.MAX_SILENCE_PERCENT:
            errors.append(f"Too much silence: {silence_percent:.1f}% (maximum {self.MAX_SILENCE_PERCENT}%)")

        if not volume_ok:
            errors.append("Volume levels outside recommended range (-40dB to -6dB)")

        if subtype and errors:
            errors.append(f"Detected audio format: {subtype}")

        return errors

    def _parse_audio_warnings(self, stderr: str) -> list[str]:
        """Parse non-fatal warnings from ffmpeg/mpg123 stderr.

        Args:
            stderr: Standard error output from subprocess

        Returns:
            List of warning messages (deduplicated, max 5)
        """
        warnings = set()

        for line in stderr.split('\n'):
            line_lower = line.lower()

            # Capture mpg123 warnings but classify as non-fatal
            if 'mpg123' in line_lower and 'warning' in line_lower:
                if 'part2_3_length' in line_lower:
                    warnings.add("MP3 frame truncation detected (common in short clips)")
                else:
                    # Generic mpg123 warning
                    warnings.add(f"MP3 decode warning: {line.strip()}")

            # Capture other decoder warnings
            elif 'warning' in line_lower and any(
                kw in line_lower for kw in ['header', 'frame', 'stream', 'decode']
            ):
                # Only add if it's not too verbose
                if len(line) < 150:
                    warnings.add(f"Audio decode warning: {line.strip()}")

        # Deduplicate and limit to 5 warnings
        return sorted(list(warnings))[:5]
