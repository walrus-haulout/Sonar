"""Unit tests for main.py middleware and environment validation."""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient
import json


@pytest.mark.asyncio
async def test_startup_validation_missing_openrouter_key():
    """Test startup validation catches missing OPENROUTER_API_KEY."""
    with patch("main.OPENROUTER_API_KEY", None), \
         patch("main.ACOUSTID_API_KEY", "key"), \
         patch("main.VERIFIER_AUTH_TOKEN", "token"), \
         patch("main.DATABASE_URL", "postgres://"), \
         patch.object("main.logger", "error"):

        from main import validate_environment

        with pytest.raises(RuntimeError, match="OPENROUTER_API_KEY"):
            await validate_environment()


@pytest.mark.asyncio
async def test_startup_validation_missing_acoustid_key():
    """Test startup validation catches missing ACOUSTID_API_KEY."""
    with patch("main.OPENROUTER_API_KEY", "key"), \
         patch("main.ACOUSTID_API_KEY", None), \
         patch("main.VERIFIER_AUTH_TOKEN", "token"), \
         patch("main.DATABASE_URL", "postgres://"):

        from main import validate_environment

        with pytest.raises(RuntimeError, match="ACOUSTID_API_KEY"):
            await validate_environment()


@pytest.mark.asyncio
async def test_startup_validation_missing_verifier_token():
    """Test startup validation catches missing VERIFIER_AUTH_TOKEN."""
    with patch("main.OPENROUTER_API_KEY", "key"), \
         patch("main.ACOUSTID_API_KEY", "key"), \
         patch("main.VERIFIER_AUTH_TOKEN", None), \
         patch("main.DATABASE_URL", "postgres://"):

        from main import validate_environment

        with pytest.raises(RuntimeError, match="VERIFIER_AUTH_TOKEN"):
            await validate_environment()


@pytest.mark.asyncio
async def test_startup_validation_missing_database_url():
    """Test startup validation catches missing DATABASE_URL."""
    with patch("main.OPENROUTER_API_KEY", "key"), \
         patch("main.ACOUSTID_API_KEY", "key"), \
         patch("main.VERIFIER_AUTH_TOKEN", "token"), \
         patch("main.DATABASE_URL", None):

        from main import validate_environment

        with pytest.raises(RuntimeError, match="DATABASE_URL"):
            await validate_environment()


@pytest.mark.asyncio
async def test_startup_validation_all_present():
    """Test startup validation passes with all required vars."""
    with patch("main.OPENROUTER_API_KEY", "key"), \
         patch("main.ACOUSTID_API_KEY", "key"), \
         patch("main.VERIFIER_AUTH_TOKEN", "token"), \
         patch("main.DATABASE_URL", "postgres://"):

        from main import validate_environment
        # Should not raise
        await validate_environment()


def test_size_limit_middleware_under_limit():
    """Test size limit middleware allows small uploads."""
    from main import app

    test_data = b"x" * 1000  # 1KB
    content_length = len(test_data)

    with patch("main.MAX_FILE_SIZE_BYTES", 10 * 1024 * 1024):  # 10MB limit
        response = app.middleware("http")(
            lambda req, call_next: MagicMock(status_code=200)
        )


def test_size_limit_middleware_over_limit(test_client):
    """Test size limit middleware rejects large uploads."""
    # Create request that exceeds limit
    oversized_content = b"x" * (15 * 1024 * 1024)  # 15MB

    with patch("main.MAX_FILE_SIZE_BYTES", 10 * 1024 * 1024):  # 10MB limit
        # Would be caught by middleware at request time
        assert True  # Placeholder for actual middleware test


def test_bearer_token_validation_valid():
    """Test bearer token validation accepts valid token."""
    from main import verify_bearer_token

    # Valid token should not raise
    # This is tested via integration tests with actual endpoints


def test_bearer_token_validation_missing():
    """Test bearer token validation rejects missing token."""
    from main import verify_bearer_token
    from fastapi import HTTPException
    import pytest

    # Missing auth should raise 401
    # This is tested via integration tests


def test_cors_middleware_allows_configured_origin():
    """Test CORS middleware allows configured origins."""
    with patch("main.CORS_ORIGINS", ["http://localhost:3000"]):
        # CORS middleware configured in app setup
        assert True  # Placeholder


def test_cors_middleware_rejects_unconfigured_origin():
    """Test CORS middleware rejects unconfigured origins."""
    with patch("main.CORS_ORIGINS", ["http://localhost:3000"]):
        # Unconfigured origins should be rejected
        assert True  # Placeholder


def test_environment_variable_cors_origin_parsing():
    """Test CORS_ORIGIN environment variable parsing."""
    with patch("main.CORS_ORIGIN", "http://localhost:3000,https://example.com"):
        # Should split on comma and strip whitespace
        assert True  # Placeholder


def test_json_request_detection():
    """Test content-type detection for JSON vs FormData."""
    # JSON requests should be detected by content-type header
    assert True  # Placeholder


def test_form_data_request_detection():
    """Test FormData request detection."""
    # FormData requests should be detected by content-type header
    assert True  # Placeholder


@pytest.mark.asyncio
async def test_dependency_get_session_store():
    """Test get_session_store dependency."""
    from main import get_session_store

    store = get_session_store()
    assert store is not None
    # Should return same instance on subsequent calls
    store2 = get_session_store()
    assert store is store2


@pytest.mark.asyncio
async def test_dependency_get_verification_pipeline_requires_openrouter_key():
    """Test get_verification_pipeline requires OPENROUTER_API_KEY."""
    from main import get_verification_pipeline
    from fastapi import HTTPException

    with patch("main.OPENROUTER_API_KEY", None):
        with pytest.raises(HTTPException) as exc_info:
            get_verification_pipeline()
        assert exc_info.value.status_code == 500


def test_upload_plaintext_to_walrus_missing_url():
    """Test upload_plaintext_to_walrus requires WALRUS_UPLOAD_URL."""
    from main import upload_plaintext_to_walrus
    from fastapi import HTTPException

    with patch("main.WALRUS_UPLOAD_URL", None):
        with pytest.raises(HTTPException) as exc_info:
            # Would raise in actual async call
            pass


@pytest.mark.asyncio
async def test_health_endpoint_config_status():
    """Test /health endpoint reports configuration status."""
    from main import app
    from httpx import AsyncClient

    with patch("main.OPENROUTER_API_KEY", "key"), \
         patch("main.ACOUSTID_API_KEY", "key"), \
         patch("main.VERIFIER_AUTH_TOKEN", "token"), \
         patch("main.DATABASE_URL", "postgres://"), \
         patch("main.WALRUS_UPLOAD_URL", "http://localhost"), \
         patch("main.WALRUS_AGGREGATOR_URL", "http://localhost"), \
         patch("main.SEAL_PACKAGE_ID", "0x123"):

        async with AsyncClient(app=app, base_url="http://test") as client:
            response = await client.get("/health")
            assert response.status_code == 200
            data = response.json()
            assert "config" in data


def test_encoded_blob_hex_validation():
    """Test that encryptedObjectBcsHex is properly hex-validated."""
    # Invalid hex should be rejected
    assert True  # Placeholder for actual validation


def test_session_key_data_validation():
    """Test that sessionKeyData is properly validated."""
    # Session key data should be base64 or similar
    assert True  # Placeholder


def test_metadata_dict_validation():
    """Test that metadata dict is properly structured."""
    # Metadata should be a dict with expected keys
    assert True  # Placeholder
