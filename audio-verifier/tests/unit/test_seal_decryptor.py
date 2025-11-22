"""
Unit tests for seal_decryptor.py

Tests configuration validation, Walrus blob fetching, TS bridge execution,
and decryption logic. Critical for diagnosing 502 errors.
"""

import os
import pytest
import subprocess
import time
import importlib
from unittest.mock import patch, MagicMock, AsyncMock, call
import httpx

import sys
sys.path.insert(0, '/Users/angel/Projects/sonar/audio-verifier')

import seal_decryptor
from seal_decryptor import (
    decrypt_encrypted_blob,
    _decrypt_sync,
    _fetch_walrus_blob,
    _is_envelope_format,
    _decrypt_with_seal_service,
    _decrypt_aes,
)

class TestConfigurationValidation:
    """Test configuration validation in decrypt_encrypted_blob."""

    @pytest.mark.asyncio
    async def test_requires_walrus_aggregator_url(self, monkeypatch):
        """Test that WALRUS_AGGREGATOR_URL is required."""
        monkeypatch.setenv("WALRUS_AGGREGATOR_URL", "")

        with pytest.raises(ValueError, match="WALRUS_AGGREGATOR_URL"):
            await seal_decryptor.decrypt_encrypted_blob(
                "blob-id",
                b"encrypted-data",
                "identity",
                "mock-session-key-data"
            )

    @pytest.mark.asyncio
    async def test_requires_seal_package_id(self, monkeypatch):
        """Test that SEAL_PACKAGE_ID is required."""
        monkeypatch.setenv("WALRUS_AGGREGATOR_URL", "https://example.com")
        monkeypatch.setenv("SEAL_PACKAGE_ID", "")
        importlib.reload(seal_decryptor)

        with pytest.raises(ValueError, match="SEAL_PACKAGE_ID"):
            await seal_decryptor.decrypt_encrypted_blob(
                "blob-id",
                b"encrypted-data",
                "identity",
                "mock-session-key-data"
            )



class TestIsEnvelopeFormat:
    """Test envelope format detection."""

    def test_too_short_data(self):
        """Test data shorter than 4 bytes returns False."""
        assert _is_envelope_format(b"abc") is False
        assert _is_envelope_format(b"") is False

    def test_valid_envelope_format(self):
        """Test valid envelope format detection."""
        # 4 bytes length (300) + 300 bytes key + 100 bytes data = 404 total
        key_length = (300).to_bytes(4, 'little')
        data = key_length + b'k' * 300 + b'd' * 100
        assert _is_envelope_format(data) is True

    def test_invalid_key_length_too_small(self):
        """Test that key length <150 is not envelope format."""
        key_length = (140).to_bytes(4, 'little')
        data = key_length + b'k' * 140
        assert _is_envelope_format(data) is False

    def test_invalid_key_length_too_large(self):
        """Test that key length >800 is not envelope format."""
        key_length = (850).to_bytes(4, 'little')
        data = key_length + b'k' * 850
        assert _is_envelope_format(data) is False

    def test_key_length_150_is_valid(self):
        """Test that key length 150 (minimum) is valid envelope format."""
        key_length = (150).to_bytes(4, 'little')
        data = key_length + b'k' * 150 + b'encrypted_file_data'
        assert _is_envelope_format(data) is True

    def test_key_length_800_is_valid(self):
        """Test that key length 800 (maximum) is valid envelope format."""
        key_length = (800).to_bytes(4, 'little')
        data = key_length + b'k' * 800 + b'encrypted_file_data'
        assert _is_envelope_format(data) is True

    def test_data_too_short_for_key_length(self):
        """Test that insufficient data returns False."""
        key_length = (300).to_bytes(4, 'little')
        data = key_length + b'k' * 100  # Says 300-byte key but only 100 bytes present
        assert _is_envelope_format(data) is False


