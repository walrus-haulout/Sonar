"""
Seal Decryptor Helper
Fetches encrypted blobs from Walrus and decrypts them using TypeScript bridge with SessionKey authentication.
"""

import asyncio
import json
import logging
import os
import subprocess
import tempfile
import time
from typing import Optional, TYPE_CHECKING
import httpx

if TYPE_CHECKING:
    from Crypto.Cipher import AES as _AES  # type: ignore
    from Crypto.Util import Counter as _Counter  # type: ignore

logger = logging.getLogger(__name__)


# Custom exception hierarchy for structured error handling
class SealDecryptionError(Exception):
    """Base exception for Seal decryption errors."""
    def __init__(self, message: str, error_type: str = "unknown", http_status: int = 500):
        """
        Initialize SealDecryptionError.

        Args:
            message: Human-readable error message
            error_type: Machine-readable error classification
            http_status: Suggested HTTP status code (4xx for client errors, 5xx for server)
        """
        self.message = message
        self.error_type = error_type
        self.http_status = http_status
        super().__init__(message)


class SealAuthenticationError(SealDecryptionError):
    """SessionKey or permission-related errors (4xx client error)."""
    def __init__(self, message: str):
        super().__init__(message, error_type="authentication_failed", http_status=403)


class SealValidationError(SealDecryptionError):
    """Malformed input or invalid data (4xx client error)."""
    def __init__(self, message: str):
        super().__init__(message, error_type="validation_failed", http_status=400)


class SealNetworkError(SealDecryptionError):
    """Key server or network-related errors (5xx server error, transient)."""
    def __init__(self, message: str):
        super().__init__(message, error_type="network_error", http_status=502)


class SealTimeoutError(SealDecryptionError):
    """Decryption operation timed out (5xx server error, transient)."""
    def __init__(self, message: str):
        super().__init__(message, error_type="timeout", http_status=504)

# Configuration from environment
WALRUS_AGGREGATOR_URL = os.getenv("WALRUS_AGGREGATOR_URL")
WALRUS_AGGREGATOR_TOKEN = os.getenv("WALRUS_AGGREGATOR_TOKEN")
SEAL_PACKAGE_ID = os.getenv("SEAL_PACKAGE_ID")


async def decrypt_encrypted_blob(
    walrus_blob_id: str,
    encrypted_object_bcs: bytes,
    identity: str,
    session_key_data: str
) -> bytes:
    """
    Decrypt an encrypted blob from Walrus using Seal with SessionKey authentication.

    Args:
        walrus_blob_id: Walrus blob ID to fetch encrypted data from
        encrypted_object_bcs: BCS-serialized encrypted object (hex string will be converted)
        identity: Seal identity (hex string) used for encryption
        session_key_data: User-signed SessionKey (JSON-encoded ExportedSessionKey) from frontend
                         Required for user-authorized decryption via key servers

    Returns:
        Decrypted plaintext bytes

    Raises:
        ValueError: If configuration is invalid
        RuntimeError: If decryption fails
    """
    # Validate basic configuration
    if not WALRUS_AGGREGATOR_URL:
        raise ValueError("WALRUS_AGGREGATOR_URL not configured")
    if not SEAL_PACKAGE_ID:
        raise ValueError("SEAL_PACKAGE_ID not configured")


    # Convert encrypted_object_bcs to hex if it's bytes
    if isinstance(encrypted_object_bcs, bytes):
        encrypted_object_hex = encrypted_object_bcs.hex()
    else:
        encrypted_object_hex = encrypted_object_bcs

    logger.info(
        f"Decrypting blob {walrus_blob_id[:16]}... with identity {identity[:16]}... "
        f"using SessionKey authentication"
    )

    # Run decryption in thread pool to avoid blocking event loop
    return await asyncio.to_thread(
        _decrypt_sync,
        walrus_blob_id,
        encrypted_object_hex,
        identity,
        session_key_data
    )


