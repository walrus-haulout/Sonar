import pytest
import numpy as np
import soundfile as sf
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock


@pytest.fixture
def valid_audio_file(tmp_path):
    """Generate valid test audio file (2s, 16kHz, clear tone)."""
    sample_rate = 16000
    duration = 2.0
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    # 440 Hz sine wave at 0.1 amplitude
    waveform = (0.1 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    audio_path = tmp_path / "valid_tone.wav"
    sf.write(audio_path, waveform, sample_rate, subtype="PCM_16")
    return audio_path


@pytest.fixture
def valid_audio_bytes(valid_audio_file):
    """Return valid audio as bytes."""
    with open(valid_audio_file, "rb") as f:
        return f.read()


@pytest.fixture
def clipped_audio_file(tmp_path):
    """Generate audio with clipping (amplitude > 0.99)."""
    sample_rate = 16000
    duration = 2.0
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    # 1.2 amplitude causes clipping
    waveform = (1.2 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    audio_path = tmp_path / "clipped.wav"
    sf.write(audio_path, waveform, sample_rate, subtype="PCM_16")
    return audio_path


@pytest.fixture
def silent_audio_file(tmp_path):
    """Generate completely silent audio (100% silence)."""
    sample_rate = 16000
    duration = 2.0
    waveform = np.zeros(int(sample_rate * duration), dtype=np.float32)
    audio_path = tmp_path / "silent.wav"
    sf.write(audio_path, waveform, sample_rate, subtype="PCM_16")
    return audio_path


@pytest.fixture
def mostly_silent_audio_file(tmp_path):
    """Generate audio with >30% silence."""
    sample_rate = 16000
    duration = 3.0
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    # 40% tone, 60% silence (reversed sections)
    waveform = np.zeros(int(sample_rate * duration), dtype=np.float32)
    tone_samples = int(len(waveform) * 0.4)
    waveform[:tone_samples] = (0.1 * np.sin(2 * np.pi * 440 * t[:tone_samples])).astype(
        np.float32
    )
    audio_path = tmp_path / "mostly_silent.wav"
    sf.write(audio_path, waveform, sample_rate, subtype="PCM_16")
    return audio_path


@pytest.fixture
def short_audio_file(tmp_path):
    """Generate too-short audio (<1s)."""
    sample_rate = 16000
    duration = 0.5  # 500ms
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    waveform = (0.1 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    audio_path = tmp_path / "short.wav"
    sf.write(audio_path, waveform, sample_rate, subtype="PCM_16")
    return audio_path


@pytest.fixture
def long_audio_file(tmp_path):
    """Generate too-long audio (>3600s)."""
    sample_rate = 16000
    duration = 3601  # 1 hour 1 second
    # Create waveform in chunks to avoid memory issues, then write once
    audio_path = tmp_path / "long.wav"
    chunk_size = 30  # 30 second chunks
    waveforms = []

    for i in range(0, duration, chunk_size):
        chunk_duration = min(chunk_size, duration - i)
        t = np.linspace(0, chunk_duration, int(sample_rate * chunk_duration), endpoint=False)
        waveform = (0.1 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
        waveforms.append(waveform)

    # Concatenate all chunks and write once
    full_waveform = np.concatenate(waveforms)
    sf.write(audio_path, full_waveform, sample_rate, subtype="PCM_16")
    return audio_path


@pytest.fixture
def low_sample_rate_audio_file(tmp_path):
    """Generate audio with sample rate <8000Hz."""
    sample_rate = 4000  # Too low
    duration = 2.0
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    waveform = (0.1 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    audio_path = tmp_path / "low_sample_rate.wav"
    sf.write(audio_path, waveform, sample_rate, subtype="PCM_16")
    return audio_path


@pytest.fixture
def very_quiet_audio_file(tmp_path):
    """Generate audio with volume <-40dB RMS."""
    sample_rate = 16000
    duration = 2.0
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    # Very small amplitude (~0.001)
    waveform = (0.001 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    audio_path = tmp_path / "very_quiet.wav"
    sf.write(audio_path, waveform, sample_rate, subtype="PCM_16")
    return audio_path


@pytest.fixture
def very_loud_audio_file(tmp_path):
    """Generate audio with volume >-6dB RMS."""
    sample_rate = 16000
    duration = 2.0
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    # High amplitude
    waveform = (0.95 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    audio_path = tmp_path / "very_loud.wav"
    sf.write(audio_path, waveform, sample_rate, subtype="PCM_16")
    return audio_path


@pytest.fixture
def corrupted_audio_file(tmp_path):
    """Generate corrupted/invalid audio file."""
    audio_path = tmp_path / "corrupted.wav"
    # Write invalid WAV header
    with open(audio_path, "wb") as f:
        f.write(b"RIFF\x00\x00\x00\x00WAVEinvaliddata")
    return audio_path


@pytest.fixture
def empty_audio_file(tmp_path):
    """Generate empty audio file."""
    audio_path = tmp_path / "empty.wav"
    audio_path.write_bytes(b"")
    return audio_path


# Mock responses for external APIs

@pytest.fixture
def mock_openrouter_transcription_response():
    """Mock OpenRouter transcription response."""
    return {
        "choices": [
            {
                "message": {
                    "content": "This is a test transcription of the audio content."
                }
            }
        ]
    }


@pytest.fixture
def mock_openrouter_analysis_response():
    """Mock Gemini analysis response with JSON."""
    return {
        "choices": [
            {
                "message": {
                    "content": """```json
{
  "qualityScore": 0.85,
  "safetyPassed": true,
  "insights": ["Clear audio quality", "Good microphone placement"],
  "concerns": [],
  "recommendations": ["Reduce background noise in future recordings"]
}
```"""
                }
            }
        ]
    }


@pytest.fixture
def mock_openrouter_analysis_invalid_response():
    """Mock Gemini analysis response with invalid JSON."""
    return {
        "choices": [
            {
                "message": {
                    "content": "Invalid JSON response"
                }
            }
        ]
    }


@pytest.fixture
def mock_acoustid_match_high_confidence():
    """Mock AcoustID high-confidence copyright match."""
    return [
        (0.95, "recording-id-123", "Copyrighted Song", "Artist Name")
    ]


@pytest.fixture
def mock_acoustid_match_low_confidence():
    """Mock AcoustID low-confidence match (<80%)."""
    return [
        (0.65, "recording-id-456", "Some Song", "Some Artist")
    ]


@pytest.fixture
def mock_acoustid_no_match():
    """Mock AcoustID with no matches."""
    return []


# Mock SEAL and encryption fixtures

@pytest.fixture
def mock_encrypted_blob_hex():
    """Mock encrypted blob as hex string."""
    # 4 bytes length (858) + sealed key + encrypted data
    length_bytes = (858).to_bytes(4, 'little')
    sealed_key = bytes.fromhex("a" * 256)  # 128 bytes as hex
    encrypted_data = bytes.fromhex("b" * 1000)  # Encrypted content
    return (length_bytes + sealed_key + encrypted_data).hex()


@pytest.fixture
def mock_sealed_envelope():
    """Mock envelope encryption format."""
    return {
        "length": 858,
        "sealed_key": "a" * 256,
        "encrypted_data": "b" * 1000
    }


@pytest.fixture
def mock_walrus_blob_response():
    """Mock Walrus blob response."""
    return b"encrypted audio content here"


@pytest.fixture
def mock_walrus_blob_404():
    """Mock Walrus 404 response (blob not yet propagated)."""
    return None  # Represents 404


# Async mock helpers

@pytest.fixture
def mock_async_client():
    """Create mock httpx AsyncClient."""
    return AsyncMock()


@pytest.fixture
def mock_session_store():
    """Create mock SessionStore."""
    store = AsyncMock()
    store.create_session = AsyncMock(return_value="session-uuid-123")
    store.get_session = AsyncMock(return_value={
        "id": "session-uuid-123",
        "status": "processing",
        "progress": 0.0
    })
    store.update_session = AsyncMock(return_value=True)
    store.mark_completed = AsyncMock(return_value=True)
    store.mark_failed = AsyncMock(return_value=True)
    return store


@pytest.fixture
def mock_audio_quality_checker():
    """Create mock AudioQualityChecker."""
    checker = AsyncMock()
    checker.check_audio_file = AsyncMock(return_value={
        "quality": {
            "passed": True,
            "duration": 2.0,
            "sample_rate": 16000,
            "silence_percent": 5.0,
            "clipping_detected": False,
            "rms_db": -20.0
        },
        "errors": []
    })
    checker.check_audio = AsyncMock(return_value={
        "quality": {
            "passed": True,
            "duration": 2.0,
            "sample_rate": 16000,
            "silence_percent": 5.0,
            "clipping_detected": False,
            "rms_db": -20.0
        },
        "errors": []
    })
    return checker


@pytest.fixture
def mock_fingerprinter():
    """Create mock Fingerprinter."""
    fingerprinter = AsyncMock()
    fingerprinter.check_copyright = AsyncMock(return_value={
        "copyright": {
            "high_confidence_match": False,
            "matches": []
        },
        "errors": []
    })
    return fingerprinter


@pytest.fixture
def mock_environ(monkeypatch):
    """Fixture to set environment variables in tests."""
    def _set_env(**kwargs):
        for key, value in kwargs.items():
            monkeypatch.setenv(key, value)
    return _set_env