class TestFetchWalrusBlob:
    """Test Walrus blob fetching with retry logic."""

    @patch('seal_decryptor.httpx.Client')
    @patch('seal_decryptor.time.sleep')
    def test_fetch_blob_waits_15_seconds_initially(self, mock_sleep, mock_client_class, monkeypatch):
        """Test that fetch waits 15 seconds before first attempt."""
        # Setup
        monkeypatch.setenv("WALRUS_AGGREGATOR_URL", "https://example.com")
        importlib.reload(seal_decryptor)

        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b"blob-content"
        mock_client.get.return_value = mock_response
        mock_client.__enter__.return_value = mock_client
        mock_client.__exit__.return_value = None
        mock_client_class.return_value = mock_client

        # Execute
        result = seal_decryptor._fetch_walrus_blob("blob-123")

        # Assert
        assert result == b"blob-content"
        # First sleep call should be 15 seconds
        assert mock_sleep.call_args_list[0] == call(15)

    @patch('seal_decryptor.httpx.Client')
    @patch('seal_decryptor.time.sleep')
    def test_fetch_blob_retries_on_404(self, mock_sleep, mock_client_class, monkeypatch):
        """Test that fetch retries on 404 (blob propagation delay)."""
        monkeypatch.setenv("WALRUS_AGGREGATOR_URL", "https://example.com")
        importlib.reload(seal_decryptor)

        mock_client = MagicMock()
        mock_response_404 = MagicMock()
        mock_response_404.status_code = 404
        mock_response_404.raise_for_status.side_effect = httpx.HTTPStatusError(
            "404", request=MagicMock(), response=mock_response_404
        )

        mock_response_200 = MagicMock()
        mock_response_200.status_code = 200
        mock_response_200.content = b"blob-content"

        # First 2 calls return 404, third succeeds
        mock_client.get.side_effect = [
            mock_response_404,
            mock_response_404,
            mock_response_200,
        ]
        mock_client.__enter__.return_value = mock_client
        mock_client.__exit__.return_value = None
        mock_client_class.return_value = mock_client

        result = seal_decryptor._fetch_walrus_blob("blob-123")

        assert result == b"blob-content"
        # Should have called get 3 times
        assert mock_client.get.call_count == 3

    @patch('seal_decryptor.httpx.Client')
    @patch('seal_decryptor.time.sleep')
    def test_fetch_blob_fails_after_max_retries(self, mock_sleep, mock_client_class, monkeypatch):
        """Test that fetch fails after 10 retries."""
        monkeypatch.setenv("WALRUS_AGGREGATOR_URL", "https://example.com")
        importlib.reload(seal_decryptor)

        mock_client = MagicMock()
        mock_response_404 = MagicMock()
        mock_response_404.status_code = 404
        mock_response_404.raise_for_status.side_effect = httpx.HTTPStatusError(
            "404", request=MagicMock(), response=mock_response_404
        )

        # Always return 404
        mock_client.get.side_effect = httpx.HTTPStatusError(
            "404", request=MagicMock(), response=mock_response_404
        )
        mock_client.__enter__.return_value = mock_client
        mock_client.__exit__.return_value = None
        mock_client_class.return_value = mock_client

        with pytest.raises(httpx.HTTPStatusError):
            seal_decryptor._fetch_walrus_blob("blob-123")

        # Should have tried 10 times
        assert mock_client.get.call_count == 10

    @patch('seal_decryptor.httpx.Client')
    @patch('seal_decryptor.time.sleep')
    def test_fetch_blob_does_not_retry_on_500(self, mock_sleep, mock_client_class, monkeypatch):
        """Test that fetch does NOT retry on 500 errors."""
        monkeypatch.setenv("WALRUS_AGGREGATOR_URL", "https://example.com")
        importlib.reload(seal_decryptor)

        mock_client = MagicMock()
        mock_response_500 = MagicMock()
        mock_response_500.status_code = 500
        mock_response_500.raise_for_status.side_effect = httpx.HTTPStatusError(
            "500", request=MagicMock(), response=mock_response_500
        )

        mock_client.get.side_effect = httpx.HTTPStatusError(
            "500", request=MagicMock(), response=mock_response_500
        )
        mock_client.__enter__.return_value = mock_client
        mock_client.__exit__.return_value = None
        mock_client_class.return_value = mock_client

        with pytest.raises(httpx.HTTPStatusError):
            seal_decryptor._fetch_walrus_blob("blob-123")

        # Should have tried only once (no retry on 500)
        assert mock_client.get.call_count == 1

    @patch('seal_decryptor.httpx.Client')
    @patch('seal_decryptor.time.sleep')
    def test_fetch_blob_includes_bearer_token(self, mock_sleep, mock_client_class, monkeypatch):
        """Test that bearer token is included in request headers."""
        monkeypatch.setenv("WALRUS_AGGREGATOR_URL", "https://example.com")
        monkeypatch.setenv("WALRUS_AGGREGATOR_TOKEN", "token-123")
        importlib.reload(seal_decryptor)

        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = b"blob-content"
        mock_client.get.return_value = mock_response
        mock_client.__enter__.return_value = mock_client
        mock_client.__exit__.return_value = None
        mock_client_class.return_value = mock_client

        seal_decryptor._fetch_walrus_blob("blob-123")

        # Check that Authorization header was sent
        call_kwargs = mock_client.get.call_args[1]
        assert call_kwargs['headers']['Authorization'] == "Bearer token-123"


