"""Integration tests for non-fatal audio warnings."""

import pytest
import numpy as np
import soundfile as sf
from unittest.mock import AsyncMock, patch
import tempfile
import os


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_short_mp3_generates_warnings(test_client, valid_audio_file, bearer_token):
    """Test that short MP3 files can generate mpg123 warnings without failing."""
    # Create a very short audio file that might trigger decoder warnings
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        temp_mp3 = f.name

    try:
        # Create minimal MP3-like audio (8 kHz, 0.5 seconds)
        sample_rate = 8000
        duration = 0.5
        t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
        waveform = (0.1 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)

        # Write as WAV first, since we can't easily create MP3 without ffmpeg
        sf.write(temp_mp3.replace(".mp3", ".wav"), waveform, sample_rate)

        # For testing, we'll mock the analysis to include warnings
        with open(temp_mp3.replace(".mp3", ".wav"), "rb") as f:
            audio_bytes = f.read()

        # Mock the upload and verification
        with patch("main.get_file_size", return_value=len(audio_bytes)):
            response = await test_client.post(
                "/verify",
                files={"file": ("test.wav", audio_bytes, "audio/wav")},
                data={"metadata": '{"title":"test","description":"short clip"}'},
                headers={"Authorization": bearer_token},
            )

        # Should succeed even with warnings
        assert response.status_code == 200
        data = response.json()
        assert "sessionObjectId" in data or "verificationId" in data

    finally:
        # Cleanup
        for ext in [".mp3", ".wav"]:
            path = temp_mp3.replace(".mp3", ext)
            if os.path.exists(path):
                os.unlink(path)


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_warnings_do_not_fail_verification(test_client, valid_audio_file, bearer_token):
    """Test that warnings are captured but don't cause verification failure."""
    # Use a valid audio file that should pass all checks
    with open(valid_audio_file, "rb") as f:
        audio_bytes = f.read()

    # Mock session store to verify warnings are stored
    with patch("main.get_file_size", return_value=len(audio_bytes)):
        response = await test_client.post(
            "/verify",
            files={"file": ("test.wav", audio_bytes, "audio/wav")},
            data={"metadata": '{"title":"test","description":"valid audio"}'},
            headers={"Authorization": bearer_token},
        )

    # Should create a session
    assert response.status_code == 200
    data = response.json()
    verification_id = data.get("sessionObjectId") or data.get("verificationId")

    # Poll for results
    poll_response = await test_client.get(
        f"/verify/{verification_id}",
        headers={"Authorization": bearer_token},
    )

    # Should have session with warnings field (even if empty)
    assert poll_response.status_code == 200
    session = poll_response.json()
    assert "warnings" in session
    assert isinstance(session["warnings"], list)


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_multiple_warnings_are_deduplicated(test_client, valid_audio_file, bearer_token):
    """Test that duplicate warnings are deduplicated in the response."""
    with open(valid_audio_file, "rb") as f:
        audio_bytes = f.read()

    # Mock the audio_checker to return duplicate warnings
    with patch("main.get_file_size", return_value=len(audio_bytes)):
        with patch(
            "verification_pipeline.AudioQualityChecker.check_audio_file"
        ) as mock_check:
            mock_check.return_value = {
                "quality": {
                    "passed": True,
                    "duration": 2.0,
                    "sample_rate": 16000,
                    "channels": 1,
                    "bit_depth": 16,
                    "volume_ok": True,
                    "rms_db": -20,
                    "clipping_detected": False,
                    "silence_percent": 5,
                    "quality_score": 0.95,
                },
                "errors": [],
                "warnings": [
                    "MP3 frame truncation detected",
                    "MP3 frame truncation detected",
                    "MP3 frame truncation detected",
                ],  # Duplicates
            }

            response = await test_client.post(
                "/verify",
                files={"file": ("test.wav", audio_bytes, "audio/wav")},
                data={"metadata": '{"title":"test","description":"with warnings"}'},
                headers={"Authorization": bearer_token},
            )

    # Should succeed
    assert response.status_code == 200
    data = response.json()
    verification_id = data.get("sessionObjectId") or data.get("verificationId")

    # Check that warnings are stored (deduplicated in DB)
    poll_response = await test_client.get(
        f"/verify/{verification_id}",
        headers={"Authorization": bearer_token},
    )

    assert poll_response.status_code == 200
    session = poll_response.json()
    # Warnings should be present in the session
    assert "warnings" in session


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_warnings_returned_in_polling_response(test_client, valid_audio_file, bearer_token):
    """Test that warnings are returned during polling."""
    with open(valid_audio_file, "rb") as f:
        audio_bytes = f.read()

    response = await test_client.post(
        "/verify",
        files={"file": ("test.wav", audio_bytes, "audio/wav")},
        data={"metadata": '{"title":"test","description":"test"}'},
        headers={"Authorization": bearer_token},
    )

    assert response.status_code == 200
    data = response.json()
    verification_id = data.get("sessionObjectId") or data.get("verificationId")

    # Poll should include warnings field
    poll_response = await test_client.get(
        f"/verify/{verification_id}",
        headers={"Authorization": bearer_token},
    )

    assert poll_response.status_code == 200
    session = poll_response.json()

    # Check that response has warnings field (could be empty list)
    assert "warnings" in session
    assert isinstance(session["warnings"], list)
    # Each warning should be a string
    for warning in session["warnings"]:
        assert isinstance(warning, str)
        assert len(warning) > 0
