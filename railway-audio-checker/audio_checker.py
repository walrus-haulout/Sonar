"""
Audio Quality Checker
Analyzes technical audio quality for SONAR datasets
"""

import librosa
import numpy as np
from pydub import AudioSegment
from typing import Dict, Any
import io


class AudioQualityChecker:
    """Checks audio quality metrics"""

    def __init__(self):
        # Quality thresholds
        self.MIN_DURATION = 1.0  # seconds
        self.MAX_DURATION = 3600.0  # 1 hour max
        self.MIN_SAMPLE_RATE = 8000  # Hz
        self.SILENCE_THRESHOLD = -50  # dB
        self.MAX_SILENCE_PERCENT = 30  # %
        self.CLIPPING_THRESHOLD = 0.99  # normalized amplitude

    async def check_audio(self, audio_bytes: bytes) -> Dict[str, Any]:
        """
        Analyze audio quality

        Args:
            audio_bytes: Raw audio file bytes

        Returns:
            Dict with quality metrics and approval status
        """
        try:
            # Load audio with pydub for format detection
            audio = AudioSegment.from_file(io.BytesIO(audio_bytes))

            # Get basic properties
            duration = len(audio) / 1000.0  # convert to seconds
            sample_rate = audio.frame_rate
            channels = audio.channels
            sample_width = audio.sample_width * 8  # convert to bits

            # Convert to numpy array for analysis
            samples = np.array(audio.get_array_of_samples())

            # Normalize samples
            if audio.sample_width == 2:  # 16-bit
                samples = samples.astype(np.float32) / 32768.0
            elif audio.sample_width == 4:  # 32-bit
                samples = samples.astype(np.float32) / 2147483648.0
            else:
                samples = samples.astype(np.float32) / 128.0  # 8-bit

            # Check for clipping
            clipping = self._check_clipping(samples)

            # Check silence
            silence_percent = self._check_silence(audio, samples)

            # Check volume levels
            volume_ok, rms_db = self._check_volume(samples)

            # Determine if audio passes quality checks
            passed = all([
                self.MIN_DURATION <= duration <= self.MAX_DURATION,
                sample_rate >= self.MIN_SAMPLE_RATE,
                not clipping,
                silence_percent < self.MAX_SILENCE_PERCENT,
                volume_ok
            ])

            return {
                "quality": {
                    "duration": round(duration, 2),
                    "sample_rate": sample_rate,
                    "channels": channels,
                    "bit_depth": sample_width,
                    "volume_ok": volume_ok,
                    "rms_db": round(rms_db, 2),
                    "clipping": clipping,
                    "silence_percent": round(silence_percent, 2),
                    "passed": passed
                },
                "errors": self._get_errors(duration, sample_rate, clipping, silence_percent, volume_ok)
            }

        except Exception as e:
            return {
                "quality": None,
                "errors": [f"Failed to analyze audio: {str(e)}"]
            }

    def _check_clipping(self, samples: np.ndarray) -> bool:
        """Check if audio is clipping"""
        return np.any(np.abs(samples) >= self.CLIPPING_THRESHOLD)

    def _check_silence(self, audio: AudioSegment, samples: np.ndarray) -> float:
        """Calculate percentage of silence in audio"""
        # Simple silence detection using amplitude threshold
        silence_samples = np.abs(samples) < 0.01  # -40 dB threshold
        silence_percent = (np.sum(silence_samples) / len(samples)) * 100
        return silence_percent

    def _check_volume(self, samples: np.ndarray) -> tuple[bool, float]:
        """Check if volume levels are acceptable"""
        rms = np.sqrt(np.mean(samples**2))
        rms_db = 20 * np.log10(rms + 1e-10)  # Add small value to avoid log(0)

        # Audio should be between -40dB and -6dB for good quality speech
        volume_ok = -40 <= rms_db <= -6
        return volume_ok, rms_db

    def _get_errors(self, duration: float, sample_rate: int,
                   clipping: bool, silence_percent: float, volume_ok: bool) -> list[str]:
        """Get list of quality issues"""
        errors = []

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
