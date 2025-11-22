"""
Integration tests for Seal decryption service HTTP bridge.

These tests verify that the Python decryptor correctly communicates with
the TypeScript Seal SDK service via HTTP.
"""

import pytest
import httpx
import json
import os
from unittest.mock import Mock, patch
import sys

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from seal_decryptor import (
    _decrypt_with_seal_service,
    SealValidationError,
    SealAuthenticationError,
    SealNetworkError,
    SealTimeoutError,
)


@pytest.fixture
def mock_service_url():
    """Return the mock service URL."""
    return "http://127.0.0.1:3001"


@pytest.fixture
def sample_decrypt_request():
    """Sample decryption request data."""
    return {
        "encrypted_object_hex": "a1b2c3d4",  # Minimal hex for testing
        "identity": "deadbeef",
        "session_key_data": json.dumps({
            "sessionKey": "...",
            "keyServers": [{"objectId": "0x123", "weight": 1}],
            "threshold": 1,
            "packageId": "0xpkg",
            "creationTimeMs": 1000000000,
        }),
        "network": "mainnet",
    }


class TestDecryptWithSealService:
    """Test _decrypt_with_seal_service HTTP client."""

    def test_successful_decryption(self, sample_decrypt_request, mock_service_url):
        """Test successful decryption through service."""
        with patch("seal_decryptor.httpx.Client") as mock_client_class:
            # Mock successful response
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "plaintextHex": "48656c6c6f"  # "Hello" in hex
            }

            mock_client = Mock()
            mock_client.post.return_value = mock_response
            mock_client.__enter__.return_value = mock_client
            mock_client.__exit__.return_value = None

            mock_client_class.return_value = mock_client

            # Test
            result = _decrypt_with_seal_service(
                sample_decrypt_request["encrypted_object_hex"],
                sample_decrypt_request["identity"],
                sample_decrypt_request["session_key_data"],
            )

            # Verify
            assert result == bytes.fromhex("48656c6c6f")
            mock_client.post.assert_called_once()
            call_args = mock_client.post.call_args
            assert "/decrypt" in call_args[0][0]

    def test_missing_session_key(self):
        """Test that missing session key raises validation error."""
        with pytest.raises(SealValidationError):
            _decrypt_with_seal_service(
                "abc123",
                "identity",
                ""  # Empty session key
            )

    def test_authentication_error(self, sample_decrypt_request):
        """Test authentication error from service."""
        with patch("seal_decryptor.httpx.Client") as mock_client_class:
            # Mock auth error response
            mock_response = Mock()
            mock_response.status_code = 403
            mock_response.json.return_value = {
                "error": "SessionKey invalid or expired",
                "errorType": "authentication_failed"
            }

            mock_client = Mock()
            mock_client.post.return_value = mock_response
            mock_client.__enter__.return_value = mock_client
            mock_client.__exit__.return_value = None

            mock_client_class.return_value = mock_client

            # Test
            with pytest.raises(SealAuthenticationError):
                _decrypt_with_seal_service(
                    sample_decrypt_request["encrypted_object_hex"],
                    sample_decrypt_request["identity"],
                    sample_decrypt_request["session_key_data"],
                )

    def test_network_error_with_retry(self, sample_decrypt_request):
        """Test network error triggers retries."""
        with patch("seal_decryptor.httpx.Client") as mock_client_class:
            with patch("seal_decryptor.time.sleep"):  # Mock sleep to avoid delays
                # Mock network error
                mock_client = Mock()
                mock_client.post.side_effect = httpx.ConnectError("Connection refused")
                mock_client.__enter__.return_value = mock_client
                mock_client.__exit__.return_value = None

                mock_client_class.return_value = mock_client

                # Test
                with pytest.raises(SealNetworkError):
                    _decrypt_with_seal_service(
                        sample_decrypt_request["encrypted_object_hex"],
                        sample_decrypt_request["identity"],
                        sample_decrypt_request["session_key_data"],
                    )

                # Verify retries happened
                assert mock_client.post.call_count == 3

    def test_timeout_error(self, sample_decrypt_request):
        """Test timeout error from service."""
        with patch("seal_decryptor.httpx.Client") as mock_client_class:
            with patch("seal_decryptor.time.sleep"):
                # Mock timeout
                mock_client = Mock()
                mock_client.post.side_effect = httpx.TimeoutException("Request timeout")
                mock_client.__enter__.return_value = mock_client
                mock_client.__exit__.return_value = None

                mock_client_class.return_value = mock_client

                # Test
                with pytest.raises(SealTimeoutError):
                    _decrypt_with_seal_service(
                        sample_decrypt_request["encrypted_object_hex"],
                        sample_decrypt_request["identity"],
                        sample_decrypt_request["session_key_data"],
                    )

    def test_invalid_hex_response(self, sample_decrypt_request):
        """Test validation of hex response from service."""
        with patch("seal_decryptor.httpx.Client") as mock_client_class:
            # Mock response with invalid hex
            mock_response = Mock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "plaintextHex": "INVALID_HEX_XYZ"
            }

            mock_client = Mock()
            mock_client.post.return_value = mock_response
            mock_client.__enter__.return_value = mock_client
            mock_client.__exit__.return_value = None

            mock_client_class.return_value = mock_client

            # Test
            with pytest.raises(SealValidationError):
                _decrypt_with_seal_service(
                    sample_decrypt_request["encrypted_object_hex"],
                    sample_decrypt_request["identity"],
                    sample_decrypt_request["session_key_data"],
                )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
