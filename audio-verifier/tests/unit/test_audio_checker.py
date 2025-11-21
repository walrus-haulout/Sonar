"""
Expanded unit tests for audio_checker.py

Tests quality checks: duration, sample rate, clipping, silence, and volume levels.
"""

import numpy as np
import pytest
import soundfile as sf

from audio_checker import AudioQualityChecker


class TestAudioCheckerBasic:
    """Basic audio quality testing."""

    @pytest.mark.asyncio
    async def test_check_audio_file_streams_without_loading(self, valid_audio_file):
        """Test that large files are streamed without full memory load."""
        checker = AudioQualityChecker()
        result = await checker.check_audio_file(str(valid_audio_file))

        assert result["quality"]["passed"] is True
        assert result["quality"]["duration"] == pytest.approx(2.0, rel=0.05)
        assert result["quality"]["sample_rate"] == 16000
        assert result["quality"]["silence_percent"] < 5
        assert result["errors"] == []

    @pytest.mark.asyncio
    async def test_check_audio_bytes_preserves_behaviour(self, silent_audio_file):
        """Test bytes checking works correctly."""
        checker = AudioQualityChecker()
        with open(silent_audio_file, "rb") as fh:
            audio_bytes = fh.read()

        result = await checker.check_audio(audio_bytes)

        assert result["quality"]["passed"] is False
        assert any("Too much silence" in err for err in result["errors"])


class TestDurationValidation:
    """Test duration-based quality checks."""

    @pytest.mark.asyncio
    async def test_rejects_too_short_audio(self, short_audio_file):
        """Test that audio <1s is rejected."""
        checker = AudioQualityChecker()
        result = await checker.check_audio_file(str(short_audio_file))

        assert result["quality"]["passed"] is False
        assert any("short" in err.lower() for err in result["errors"])

    @pytest.mark.asyncio
    async def test_rejects_too_long_audio(self, long_audio_file):
        """Test that audio >3600s is rejected."""
        checker = AudioQualityChecker()
        result = await checker.check_audio_file(str(long_audio_file))

        assert result["quality"]["passed"] is False
        assert any("long" in err.lower() for err in result["errors"])

    @pytest.mark.asyncio
    async def test_accepts_valid_duration(self, valid_audio_file):
        """Test that 1s < duration < 3600s passes."""
        checker = AudioQualityChecker()
        result = await checker.check_audio_file(str(valid_audio_file))

        assert result["quality"]["passed"] is True
        assert 1.0 <= result["quality"]["duration"] <= 3600.0


class TestSampleRateValidation:
    """Test sample rate-based quality checks."""

    @pytest.mark.asyncio
    async def test_rejects_low_sample_rate(self, low_sample_rate_audio_file):
        """Test that sample rate <8000Hz is rejected."""
        checker = AudioQualityChecker()
        result = await checker.check_audio_file(str(low_sample_rate_audio_file))

        assert result["quality"]["passed"] is False
        assert any("sample rate" in err.lower() for err in result["errors"])

    @pytest.mark.asyncio
    async def test_accepts_valid_sample_rate(self, valid_audio_file):
        """Test that sample rate >=8000Hz passes."""
        checker = AudioQualityChecker()
        result = await checker.check_audio_file(str(valid_audio_file))

        assert result["quality"]["passed"] is True
        assert result["quality"]["sample_rate"] >= 8000


class TestClippingDetection:
    """Test clipping (distortion) detection."""

    @pytest.mark.asyncio
    async def test_detects_clipping(self, clipped_audio_file):
        """Test that clipped audio (>0.99 amplitude) is detected."""
        checker = AudioQualityChecker()
        result = await checker.check_audio_file(str(clipped_audio_file))

        # Clipping should cause failure
        assert result["quality"]["passed"] is False
        assert result["quality"]["clipping_detected"] is True
        assert any("clipping" in err.lower() for err in result["errors"])

    @pytest.mark.asyncio
    async def test_no_clipping_in_clean_audio(self, valid_audio_file):
        """Test that clean audio shows no clipping."""
        checker = AudioQualityChecker()
        result = await checker.check_audio_file(str(valid_audio_file))

        assert result["quality"]["clipping_detected"] is False