def _decrypt_sync(
    walrus_blob_id: str,
    encrypted_object_hex: str,
    identity: str,
    session_key_data: str
) -> bytes:
    """
    Synchronous decryption helper (runs in thread pool).

    Flow:
    1. Fetch encrypted blob from Walrus aggregator
    2. Check if it's envelope encryption (has sealed key + encrypted file)
    3. If envelope: decrypt sealed key with Seal using SessionKey,
       then decrypt file with AES
    4. If direct: decrypt entire blob with Seal using SessionKey

    Args:
        session_key_data: User-signed SessionKey for user-authorized key server decryption.

    Raises:
        SealAuthenticationError: If auth/permission failed (do not retry)
        SealValidationError: If input invalid (do not retry)
        SealNetworkError: If network error (transient, already retried)
        SealTimeoutError: If timeout (transient, already retried)
        SealDecryptionError: For other failures
    """
    try:
        # Step 1: Fetch encrypted blob from Walrus
        logger.debug(f"Fetching encrypted blob {walrus_blob_id} from Walrus...")
        encrypted_blob_bytes = _fetch_walrus_blob(walrus_blob_id)
        logger.info(f"Fetched blob from Walrus: {len(encrypted_blob_bytes)} bytes")

        # Step 2: Check if envelope encryption
        # Envelope format: [4 bytes key length][sealed key][encrypted file]
        is_envelope = _is_envelope_format(encrypted_blob_bytes)
        logger.info(f"Envelope format detected: {is_envelope}")

        if is_envelope:
            logger.debug("Detected envelope encryption format")
            # Extract encrypted file from envelope (skip sealed key, which we decrypt separately)
            key_length = int.from_bytes(encrypted_blob_bytes[:4], byteorder='little')
            encrypted_file_bytes = encrypted_blob_bytes[4 + key_length:]
            logger.info(f"Envelope structure: keyLength={key_length} bytes, encryptedFileSize={len(encrypted_file_bytes)} bytes")

            # Decrypt sealed key using Seal (encrypted_object_hex is the sealed key's encrypted object)
            logger.debug("Decrypting sealed AES key with Seal...")
            aes_key_bytes = _decrypt_with_seal_cli(encrypted_object_hex, identity, session_key_data)
            logger.info(f"Seal decryption returned: {len(aes_key_bytes)} bytes (AES key)")

            # Decrypt file with AES
            logger.debug("Decrypting file with AES...")
            plaintext = _decrypt_aes(encrypted_file_bytes, aes_key_bytes)
            logger.info(f"AES decryption returned: {len(plaintext)} bytes (plaintext audio)")

        else:
            logger.debug("Using direct Seal decryption")
            # Direct Seal encryption - decrypt entire blob using provided encrypted_object_hex
            plaintext = _decrypt_with_seal_cli(encrypted_object_hex, identity, session_key_data)
            logger.info(f"Direct Seal decryption returned: {len(plaintext)} bytes (plaintext audio)")

        logger.info(f"Successfully decrypted blob {walrus_blob_id[:16]}... ({len(plaintext)} bytes)")
        return plaintext

    except SealDecryptionError:
        # Re-raise Seal exceptions as-is (already structured)
        raise
    except Exception as e:
        logger.error(f"Decryption failed for blob {walrus_blob_id[:16]}...: {e}", exc_info=True)
        raise SealDecryptionError(
            f"Failed to decrypt encrypted blob: {str(e)}",
            error_type="decryption_failed",
            http_status=500
        ) from e


