"""Integration test fixtures for E2E testing."""

import pytest
import numpy as np
import soundfile as sf
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient, ASGITransport
from contextlib import asynccontextmanager
import io

from .fake_session_store import FakeSessionStore


@pytest.fixture
def integration_env(monkeypatch):
    """Set up integration test environment variables."""
    # Core required vars
    monkeypatch.setenv("VERIFIER_AUTH_TOKEN", "test-token-123")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-api-key")
    monkeypatch.setenv("ACOUSTID_API_KEY", "test-acoustid-key")
    monkeypatch.setenv("WALRUS_AGGREGATOR_URL", "http://localhost:8080/aggregator")
    monkeypatch.setenv("WALRUS_AGGREGATOR_TOKEN", "test-walrus-token")
    monkeypatch.setenv("SEAL_PACKAGE_ID", "0x123456")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    monkeypatch.setenv("ENABLE_LEGACY_UPLOAD", "true")
    monkeypatch.setenv("WALRUS_UPLOAD_URL", "http://localhost:8080/upload")
    monkeypatch.setenv("WALRUS_UPLOAD_TOKEN", "test-upload-token")
    return monkeypatch


@pytest.fixture
async def fake_session_store():
    """Provide FakeSessionStore for testing."""
    return FakeSessionStore()


@pytest.fixture
async def mock_pipeline():
    """Mock VerificationPipeline that records stages."""
    pipeline = AsyncMock()

    async def run_from_file_mock(session_id, file_path, metadata):
        """Simulate pipeline execution with stage transitions."""
        from .fake_session_store import FakeSessionStore
        # This would be patched in actual tests with real store
        pass

    pipeline.run_from_file = AsyncMock(side_effect=run_from_file_mock)
    return pipeline


@pytest.fixture
def synthetic_wav_bytes(tmp_path) -> bytes:
    """Generate synthetic WAV bytes for testing."""
    sample_rate = 16000
    duration = 2.0
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    # 440 Hz sine wave
    waveform = (0.1 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)

    # Write to bytes buffer
    wav_path = tmp_path / "synthetic.wav"
    sf.write(wav_path, waveform, sample_rate, subtype="PCM_16")

    with open(wav_path, "rb") as f:
        return f.read()


@pytest.fixture
def mock_decrypt_encrypted_blob():
    """Mock decrypt_encrypted_blob function."""
    async def _mock_decrypt(blob_id, encrypted_bytes, seal_id, session_key):
        # Return synthetic WAV bytes
        sample_rate = 16000
        duration = 1.0  # Short for testing
        t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
        waveform = (0.1 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)

        # Create WAV bytes
        buffer = io.BytesIO()
        sf.write(buffer, waveform, sample_rate, format='WAV', subtype="PCM_16")
        buffer.seek(0)
        return buffer.getvalue()

    return _mock_decrypt


@pytest.fixture
def mock_openrouter_client():
    """Mock OpenAI client for OpenRouter."""
    client = MagicMock()

    # Mock transcription response
    transcription_response = MagicMock()
    transcription_response.choices = [MagicMock()]
    transcription_response.choices[0].message = MagicMock()
    transcription_response.choices[0].message.content = "This is a test transcription"

    # Mock analysis response
    analysis_response = MagicMock()
    analysis_response.choices = [MagicMock()]
    analysis_response.choices[0].message = MagicMock()
    analysis_response.choices[0].message.content = """{
        "qualityScore": 0.85,
        "safetyPassed": true,
        "insights": ["Clear audio"],
        "concerns": [],
        "recommendations": []
    }"""

    client.chat = MagicMock()
    client.chat.completions = MagicMock()
    client.chat.completions.create = MagicMock(return_value=transcription_response)

    return client


@pytest.fixture
def mock_copyright_detector():
    """Mock CopyrightDetector."""
    detector = AsyncMock()
    detector.check_copyright = AsyncMock(return_value={
        "copyright": {"high_confidence_match": False, "matches": []},
        "errors": []
    })
    return detector


@pytest.fixture
def mock_audio_quality_checker():
    """Mock AudioQualityChecker."""
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
    return checker


@pytest.fixture
async def test_client(
    integration_env,
    fake_session_store,
    mock_decrypt_encrypted_blob,
    mock_openrouter_client,
    mock_copyright_detector,
    mock_audio_quality_checker
):
    """
    Create test client with dependency overrides.

    Patches:
    - SessionStore with FakeSessionStore
    - decrypt_encrypted_blob with mock
    - OpenAI client with mock
    - CopyrightDetector with mock
    - AudioQualityChecker with mock
    """
    # Patch external modules and environment before importing app
    with patch("main.decrypt_encrypted_blob", new=mock_decrypt_encrypted_blob), \
         patch("verification_pipeline.CopyrightDetector", return_value=mock_copyright_detector), \
         patch("verification_pipeline.AudioQualityChecker", return_value=mock_audio_quality_checker), \
         patch("verification_pipeline.OpenAI", return_value=mock_openrouter_client), \
         patch("main.get_session_store", return_value=fake_session_store):

        from main import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client


@pytest.fixture
def bearer_token():
    """Valid bearer token for tests."""
    return "Bearer test-token-123"


@pytest.fixture
def sample_encrypted_request():
    """Sample encrypted blob verification request."""
    return {
        "walrusBlobId": "blob-123",
        "sealIdentity": "0x1234567890abcdef",
        "encryptedObjectBcsHex": "aa" * 100,  # Dummy encrypted data
        "metadata": {"dataset": "test", "title": "Test Audio"},
        "sessionKeyData": "key-data-base64"
    }


@pytest.fixture
def sample_metadata():
    """Sample metadata for verification."""
    return {
        "dataset": "test-dataset",
        "title": "Test Recording",
        "description": "A test audio recording",
        "metadata": {
            "country": "US",
            "category": "speech"
        }
    }
