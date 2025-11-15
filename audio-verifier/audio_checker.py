"""
Audio Quality Checker
Analyzes technical audio quality for SONAR datasets
"""

import asyncio
import io
from typing import Any, Dict, Optional

import numpy as np
import soundfile as sf


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

    async def check_audio_file(self, file_path: str) -> Dict[str, Any]:
        """
        Analyze audio quality from disk, streaming samples to avoid large allocations.
        """
        try:
            return await asyncio.to_thread(self._analyze_file, file_path)
        except Exception as exc:
            return {
                "quality": None,
                "errors": [f"Failed to analyze audio file: {exc}"]
            }

    def _analyze_file(self, file_path: str) -> Dict[str, Any]:
        with sf.SoundFile(file_path) as audio_file:
            return self._analyze_stream(audio_file)

    def _analyze_bytes(self, audio_bytes: bytes) -> Dict[str, Any]:
        with sf.SoundFile(io.BytesIO(audio_bytes)) as audio_file:
            return self._analyze_stream(audio_file)

    def _analyze_stream(self, audio_file: sf.SoundFile) -> Dict[str, Any]:
        audio_file.seek(0)
        sample_rate = audio_file.samplerate
        channels = audio_file.channels
        subtype = audio_file.subtype or ""
        duration = len(audio_file) / float(sample_rate) if sample_rate else 0.0
        bit_depth = self._bit_depth_from_subtype(subtype)

        if duration <= 0 or sample_rate <= 0:
            raise ValueError("Invalid audio metadata detected")

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

        return {
            "quality": quality,
            "errors": self._get_errors(duration, sample_rate, clipping_detected, silence_percent, volume_ok)
        }

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
        volume_ok: bool
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

        return errors