def _fetch_walrus_blob(blob_id: str) -> bytes:
    """Fetch encrypted blob from Walrus aggregator with retry logic for propagation delays."""
    if not WALRUS_AGGREGATOR_URL:
        raise RuntimeError("WALRUS_AGGREGATOR_URL environment variable not set")
    url = f"{WALRUS_AGGREGATOR_URL.rstrip('/')}/v1/blobs/{blob_id}"

    headers = {}
    if WALRUS_AGGREGATOR_TOKEN:
        headers["Authorization"] = f"Bearer {WALRUS_AGGREGATOR_TOKEN}"

    # Wait 15 seconds after upload for initial blob propagation
    logger.info(f"Waiting 15 seconds for blob {blob_id[:16]}... to propagate...")
    time.sleep(15)

    # Retry up to 10 times with 30-second delays
    max_retries = 10
    retry_delay = 30

    with httpx.Client(timeout=300.0) as client:
        for attempt in range(1, max_retries + 1):
            try:
                logger.debug(f"Fetching blob {blob_id[:16]}... (attempt {attempt}/{max_retries})")
                response = client.get(url, headers=headers)
                response.raise_for_status()
                logger.info(f"Successfully fetched blob {blob_id[:16]}... on attempt {attempt}")
                return response.content

            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    if attempt < max_retries:
                        logger.warning(
                            f"Blob {blob_id[:16]}... not found (404), "
                            f"retrying in {retry_delay}s (attempt {attempt}/{max_retries})"
                        )
                        time.sleep(retry_delay)
                        continue
                    else:
                        logger.error(f"Blob {blob_id[:16]}... still not found after {max_retries} attempts")
                        raise
                else:
                    # Don't retry on other HTTP errors
                    logger.error(f"HTTP error {e.response.status_code} fetching blob {blob_id[:16]}...")
                    raise
            except Exception as e:
                # Don't retry on network errors or other exceptions
                logger.error(f"Error fetching blob {blob_id[:16]}...: {e}")
                raise

        # Should never reach here due to raise in the loop, but just in case
        raise RuntimeError(f"Failed to fetch blob {blob_id} after {max_retries} attempts")


def _is_envelope_format(data: bytes) -> bool:
    """Check if data uses envelope encryption format."""
    if len(data) < 4:
        return False

    # Read key length from first 4 bytes (little-endian)
    key_length = int.from_bytes(data[:4], byteorder='little')

    # Sanity check: sealed key should be 150-800 bytes (depends on number of key servers)
    # - Minimum: ~150 bytes (2 key servers)
    # - Maximum: ~800 bytes (7+ key servers)
    return 150 <= key_length <= 800 and len(data) > key_length + 4


# Path to TS bridge script
TS_BRIDGE_PATH = os.path.join(os.path.dirname(__file__), "seal-decryptor-ts", "decrypt.ts")

# Retry configuration for transient errors
DECRYPT_MAX_RETRIES = 3
DECRYPT_RETRY_DELAY = 2.0  # seconds


def _parse_seal_error(error_output: str) -> tuple[str, str]:
    """
    Parse TS bridge error output to extract error type and message.

    Returns:
        Tuple of (error_type, concise_message)
    """
    # Look for common error patterns in stderr
    error_lower = error_output.lower()

    if "nosessions" in error_lower or "no access" in error_lower or "permission" in error_lower:
        return "authentication_failed", "Access denied: SessionKey invalid or expired"

    if "invalid" in error_lower and ("key" in error_lower or "signature" in error_lower):
        return "authentication_failed", "Invalid SessionKey or signature"

    if "timeout" in error_lower or "econnrefused" in error_lower or "enotfound" in error_lower:
        return "network_error", "Key server unreachable (network error)"

    if "invalid" in error_lower and ("format" in error_lower or "bcs" in error_lower):
        return "validation_failed", "Invalid or corrupted encrypted data"

    if "decrypt" in error_lower and "failed" in error_lower:
        return "validation_failed", "Decryption failed: data may be corrupted"

    # Default to generic error with first line of output
    first_line = error_output.split('\n')[0][:200]
    return "unknown", f"Seal error: {first_line}"


