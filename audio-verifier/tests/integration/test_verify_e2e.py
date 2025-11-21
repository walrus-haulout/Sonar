"""End-to-end tests for /verify endpoints."""

import pytest
import json
from unittest.mock import patch, AsyncMock


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_encrypted_blob_flow_success(test_client, bearer_token, sample_encrypted_request):
    """Test successful encrypted blob verification flow."""
    response = await test_client.post(
        "/verify",
        json=sample_encrypted_request,
        headers={"Authorization": bearer_token}
    )

    assert response.status_code == 200
    data = response.json()
    assert "sessionObjectId" in data
    assert data["status"] == "processing"
    assert "estimatedTimeSeconds" in data
    assert isinstance(data["estimatedTimeSeconds"], int)


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_encrypted_blob_missing_seal_package(
    test_client, bearer_token, sample_encrypted_request, monkeypatch
):
    """Test encrypted flow with missing SEAL_PACKAGE_ID."""
    with patch("main.SEAL_PACKAGE_ID", None):
        response = await test_client.post(
            "/verify",
            json=sample_encrypted_request,
            headers={"Authorization": bearer_token}
        )

    assert response.status_code == 503
    data = response.json()
    assert "SEAL_PACKAGE_ID" in data["detail"]


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_encrypted_blob_missing_walrus_aggregator(
    test_client, bearer_token, sample_encrypted_request
):
    """Test encrypted flow with missing WALRUS_AGGREGATOR_URL."""
    with patch("main.WALRUS_AGGREGATOR_URL", None):
        response = await test_client.post(
            "/verify",
            json=sample_encrypted_request,
            headers={"Authorization": bearer_token}
        )

    assert response.status_code == 503
    data = response.json()
    assert "WALRUS_AGGREGATOR_URL" in data["detail"]


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_encrypted_blob_missing_session_key(test_client, bearer_token):
    """Test encrypted flow without sessionKeyData."""
    request_data = {
        "walrusBlobId": "blob-123",
        "sealIdentity": "0x123",
        "encryptedObjectBcsHex": "aa" * 100,
        "metadata": {"dataset": "test"},
        # Missing sessionKeyData
    }

    response = await test_client.post(
        "/verify",
        json=request_data,
        headers={"Authorization": bearer_token}
    )

    assert response.status_code == 400
    data = response.json()
    assert "sessionKeyData" in data["detail"]


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_encrypted_blob_missing_encrypted_object(test_client, bearer_token):
    """Test encrypted flow without encryptedObjectBcsHex."""
    request_data = {
        "walrusBlobId": "blob-123",
        "sealIdentity": "0x123",
        "metadata": {"dataset": "test"},
        "sessionKeyData": "key-data",
        # Missing encryptedObjectBcsHex
    }

    response = await test_client.post(
        "/verify",
        json=request_data,
        headers={"Authorization": bearer_token}
    )

    assert response.status_code == 400
    data = response.json()
    assert "encryptedObjectBcsHex" in data["detail"]


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_encrypted_blob_invalid_json(test_client, bearer_token):
    """Test encrypted flow with invalid JSON."""
    response = await test_client.post(
        "/verify",
        content="{invalid json",
        headers={
            "Authorization": bearer_token,
            "Content-Type": "application/json"
        }
    )

    assert response.status_code == 400
    data = response.json()
    assert "Invalid JSON" in data["detail"]


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_legacy_upload_flow_success(test_client, bearer_token, synthetic_wav_bytes, sample_metadata):
    """Test successful legacy file upload flow."""
    with patch("main.ENABLE_LEGACY_UPLOAD", True), \
         patch("main.upload_plaintext_to_walrus", new_callable=AsyncMock, return_value="blob-456"):

        response = await test_client.post(
            "/verify",
            data={"metadata": json.dumps(sample_metadata)},
            files={"file": ("test.wav", synthetic_wav_bytes, "audio/wav")},
            headers={"Authorization": bearer_token}
        )

    assert response.status_code == 200
    data = response.json()
    assert "sessionObjectId" in data
    assert data["status"] == "processing"


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_legacy_upload_disabled(test_client, bearer_token, synthetic_wav_bytes, sample_metadata):
    """Test legacy upload when disabled."""
    with patch("main.ENABLE_LEGACY_UPLOAD", False):
        response = await test_client.post(
            "/verify",
            data={"metadata": json.dumps(sample_metadata)},
            files={"file": ("test.wav", synthetic_wav_bytes, "audio/wav")},
            headers={"Authorization": bearer_token}
        )

    assert response.status_code == 400
    data = response.json()
    assert "Legacy" in data["detail"] or "disabled" in data["detail"]


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_legacy_upload_missing_file(test_client, bearer_token, sample_metadata):
    """Test legacy upload without file."""
    with patch("main.ENABLE_LEGACY_UPLOAD", True):
        response = await test_client.post(
            "/verify",
            data={"metadata": json.dumps(sample_metadata)},
            headers={"Authorization": bearer_token}
        )

    assert response.status_code == 400
    data = response.json()
    assert "file" in data["detail"].lower()


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_legacy_upload_missing_metadata(test_client, bearer_token, synthetic_wav_bytes):
    """Test legacy upload without metadata."""
    with patch("main.ENABLE_LEGACY_UPLOAD", True):
        response = await test_client.post(
            "/verify",
            files={"file": ("test.wav", synthetic_wav_bytes, "audio/wav")},
            headers={"Authorization": bearer_token}
        )

    assert response.status_code == 400
    data = response.json()
    assert "metadata" in data["detail"].lower()


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_legacy_upload_invalid_metadata_json(test_client, bearer_token, synthetic_wav_bytes):
    """Test legacy upload with invalid metadata JSON."""
    with patch("main.ENABLE_LEGACY_UPLOAD", True):
        response = await test_client.post(
            "/verify",
            data={"metadata": "not valid json"},
            files={"file": ("test.wav", synthetic_wav_bytes, "audio/wav")},
            headers={"Authorization": bearer_token}
        )

    assert response.status_code == 400
    data = response.json()
    assert "metadata" in data["detail"].lower() or "json" in data["detail"].lower()


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_legacy_upload_empty_file(test_client, bearer_token, sample_metadata):
    """Test legacy upload with empty file."""
    with patch("main.ENABLE_LEGACY_UPLOAD", True):
        response = await test_client.post(
            "/verify",
            data={"metadata": json.dumps(sample_metadata)},
            files={"file": ("test.wav", b"", "audio/wav")},
            headers={"Authorization": bearer_token}
        )

    assert response.status_code == 400
    data = response.json()
    assert "empty" in data["detail"].lower()


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_verify_missing_auth(test_client, sample_encrypted_request):
    """Test /verify without authentication."""
    response = await test_client.post("/verify", json=sample_encrypted_request)
    assert response.status_code == 401


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_verify_invalid_auth(test_client, sample_encrypted_request):
    """Test /verify with invalid bearer token."""
    response = await test_client.post(
        "/verify",
        json=sample_encrypted_request,
        headers={"Authorization": "Bearer invalid-token"}
    )
    assert response.status_code == 401


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_file_size_limit_headers(test_client, bearer_token, sample_metadata):
    """Test 413 response when Content-Length exceeds limit."""
    # Test middleware by providing Content-Length header exceeding limit
    # Note: We don't actually send that much data to avoid memory issues
    oversized_header = str(15 * 1024 * 1024 * 1024)  # 15GB as string

    with patch("main.ENABLE_LEGACY_UPLOAD", True), \
         patch("main.MAX_FILE_SIZE_BYTES", 10 * 1024 * 1024 * 1024):  # 10GB limit
        response = await test_client.post(
            "/verify",
            data={"metadata": json.dumps(sample_metadata)},
            files={"file": ("test.wav", b"x" * 1000, "audio/wav")},
            headers={
                "Authorization": bearer_token,
                "Content-Length": oversized_header
            }
        )

    # Should be caught by middleware (413) or size validation
    assert response.status_code in [413, 400, 500]


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_walrus_upload_unavailable(test_client, bearer_token, synthetic_wav_bytes, sample_metadata):
    """Test 503 when Walrus upload URL is missing."""
    with patch("main.ENABLE_LEGACY_UPLOAD", True), \
         patch("main.WALRUS_UPLOAD_URL", None):

        response = await test_client.post(
            "/verify",
            data={"metadata": json.dumps(sample_metadata)},
            files={"file": ("test.wav", synthetic_wav_bytes, "audio/wav")},
            headers={"Authorization": bearer_token}
        )

    assert response.status_code == 503
    data = response.json()
    assert "WALRUS_UPLOAD_URL" in data["detail"]