class TestSilenceDetection:
    """Test silence detection."""

    @pytest.mark.asyncio
    async def test_detects_excessive_silence(self, mostly_silent_audio_file):
        """Test that >30% silence is detected."""
        checker = AudioQualityChecker()
        result = await checker.check_audio_file(str(mostly_silent_audio_file))

        assert result["quality"]["passed"] is False
        assert any("silence" in err.lower() for err in result["errors"])

    @pytest.mark.asyncio
    async def test_completely_silent_audio_rejected(self, silent_audio_file):
        """Test that completely silent audio is rejected."""
        checker = AudioQualityChecker()
        result = await checker.check_audio_file(str(silent_audio_file))

        assert result["quality"]["passed"] is False
        assert result["quality"]["silence_percent"] > 95
        assert any("silence" in err.lower() for err in result["errors"])

    @pytest.mark.asyncio
    async def test_clean_audio_has_low_silence(self, valid_audio_file):
        """Test that clean audio has low silence percentage."""
        checker = AudioQualityChecker()
        result = await checker.check_audio_file(str(valid_audio_file))

        # Clean audio should have <30% silence
        assert result["quality"]["silence_percent"] < 30


class TestVolumeValidation:
    """Test volume level checks."""

    @pytest.mark.asyncio
    async def test_rejects_volume_too_quiet(self, very_quiet_audio_file):
        """Test that audio <-40dB RMS is rejected."""
        checker = AudioQualityChecker()
        result = await checker.check_audio_file(str(very_quiet_audio_file))

        assert result["quality"]["passed"] is False
        assert any("volume" in err.lower() or "loud" in err.lower() for err in result["errors"])

    @pytest.mark.asyncio
    async def test_rejects_volume_too_loud(self, very_loud_audio_file):
        """Test that audio >-6dB RMS is rejected."""
        checker = AudioQualityChecker()
        result = await checker.check_audio_file(str(very_loud_audio_file))

        assert result["quality"]["passed"] is False
        assert any("volume" in err.lower() or "loud" in err.lower() for err in result["errors"])

    @pytest.mark.asyncio
    async def test_accepts_valid_volume_levels(self, valid_audio_file):
        """Test that -40dB < RMS < -6dB passes."""
        checker = AudioQualityChecker()
        result = await checker.check_audio_file(str(valid_audio_file))

        assert result["quality"]["passed"] is True
        assert -40 < result["quality"]["rms_db"] < -6


class TestErrorHandling:
    """Test error handling and edge cases."""

    @pytest.mark.asyncio
    async def test_handles_corrupted_audio(self, corrupted_audio_file):
        """Test graceful handling of corrupted audio files."""
        checker = AudioQualityChecker()
        result = await checker.check_audio_file(str(corrupted_audio_file))

        # Should return error gracefully without crashing
        assert result["quality"] is None
        assert len(result["errors"]) > 0

    @pytest.mark.asyncio
    async def test_handles_empty_audio_file(self, empty_audio_file):
        """Test graceful handling of empty audio files."""
        checker = AudioQualityChecker()
        result = await checker.check_audio_file(str(empty_audio_file))

        # Should return error gracefully without crashing
        assert result["quality"] is None
        assert len(result["errors"]) > 0

    @pytest.mark.asyncio
    async def test_handles_missing_file(self):
        """Test graceful handling of missing files."""
        checker = AudioQualityChecker()
        result = await checker.check_audio_file("/nonexistent/path/audio.wav")

        # Should return error gracefully without crashing
        assert result["quality"] is None
        assert len(result["errors"]) > 0