def _decrypt_with_seal_cli(encrypted_object_hex: str, identity: str, session_key_data: str) -> bytes:
    """
    Decrypt using the TypeScript bridge script with SessionKey authentication.
    Includes retry logic for transient errors and structured error handling.

    Args:
        encrypted_object_hex: Hex-encoded BCS-serialized encrypted object
        identity: Seal identity (hex string)
        session_key_data: Exported SessionKey (JSON-encoded ExportedSessionKey) from frontend

    Returns:
        Decrypted plaintext bytes

    Raises:
        SealValidationError: If session_key_data missing or input invalid
        SealAuthenticationError: If auth/permission failed
        SealNetworkError: If key server unreachable (transient)
        SealTimeoutError: If operation timed out
        SealDecryptionError: For other decrypt failures
    """
    if not session_key_data:
        raise SealValidationError(
            "SessionKey is required for decryption. Please provide session_key_data from the frontend."
        )

    # Prepare input for TS script
    request_data = {
        "encrypted_object_hex": encrypted_object_hex,
        "identity": identity,
        "session_key_data": session_key_data,
        "network": "mainnet"  # Default to mainnet
    }

    input_json = json.dumps(request_data)

    # Command to run TS script
    cmd = ["bun", "run", TS_BRIDGE_PATH, input_json]

    # Retry loop for transient errors
    last_error = None
    for attempt in range(1, DECRYPT_MAX_RETRIES + 1):
        logger.debug(f"Decrypt attempt {attempt}/{DECRYPT_MAX_RETRIES} for identity {identity[:16]}...")

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=True,
                timeout=60.0
            )

            # Output should be the hex encoded plaintext on first line
            output_hex = result.stdout.strip()

            if not output_hex:
                raise SealValidationError("No output from TS bridge decryption")

            # Validate that output is valid hex
            if not all(c in '0123456789abcdefABCDEF' for c in output_hex):
                raise SealValidationError(
                    f"Invalid hex output from TS bridge (expected valid hex, got malformed data)"
                )

            logger.debug(f"Successfully decrypted on attempt {attempt}")
            return bytes.fromhex(output_hex)

        except subprocess.CalledProcessError as e:
            error_output = e.stderr if e.stderr else "Unknown error"
            error_type, error_msg = _parse_seal_error(error_output)

            # Log at debug level to avoid leaking error details in INFO logs
            logger.debug(f"TS bridge failed (exit {e.returncode}): {error_output[:500]}")

            # Map to appropriate exception
            if error_type == "authentication_failed":
                raise SealAuthenticationError(error_msg) from e
            elif error_type == "validation_failed":
                raise SealValidationError(error_msg) from e
            elif error_type == "network_error":
                # Transient error - retry
                last_error = SealNetworkError(error_msg)
                if attempt < DECRYPT_MAX_RETRIES:
                    logger.warning(
                        f"Transient error, retrying in {DECRYPT_RETRY_DELAY}s (attempt {attempt}/{DECRYPT_MAX_RETRIES}): {error_msg}"
                    )
                    time.sleep(DECRYPT_RETRY_DELAY)
                    continue
                else:
                    raise last_error
            else:
                # Unknown error - don't retry
                raise SealDecryptionError(error_msg, error_type="decryption_failed", http_status=500) from e

        except subprocess.TimeoutExpired:
            if attempt < DECRYPT_MAX_RETRIES:
                logger.warning(
                    f"Timeout, retrying in {DECRYPT_RETRY_DELAY}s (attempt {attempt}/{DECRYPT_MAX_RETRIES})"
                )
                time.sleep(DECRYPT_RETRY_DELAY)
                last_error = SealTimeoutError("Decryption operation timed out after 60 seconds")
                continue
            else:
                raise SealTimeoutError("Decryption timed out after 60 seconds (all retries exhausted)") from None

    # Should not reach here, but just in case
    if last_error:
        raise last_error
    raise SealDecryptionError("Unknown decryption failure", error_type="unknown", http_status=500)


def _decrypt_aes(encrypted_data: bytes, aes_key: bytes) -> bytes:
    """
    Decrypt data using AES-256-GCM.

    Args:
        encrypted_data: [IV (12 bytes)][encrypted data + GCM tag (16 bytes)]
        aes_key: 32-byte AES key

    Returns:
        Decrypted plaintext bytes
    """
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM

        # Extract IV (first 12 bytes) and ciphertext
        iv = encrypted_data[:12]
        ciphertext = encrypted_data[12:]

        # Decrypt with AES-GCM
        aesgcm = AESGCM(aes_key)
        plaintext = aesgcm.decrypt(iv, ciphertext, None)

        return plaintext

    except ImportError:
        # Fallback to pycryptodome if cryptography not available
        try:
            from Crypto.Cipher import AES
            from Crypto.Util import Counter

            # Extract IV and ciphertext
            iv = encrypted_data[:12]
            ciphertext = encrypted_data[12:]

            # AES-GCM decryption with pycryptodome
            # Note: This is a simplified implementation - full GCM requires additional handling
            cipher = AES.new(aes_key, AES.MODE_GCM, nonce=iv)
            plaintext = cipher.decrypt(ciphertext)

            return plaintext

        except ImportError:
            raise RuntimeError(
                "AES decryption requires 'cryptography' or 'pycryptodome' package. "
                "Install with: pip install cryptography"
            )

