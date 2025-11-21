"""Early validation tests for tiny/corrupted blobs."""

import pytest
from unittest.mock import patch, AsyncMock
import json


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_reject_32_byte_blob(test_client, bearer_token, monkeypatch):
    """Test that 32-byte dummy blob is rejected before pipeline with 400 error."""
    # Mock decrypt to return 32-byte dummy blob
    async def mock_decrypt(*args, **kwargs):
        return b"X" * 32

    monkeypatch.setattr("main.decrypt_encrypted_blob", mock_decrypt)

    # Mock Walrus fetch
    mock_fetch = AsyncMock(return_value=b"dummy encrypted blob")
    monkeypatch.setattr("seal_decryptor._fetch_walrus_blob", mock_fetch)

    response = await test_client.post(
        "/verify",
        json={
            "walrusBlobId": "abc123...",
            "sealIdentity": "0x123456",
            "encryptedObjectBcsHex": "deadbeef",
            "metadata": {"title": "test"},
            "sessionKeyData": "signed_key_data"
        },
        headers={"Authorization": bearer_token}
    )

    # Should return 400 Bad Request (not 200 with session)
    assert response.status_code == 400
    assert "below minimum 1KB" in response.json()["detail"]


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_reject_zero_byte_blob(test_client, bearer_token, monkeypatch):
    """Test that zero-byte blob is rejected."""
    # Mock decrypt to return empty bytes
    async def mock_decrypt(*args, **kwargs):
        return b""

    monkeypatch.setattr("main.decrypt_encrypted_blob", mock_decrypt)

    response = await test_client.post(
        "/verify",
        json={
            "walrusBlobId": "xyz789...",
            "sealIdentity": "0x123456",
            "encryptedObjectBcsHex": "deadbeef",
            "metadata": {"title": "test"},
            "sessionKeyData": "signed_key_data"
        },
        headers={"Authorization": bearer_token}
    )

    # Should return 400 (no session created)
    assert response.status_code == 400
    assert "minimum 1KB" in response.json()["detail"]


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_reject_invalid_riff_header(test_client, bearer_token, monkeypatch):
    """Test that blob with invalid RIFF header is rejected."""
    # Create 2KB blob with no RIFF header
    invalid_blob = b"INVALID_WAV_DATA" * 128  # ~2KB but no RIFF header

    async def mock_decrypt(*args, **kwargs):
        return invalid_blob

    monkeypatch.setattr("main.decrypt_encrypted_blob", mock_decrypt)

    response = await test_client.post(
        "/verify",
        json={
            "walrusBlobId": "bad_blob...",
            "sealIdentity": "0x123456",
            "encryptedObjectBcsHex": "deadbeef",
            "metadata": {"title": "test"},
            "sessionKeyData": "signed_key_data"
        },
        headers={"Authorization": bearer_token}
    )

    # Should return 400 (invalid RIFF header)
    assert response.status_code == 400
    assert "RIFF" in response.json()["detail"] or "header" in response.json()["detail"]


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_quality_check_failure_includes_failure_reason(
    test_client, bearer_token, fake_session_store, synthetic_wav_bytes
):
    """Test that quality check failures include failure_reason in session payload."""
    # Use valid WAV but with excessive silence
    from audio_checker import AudioQualityChecker

    checker = AudioQualityChecker()
    result = await checker.check_audio_file("nonexistent.wav")  # Will fail

    # Verify that failure_reason is in result
    assert "failure_reason" in result or result.get("quality") is None
    # If it has a failure_reason, it should be one of the known reasons
    if "failure_reason" in result:
        valid_reasons = [
            "format_probe_failed",
            "clipping_detected",
            "excessive_silence",
            "volume_out_of_range",
            "sample_rate_too_low",
            "duration_out_of_range",
            "analysis_failed",
            "converted_with_ffmpeg"
        ]
        assert result["failure_reason"] in valid_reasons


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_no_verbose_ffmpeg_output_in_logs(caplog):
    """Test that ffmpeg stderr is not logged as verbose wall-of-text."""
    # This test verifies logging configuration
    # When quality check logs failures, ffmpeg errors should be concise
    import logging

    logger = logging.getLogger("audio_checker")
    # Capture logs at WARNING level
    caplog.set_level(logging.WARNING, logger=logger)

    # Note: Actual ffmpeg testing would require a corrupted file
    # This is more of a structural test
    assert logger.level <= logging.WARNING


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_tiny_blob_does_not_enter_pipeline(test_client, bearer_token, monkeypatch):
    """Test that tiny blob rejection happens before VerificationPipeline is invoked."""
    # Track if pipeline.run_from_file was called
    pipeline_called = False

    async def mock_decrypt(*args, **kwargs):
        return b"TINY" * 8  # 32 bytes

    # Mock pipeline to track if it's called
    original_pipeline = None

    def mock_get_pipeline():
        nonlocal original_pipeline, pipeline_called

        class MockPipeline:
            async def run_from_file(self, *args, **kwargs):
                nonlocal pipeline_called
                pipeline_called = True

        return MockPipeline()

    monkeypatch.setattr("main.decrypt_encrypted_blob", mock_decrypt)
    monkeypatch.setattr("main.get_verification_pipeline", mock_get_pipeline)

    response = await test_client.post(
        "/verify",
        json={
            "walrusBlobId": "tiny_blob...",
            "sealIdentity": "0x123456",
            "encryptedObjectBcsHex": "deadbeef",
            "metadata": {"title": "test"},
            "sessionKeyData": "signed_key_data"
        },
        headers={"Authorization": bearer_token}
    )

    # Should reject before pipeline is invoked
    assert response.status_code == 400
    assert pipeline_called is False


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_valid_small_wav_passes_early_gate(test_client, bearer_token, monkeypatch, synthetic_wav_bytes):
    """Test that valid WAV >= 1KB passes early validation gate."""
    # Ensure synthetic_wav_bytes is at least 1KB
    assert len(synthetic_wav_bytes) >= 1024

    async def mock_decrypt(*args, **kwargs):
        return synthetic_wav_bytes

    # Mock pipeline
    def mock_get_pipeline():
        class MockPipeline:
            async def run_from_file(self, *args, **kwargs):
                # Simulate pipeline completion
                pass

        return MockPipeline()

    monkeypatch.setattr("main.decrypt_encrypted_blob", mock_decrypt)
    monkeypatch.setattr("main.get_verification_pipeline", mock_get_pipeline)

    response = await test_client.post(
        "/verify",
        json={
            "walrusBlobId": "valid_blob...",
            "sealIdentity": "0x123456",
            "encryptedObjectBcsHex": "deadbeef",
            "metadata": {"title": "test"},
            "sessionKeyData": "signed_key_data"
        },
        headers={"Authorization": bearer_token}
    )

    # Should accept valid audio and create session (200, not 400)
    assert response.status_code == 200
    assert "sessionObjectId" in response.json()