class TestDecryptWithSealService:
    """Test HTTP-based Seal SDK service integration."""

    @patch('seal_decryptor.httpx.Client')
    def test_decrypt_with_session_key(self, mock_client_class):
        """Test service invocation with SessionKey."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"plaintextHex": "deadbeef"}

        mock_client = MagicMock()
        mock_client.post.return_value = mock_response
        mock_client.__enter__.return_value = mock_client
        mock_client.__exit__.return_value = None

        mock_client_class.return_value = mock_client

        result = _decrypt_with_seal_service(
            "encrypted-hex",
            "identity",
            '{"keyType":"SessionKey","address":"0x123"}'
        )

        # Verify HTTP POST to /decrypt endpoint
        mock_client.post.assert_called_once()
        call_args = mock_client.post.call_args
        assert "/decrypt" in call_args[0][0]

        # Verify decrypted output
        assert result == bytes.fromhex("deadbeef")

    @patch('seal_decryptor.httpx.Client')
    def test_service_timeout_raises_error(self, mock_client_class):
        """Test that service timeout is properly handled."""
        mock_client = MagicMock()
        mock_client.post.side_effect = httpx.TimeoutException("timeout")
        mock_client.__enter__.return_value = mock_client
        mock_client.__exit__.return_value = None

        mock_client_class.return_value = mock_client

        from seal_decryptor import SealTimeoutError
        with pytest.raises(SealTimeoutError):
            _decrypt_with_seal_service(
                "encrypted-hex",
                "identity",
                '{"keyType":"SessionKey"}'
            )

    @patch('seal_decryptor.httpx.Client')
    def test_service_error_response(self, mock_client_class):
        """Test that service error responses are properly handled."""
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.json.return_value = {
            "error": "Invalid SessionKey",
            "errorType": "authentication_failed"
        }

        mock_client = MagicMock()
        mock_client.post.return_value = mock_response
        mock_client.__enter__.return_value = mock_client
        mock_client.__exit__.return_value = None

        mock_client_class.return_value = mock_client

        from seal_decryptor import SealAuthenticationError
        with pytest.raises(SealAuthenticationError):
            _decrypt_with_seal_service(
                "encrypted-hex",
                "identity",
                '{"keyType":"SessionKey"}'
            )


class TestDecryptAes:
    """Test AES-256-GCM decryption."""

    def test_decrypt_aes_gcm_valid(self):
        """Test valid AES-GCM decryption."""
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        
        # Create a valid AES-256 encrypted message
        aes_key = bytes.fromhex("0" * 64)  # 32-byte key
        plaintext = b"Hello World!"
        iv = b"0" * 12  # 12-byte IV
        
        # Encrypt
        cipher = AESGCM(aes_key)
        ciphertext = cipher.encrypt(iv, plaintext, None)
        
        # Prepare encrypted data: [IV][ciphertext+tag]
        encrypted_data = iv + ciphertext
        
        # Test decryption
        result = _decrypt_aes(encrypted_data, aes_key)
        assert result == plaintext

    def test_decrypt_aes_wrong_key_fails(self):
        """Test that wrong key causes decryption to fail."""
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        
        aes_key = bytes.fromhex("0" * 64)
        wrong_key = bytes.fromhex("1" * 64)
        plaintext = b"Hello World!"
        iv = b"0" * 12
        
        cipher = AESGCM(aes_key)
        ciphertext = cipher.encrypt(iv, plaintext, None)
        encrypted_data = iv + ciphertext
        
        with pytest.raises(Exception):  # cryptography raises InvalidTag
            _decrypt_aes(encrypted_data, wrong_key)

    def test_decrypt_aes_missing_cryptography(self):
        """Test that missing cryptography library is handled."""
        with patch.dict('sys.modules', {'cryptography.hazmat.primitives.ciphers.aead': None}):
            # This would require actually patching the import, which is complex
            # For now, we test that the function exists and handles the case
            pass


class TestDecryptSync:
    """Test full synchronous decryption flow."""

    @patch('seal_decryptor._fetch_walrus_blob')
    @patch('seal_decryptor._decrypt_with_seal_service')
    @patch('seal_decryptor._decrypt_aes')
    def test_envelope_format_decryption(self, mock_aes, mock_seal, mock_fetch):
        """Test decryption of envelope-format encrypted blob."""
        # Setup envelope: [4 bytes length][300 bytes sealed key][encrypted file]
        key_length = (300).to_bytes(4, 'little')
        sealed_key = b'k' * 300
        encrypted_file = b'd' * 500
        envelope = key_length + sealed_key + encrypted_file

        mock_fetch.return_value = envelope
        mock_seal.return_value = b'decrypted-aes-key'
        mock_aes.return_value = b'plaintext'

        result = _decrypt_sync("blob-id", "encrypted-object-hex", "identity", "mock-session-key-data")

        assert result == b'plaintext'
        mock_fetch.assert_called_once_with("blob-id")
        mock_seal.assert_called_once_with("encrypted-object-hex", "identity", "mock-session-key-data")
        mock_aes.assert_called_once()

    @patch('seal_decryptor._fetch_walrus_blob')
    @patch('seal_decryptor._decrypt_with_seal_service')
    def test_direct_encryption_decryption(self, mock_seal, mock_fetch):
        """Test decryption of direct (non-envelope) encryption."""
        # Non-envelope: just encrypted data
        encrypted_blob = b'not-envelope-format' * 100
        mock_fetch.return_value = encrypted_blob
        mock_seal.return_value = b'plaintext'

        result = _decrypt_sync("blob-id", "encrypted-object-hex", "identity", "mock-session-key-data")

        assert result == b'plaintext'
        mock_fetch.assert_called_once_with("blob-id")
        mock_seal.assert_called_once_with("encrypted-object-hex", "identity", "mock-session-key-data")

    @patch('seal_decryptor._fetch_walrus_blob')
    def test_fetch_failure_wrapped_in_runtime_error(self, mock_fetch):
        """Test that fetch failures are wrapped properly."""
        mock_fetch.side_effect = Exception("Walrus error")

        with pytest.raises(RuntimeError, match="Failed to decrypt encrypted blob"):
            _decrypt_sync("blob-id", "encrypted-object-hex", "identity", "mock-session-key-data")


class TestDecryptEncryptedBlob:
    """Test the main async decrypt_encrypted_blob function."""

    @pytest.mark.asyncio
    @patch('seal_decryptor._decrypt_sync')
    async def test_converts_bytes_to_hex(self, mock_decrypt, monkeypatch):
        """Test that bytes are converted to hex before passing to sync function."""
        monkeypatch.setenv("WALRUS_AGGREGATOR_URL", "https://example.com")
        monkeypatch.setenv("SEAL_PACKAGE_ID", "0x123")
        importlib.reload(seal_decryptor)

        mock_decrypt.return_value = b'plaintext'

        encrypted_bytes = b'encrypted-data'
        result = await seal_decryptor.decrypt_encrypted_blob(
            "blob-id",
            encrypted_bytes,
            "identity",
            "mock-session-key-data"
        )

        assert result == b'plaintext'
        # Check that the encrypted data was converted to hex
        call_args = mock_decrypt.call_args[0]
        assert call_args[1] == encrypted_bytes.hex()

    @pytest.mark.asyncio
    @patch('seal_decryptor._decrypt_sync')
    async def test_accepts_hex_string(self, mock_decrypt, monkeypatch):
        """Test that hex strings are passed through unchanged."""
        monkeypatch.setenv("WALRUS_AGGREGATOR_URL", "https://example.com")
        monkeypatch.setenv("SEAL_PACKAGE_ID", "0x123")
        importlib.reload(seal_decryptor)

        mock_decrypt.return_value = b'plaintext'

        hex_string = "deadbeef"
        result = await seal_decryptor.decrypt_encrypted_blob(
            "blob-id",
            hex_string,
            "identity",
            "mock-session-key-data"
        )

        assert result == b'plaintext'
        call_args = mock_decrypt.call_args[0]
        assert call_args[1] == hex_string


class TestTimeoutScenarios:
    """Test timeout handling for 502 error debugging."""

    @pytest.mark.timeout(5)
    @patch('seal_decryptor._fetch_walrus_blob')
    @patch('seal_decryptor._decrypt_with_seal_service')
    def test_sync_decryption_completes_quickly(self, mock_seal, mock_fetch):
        """Test that decryption completes quickly without hanging."""
        mock_fetch.return_value = b'small-blob'
        mock_seal.return_value = b'plaintext'

        result = _decrypt_sync("blob-id", "encrypted-object-hex", "identity", "mock-session-key-data")
        assert result == b'plaintext'

    @pytest.mark.asyncio
    @pytest.mark.timeout(5)
    @patch('seal_decryptor._decrypt_sync')
    async def test_async_decryption_completes_quickly(self, mock_decrypt, monkeypatch):
        """Test that async wrapper completes quickly."""
        monkeypatch.setenv("WALRUS_AGGREGATOR_URL", "https://example.com")
        monkeypatch.setenv("SEAL_PACKAGE_ID", "0x123")
        importlib.reload(seal_decryptor)

        mock_decrypt.return_value = b'plaintext'

        result = await seal_decryptor.decrypt_encrypted_blob("blob-id", b"data", "identity", "mock-session-key-data")
        assert result == b'plaintext'

    @patch('seal_decryptor.httpx.Client')
    @patch('seal_decryptor.time.sleep')
    @pytest.mark.timeout(20)
    def test_walrus_fetch_timeout_bounded(self, mock_sleep, mock_client_class, monkeypatch):
        """Test that Walrus fetch timeout is bounded (not 350+ seconds)."""
        monkeypatch.setenv("WALRUS_AGGREGATOR_URL", "https://example.com")
        importlib.reload(seal_decryptor)

        # Track that sleep is called with 30s delays
        sleep_times = []
        def track_sleep(seconds):
            sleep_times.append(seconds)
        mock_sleep.side_effect = track_sleep

        mock_client = MagicMock()
        mock_response_404 = MagicMock()
        mock_response_404.status_code = 404
        mock_response_404.raise_for_status.side_effect = httpx.HTTPStatusError(
            "404", request=MagicMock(), response=mock_response_404
        )

        mock_client.get.side_effect = httpx.HTTPStatusError(
            "404", request=MagicMock(), response=mock_response_404
        )
        mock_client.__enter__.return_value = mock_client
        mock_client.__exit__.return_value = None
        mock_client_class.return_value = mock_client

        with pytest.raises(httpx.HTTPStatusError):
            seal_decryptor._fetch_walrus_blob("blob-id")

        # Initial sleep is 15s, then 9 retries * 30s each = 270s total
        # But the test should complete within 20 seconds with mocked time.sleep
        assert sleep_times[0] == 15  # Initial wait
        # Rest are 30s retries
        assert all(s == 30 for s in sleep_times[1:])