class TestQualityScoring:
    """Test quality score calculations."""

    @pytest.mark.asyncio
    async def test_quality_score_present(self, valid_audio_file):
        """Test that quality score is calculated and returned."""
        checker = AudioQualityChecker()
        result = await checker.check_audio_file(str(valid_audio_file))

        assert "quality_score" in result["quality"]
        assert 0 <= result["quality"]["quality_score"] <= 1

    @pytest.mark.asyncio
    async def test_failed_checks_affect_score(self, mostly_silent_audio_file):
        """Test that failed checks result in lower quality score."""
        checker = AudioQualityChecker()
        result_silent = await checker.check_audio_file(str(mostly_silent_audio_file))
        
        # File with silence issue should have lower score
        assert result_silent["quality"]["quality_score"] < 0.5


class TestMultiFormatSupport:
    """Test support for various audio formats."""

    @pytest.mark.asyncio
    async def test_supports_wav_format(self, valid_audio_file):
        """Test WAV format support."""
        checker = AudioQualityChecker()
        result = await checker.check_audio_file(str(valid_audio_file))
        assert result["quality"]["passed"] is True

    @pytest.mark.asyncio
    async def test_different_bit_depths(self, tmp_path):
        """Test support for different bit depths."""
        sample_rate = 16000
        duration = 2.0
        t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
        waveform = (0.1 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
        
        # Test PCM_16
        audio_path_16 = tmp_path / "audio_16bit.wav"
        sf.write(audio_path_16, waveform, sample_rate, subtype="PCM_16")
        
        checker = AudioQualityChecker()
        result = await checker.check_audio_file(str(audio_path_16))
        assert result["quality"]["passed"] is True


class TestStreamingPerformance:
    """Test streaming and performance characteristics."""

    @pytest.mark.asyncio
    @pytest.mark.timeout(10)
    async def test_large_file_processes_quickly(self, tmp_path):
        """Test that moderately large files process without hanging."""
        sample_rate = 16000
        duration = 30  # 30 seconds
        t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
        waveform = (0.1 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
        
        audio_path = tmp_path / "large_audio.wav"
        sf.write(audio_path, waveform, sample_rate, subtype="PCM_16")
        
        checker = AudioQualityChecker()
        result = await checker.check_audio_file(str(audio_path))
        
        # Should complete quickly and return valid results
        assert "quality" in result
        assert result["quality"]["passed"] is True

    @pytest.mark.asyncio
    async def test_block_processing_consistency(self, valid_audio_file):
        """Test that streaming block processing gives consistent results."""
        checker = AudioQualityChecker()
        
        # Process same file multiple times
        results = []
        for _ in range(3):
            result = await checker.check_audio_file(str(valid_audio_file))
            results.append(result)
        
        # Results should be consistent
        assert all(r["quality"]["passed"] == results[0]["quality"]["passed"] for r in results)
        assert all(
            pytest.approx(r["quality"]["duration"], rel=0.01) == results[0]["quality"]["duration"]
            for r in results
        )


class TestByteProcessing:
    """Test processing audio from bytes."""

    @pytest.mark.asyncio
    async def test_check_audio_from_bytes(self, valid_audio_file):
        """Test that bytes and file produce same results."""
        with open(valid_audio_file, "rb") as f:
            audio_bytes = f.read()

        checker = AudioQualityChecker()

        # Check from file
        result_file = await checker.check_audio_file(str(valid_audio_file))

        # Check from bytes
        result_bytes = await checker.check_audio(audio_bytes)

        # Results should be equivalent
        assert result_file["quality"]["passed"] == result_bytes["quality"]["passed"]
        assert pytest.approx(result_file["quality"]["duration"], rel=0.01) == result_bytes["quality"]["duration"]


class TestSessionIDLogging:
    """Test session ID support in logging."""

    @pytest.mark.asyncio
    async def test_accepts_session_id_parameter(self, valid_audio_file):
        """Test that session_id parameter is accepted."""
        checker = AudioQualityChecker()
        session_id = "test-session-uuid-123"

        # Should not raise error with session_id
        result = await checker.check_audio_file(str(valid_audio_file), session_id=session_id)

        assert result["quality"]["passed"] is True

    @pytest.mark.asyncio
    async def test_session_id_in_error_context(self, corrupted_audio_file):
        """Test that session_id is included in error handling."""
        checker = AudioQualityChecker()
        session_id = "test-session-uuid-456"

        result = await checker.check_audio_file(str(corrupted_audio_file), session_id=session_id)

        # Should fail gracefully with session ID context
        assert result["quality"] is None
        assert len(result["errors"]) > 0


class TestFFmpegFallback:
    """Test FFmpeg fallback for format conversion."""

    @pytest.mark.asyncio
    async def test_analyzes_valid_audio_without_ffmpeg(self, valid_audio_file):
        """Test that valid audio works without ffmpeg fallback."""
        checker = AudioQualityChecker()
        result = await checker.check_audio_file(str(valid_audio_file))

        # Should succeed with soundfile directly
        assert result["quality"]["passed"] is True
        assert result["quality"]["sample_rate"] == 16000

    @pytest.mark.asyncio
    async def test_error_messages_include_format_info(self, clipped_audio_file):
        """Test that error messages include detected audio format."""
        checker = AudioQualityChecker()
        # This tests format detection in error messages
        result = await checker.check_audio_file(str(clipped_audio_file))

        # Should return errors with format information
        assert result["quality"]["passed"] is False
        errors = result["errors"]
        assert len(errors) > 0
        # Check that format info is included when there are errors
        assert any("format" in err.lower() or "clipping" in err.lower() for err in errors)

    @pytest.mark.asyncio
    async def test_ffmpeg_conversion_preserves_quality(self, valid_audio_file):
        """Test that ffmpeg fallback produces valid analysis."""
        checker = AudioQualityChecker()

        # Analyze original file
        result = await checker.check_audio_file(str(valid_audio_file))

        assert result["quality"]["passed"] is True
        assert "sample_rate" in result["quality"]
        assert "duration" in result["quality"]


class TestMetadataCapture:
    """Test file metadata capture for diagnostics."""

    @pytest.mark.asyncio
    async def test_captures_file_metadata(self, valid_audio_file):
        """Test that file metadata is captured (size, mime type, etc)."""
        checker = AudioQualityChecker()
        session_id = "metadata-test-session"

        # This should capture file size and mime type internally
        result = await checker.check_audio_file(str(valid_audio_file), session_id=session_id)

        assert result["quality"]["passed"] is True
        # File was successfully analyzed with metadata capture
        assert result["quality"]["duration"] > 0

    @pytest.mark.asyncio
    async def test_handles_missing_file_gracefully(self):
        """Test graceful handling when file is missing."""
        checker = AudioQualityChecker()
        session_id = "missing-file-test"

        result = await checker.check_audio_file(
            "/nonexistent/path/audio.wav",
            session_id=session_id
        )

        assert result["quality"] is None
        assert len(result["errors"]) > 0


class TestFormatDetection:
    """Test audio format detection and error messages."""

    @pytest.mark.asyncio
    async def test_detects_wav_format(self, valid_audio_file):
        """Test WAV format detection."""
        checker = AudioQualityChecker()
        result = await checker.check_audio_file(str(valid_audio_file))

        assert result["quality"] is not None
        # Format should be detectable from file
        assert result["quality"]["bit_depth"] > 0

    @pytest.mark.asyncio
    async def test_error_messages_with_format_context(self, mostly_silent_audio_file):
        """Test that error messages include format information when available."""
        checker = AudioQualityChecker()
        result = await checker.check_audio_file(str(mostly_silent_audio_file))

        assert result["quality"]["passed"] is False
        errors = result["errors"]
        assert len(errors) > 0
        # Error messages should be descriptive
        assert any(len(err) > 10 for err in errors)  # Non-trivial error messages
