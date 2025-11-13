import numpy as np
import pytest
import soundfile as sf

from audio_checker import AudioQualityChecker


@pytest.mark.asyncio
async def test_check_audio_file_streams_without_loading(tmp_path):
    sample_rate = 16000
    duration_seconds = 2
    t = np.linspace(0, duration_seconds, int(sample_rate * duration_seconds), endpoint=False)
    waveform = (0.1 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)

    audio_path = tmp_path / "tone.wav"
    sf.write(audio_path, waveform, samplerate=sample_rate, subtype="PCM_16")

    checker = AudioQualityChecker()
    result = await checker.check_audio_file(str(audio_path))

    assert result["quality"]["passed"] is True
    assert pytest.approx(duration_seconds, rel=0.05) == result["quality"]["duration"]
    assert result["quality"]["sample_rate"] == sample_rate
    assert result["quality"]["silence_percent"] < 5
    assert result["errors"] == []


@pytest.mark.asyncio
async def test_check_audio_bytes_preserves_behaviour(tmp_path):
    sample_rate = 8000
    duration_seconds = 1
    waveform = np.zeros(int(sample_rate * duration_seconds), dtype=np.float32)

    audio_path = tmp_path / "silence.wav"
    sf.write(audio_path, waveform, samplerate=sample_rate, subtype="PCM_16")

    checker = AudioQualityChecker()
    with open(audio_path, "rb") as fh:
        audio_bytes = fh.read()

    result = await checker.check_audio(audio_bytes)

    assert result["quality"]["passed"] is False
    assert any("Too much silence" in err for err in result["errors"])

