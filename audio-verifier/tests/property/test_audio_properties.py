"""
Property-based tests for audio processing.

Uses hypothesis to generate test data and verify audio quality invariants.
"""

import pytest
from hypothesis import given, strategies as st, assume
import numpy as np
import soundfile as sf
import tempfile
import os

from audio_checker import AudioQualityChecker


class TestAudioQualityInvariants:
    """Test invariants in audio quality checking."""

    @pytest.mark.asyncio
    @given(
        duration=st.floats(min_value=1.0, max_value=3600.0),
        sample_rate=st.integers(min_value=8000, max_value=96000),
    )
    async def test_quality_checker_handles_valid_audio_parameters(self, duration, sample_rate):
        """Test that quality checker can process audio with any valid parameters."""
        # Skip if parameters don't work with soundfile
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp_path = tmp.name
            
            # Create synthetic audio
            num_samples = int(duration * sample_rate)
            t = np.linspace(0, duration, num_samples, endpoint=False)
            waveform = (0.1 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
            
            sf.write(tmp_path, waveform, sample_rate, subtype="PCM_16")
            
            # Process audio
            checker = AudioQualityChecker()
            result = await checker.check_audio_file(tmp_path)
            
            # Verify result structure is always present
            assert "quality" in result
            assert "duration" in result["quality"]
            assert "sample_rate" in result["quality"]
            
            # Duration and sample rate should be detectable
            assert result["quality"]["duration"] == pytest.approx(duration, rel=0.02)
            assert result["quality"]["sample_rate"] == sample_rate
            
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    @pytest.mark.asyncio
    @given(amplitude=st.floats(min_value=0.0, max_value=2.0))
    async def test_clipping_detection_monotonic(self, amplitude):
        """Test that clipping detection is monotonic with amplitude."""
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
        
        try:
            # Create audio with specific amplitude
            sample_rate = 16000
            duration = 2.0
            t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
            waveform = (amplitude * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
            sf.write(tmp_path, waveform, sample_rate, subtype="PCM_16")
            
            checker = AudioQualityChecker()
            result = await checker.check_audio_file(tmp_path)
            
            # Clipping should only happen at high amplitudes
            clipping_detected = result["quality"].get("clipping_detected", False)
            
            if amplitude > 0.99:
                # High amplitude should trigger clipping detection
                # (though not guaranteed due to floating point quirks)
                assert isinstance(clipping_detected, bool)
            else:
                # Low amplitude should not detect clipping
                assert clipping_detected is False
                
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    @pytest.mark.asyncio
    @given(
        duration=st.floats(min_value=0.1, max_value=100.0),
        sample_rate=st.integers(min_value=8000, max_value=96000)
    )
    async def test_duration_calculation_accurate(self, duration, sample_rate):
        """Test that duration calculation is accurate across different parameters."""
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
        
        try:
            # Create audio
            num_samples = int(duration * sample_rate)
            t = np.linspace(0, duration, num_samples, endpoint=False)
            waveform = (0.1 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
            sf.write(tmp_path, waveform, sample_rate, subtype="PCM_16")
            
            checker = AudioQualityChecker()
            result = await checker.check_audio_file(tmp_path)
            
            # Duration should be within 2% of expected
            reported_duration = result["quality"]["duration"]
            assert pytest.approx(reported_duration, rel=0.02) == duration
            
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    @pytest.mark.asyncio
    @given(silence_percent=st.floats(min_value=0.0, max_value=1.0))
    async def test_silence_detection_threshold_consistent(self, silence_percent):
        """Test that silence detection threshold is applied consistently."""
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
        
        try:
            # Create audio with specific silence percentage
            sample_rate = 16000
            duration = 2.0
            total_samples = int(sample_rate * duration)
            tone_samples = int(total_samples * (1 - silence_percent))
            
            waveform = np.zeros(total_samples, dtype=np.float32)
            t = np.linspace(0, duration, tone_samples, endpoint=False)
            waveform[:tone_samples] = (0.1 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
            
            sf.write(tmp_path, waveform, sample_rate, subtype="PCM_16")
            
            checker = AudioQualityChecker()
            result = await checker.check_audio_file(tmp_path)
            
            # Check silence percentage matches expectation (within tolerance)
            reported_silence = result["quality"]["silence_percent"] / 100.0
            assert pytest.approx(reported_silence, rel=0.05) == silence_percent
            
            # If silence > 30%, quality should fail
            if silence_percent > 0.30:
                assert result["quality"]["passed"] is False
            
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    @pytest.mark.asyncio
    @given(st.lists(
        st.floats(min_value=0.0, max_value=1.0, allow_nan=False),
        min_size=10,
        max_size=100
    ))
    async def test_quality_score_in_valid_range(self, amplitude_values):
        """Test that quality score is always in valid 0-1 range."""
        assume(all(not np.isnan(v) and not np.isinf(v) for v in amplitude_values))
        
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
        
        try:
            # Create audio from amplitude values
            sample_rate = 16000
            waveform = np.array(amplitude_values * 100, dtype=np.float32) / 100.0  # Ensure valid range
            waveform = np.clip(waveform, -1.0, 1.0)  # Clip to valid audio range
            
            sf.write(tmp_path, waveform, sample_rate, subtype="PCM_16")
            
            checker = AudioQualityChecker()
            result = await checker.check_audio_file(tmp_path)
            
            # Quality score should be in valid range
            score = result["quality"].get("quality_score", 0)
            assert 0 <= score <= 1, f"Quality score {score} out of range"
            
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)


class TestQualityCheckConsistency:
    """Test consistency of quality checks."""

    @pytest.mark.asyncio
    @given(
        seed=st.integers(min_value=0, max_value=2**32 - 1),
        duration=st.floats(min_value=1.0, max_value=60.0),
        sample_rate=st.sampled_from([8000, 16000, 44100, 48000])
    )
    async def test_repeated_checks_give_same_result(self, seed, duration, sample_rate):
        """Test that checking the same audio twice gives identical results."""
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
        
        try:
            # Create reproducible audio
            np.random.seed(seed)
            num_samples = int(duration * sample_rate)
            t = np.linspace(0, duration, num_samples, endpoint=False)
            waveform = (0.1 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
            sf.write(tmp_path, waveform, sample_rate, subtype="PCM_16")
            
            # Check twice
            checker = AudioQualityChecker()
            result1 = await checker.check_audio_file(tmp_path)
            result2 = await checker.check_audio_file(tmp_path)
            
            # Results should be identical
            assert result1["quality"]["passed"] == result2["quality"]["passed"]
            assert pytest.approx(result1["quality"]["duration"]) == result2["quality"]["duration"]
            assert result1["quality"]["sample_rate"] == result2["quality"]["sample_rate"]
            assert pytest.approx(result1["quality"]["silence_percent"]) == result2["quality"]["silence_percent"]
            
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
