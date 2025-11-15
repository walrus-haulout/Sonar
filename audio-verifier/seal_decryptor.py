"""
Seal Decryptor Helper
Fetches encrypted blobs from Walrus and decrypts them using seal-cli
"""

import asyncio
import logging
import os
import subprocess
import tempfile
from typing import Optional
import httpx

logger = logging.getLogger(__name__)

# Configuration from environment
WALRUS_AGGREGATOR_URL = os.getenv("WALRUS_AGGREGATOR_URL")
WALRUS_AGGREGATOR_TOKEN = os.getenv("WALRUS_AGGREGATOR_TOKEN")
SEAL_PACKAGE_ID = os.getenv("SEAL_PACKAGE_ID")
SEAL_THRESHOLD = int(os.getenv("SEAL_THRESHOLD", "2"))

# Path to seal-cli binary
SEAL_CLI_PATH = os.getenv("SEAL_CLI_PATH", "/usr/local/bin/seal-cli")


def is_valid_seal_key(key: str) -> bool:
    """Check if a key is valid (not a placeholder)."""
    # Reject common placeholder keys
    if key.lower() in ['key1', 'key2', 'key3', 'placeholder', 'changeme', 'example', 'test']:
        logger.warning(f"Ignoring placeholder key: {key}")
        return False
    # Valid keys should have reasonable length (32+ chars)
    if len(key) < 32:
        logger.warning(f"Ignoring short key (length {len(key)}): {key[:10]}...")
        return False
    return True


# Load and validate keys after is_valid_seal_key is defined
SEAL_SECRET_KEYS = [k.strip() for k in os.getenv("SEAL_SECRET_KEYS", "").split(",") if k.strip() and is_valid_seal_key(k.strip())]
SEAL_KEY_SERVER_IDS = [k.strip() for k in os.getenv("SEAL_KEY_SERVER_IDS", "").split(",") if k.strip()]

if not SEAL_SECRET_KEYS and os.getenv("SEAL_SECRET_KEYS"):
    logger.info("All SEAL_SECRET_KEYS were filtered out (likely placeholder values). Will use SEAL_KEY_SERVER_IDS.")


async def decrypt_encrypted_blob(
    walrus_blob_id: str,
    encrypted_object_bcs: bytes,
    identity: str
) -> bytes:
    """
    Decrypt an encrypted blob from Walrus using Seal.

    Args:
        walrus_blob_id: Walrus blob ID to fetch encrypted data from
        encrypted_object_bcs: BCS-serialized encrypted object (hex string will be converted)
        identity: Seal identity (hex string) used for encryption

    Returns:
        Decrypted plaintext bytes

    Raises:
        ValueError: If configuration is invalid
        RuntimeError: If decryption fails
    """
    # Validate configuration
    if not WALRUS_AGGREGATOR_URL:
        raise ValueError("WALRUS_AGGREGATOR_URL not configured")
    if not SEAL_PACKAGE_ID:
        raise ValueError("SEAL_PACKAGE_ID not configured")
    if len(SEAL_KEY_SERVER_IDS) < SEAL_THRESHOLD:
        raise ValueError(
            f"Not enough Seal key server IDs: have {len(SEAL_KEY_SERVER_IDS)}, need {SEAL_THRESHOLD}"
        )
    if not os.path.exists(SEAL_CLI_PATH):
        raise ValueError(f"seal-cli not found at {SEAL_CLI_PATH}")

    # Convert encrypted_object_bcs to hex if it's bytes
    if isinstance(encrypted_object_bcs, bytes):
        encrypted_object_hex = encrypted_object_bcs.hex()
    else:
        encrypted_object_hex = encrypted_object_bcs

    logger.info(f"Decrypting blob {walrus_blob_id[:16]}... with identity {identity[:16]}...")

    # Run decryption in thread pool to avoid blocking event loop
    return await asyncio.to_thread(
        _decrypt_sync,
        walrus_blob_id,
        encrypted_object_hex,
        identity
    )


def _decrypt_sync(
    walrus_blob_id: str,
    encrypted_object_hex: str,
    identity: str
) -> bytes:
    """
    Synchronous decryption helper (runs in thread pool).

    Flow:
    1. Fetch encrypted blob from Walrus aggregator
    2. Check if it's envelope encryption (has sealed key + encrypted file)
    3. If envelope: decrypt sealed key with Seal (using provided encrypted_object_hex),
       then decrypt file with AES
    4. If direct: decrypt entire blob with Seal (using provided encrypted_object_hex)
    """
    try:
        # Step 1: Fetch encrypted blob from Walrus
        logger.debug(f"Fetching encrypted blob {walrus_blob_id} from Walrus...")
        encrypted_blob_bytes = _fetch_walrus_blob(walrus_blob_id)

        # Step 2: Check if envelope encryption
        # Envelope format: [4 bytes key length][sealed key][encrypted file]
        is_envelope = _is_envelope_format(encrypted_blob_bytes)

        if is_envelope:
            logger.debug("Detected envelope encryption format")
            # Extract encrypted file from envelope (skip sealed key, which we decrypt separately)
            key_length = int.from_bytes(encrypted_blob_bytes[:4], byteorder='little')
            encrypted_file_bytes = encrypted_blob_bytes[4 + key_length:]

            # Decrypt sealed key using Seal (encrypted_object_hex is the sealed key's encrypted object)
            logger.debug("Decrypting sealed AES key with Seal...")
            aes_key_bytes = _decrypt_with_seal_cli(encrypted_object_hex, identity)

            # Decrypt file with AES
            logger.debug("Decrypting file with AES...")
            plaintext = _decrypt_aes(encrypted_file_bytes, aes_key_bytes)

        else:
            logger.debug("Using direct Seal decryption")
            # Direct Seal encryption - decrypt entire blob using provided encrypted_object_hex
            plaintext = _decrypt_with_seal_cli(encrypted_object_hex, identity)

        logger.info(f"Successfully decrypted blob {walrus_blob_id[:16]}... ({len(plaintext)} bytes)")
        return plaintext

    except Exception as e:
        logger.error(f"Decryption failed for blob {walrus_blob_id[:16]}...: {e}", exc_info=True)
        raise RuntimeError(f"Failed to decrypt encrypted blob: {e}") from e


def _fetch_walrus_blob(blob_id: str) -> bytes:
    """Fetch encrypted blob from Walrus aggregator with retry logic for propagation delays."""
    import time

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

    # Sanity check: sealed key should be 200-400 bytes
    return 200 <= key_length <= 400 and len(data) > key_length + 4


def _decrypt_with_seal_cli(encrypted_object_hex: str, identity: str) -> bytes:
    """
    Decrypt using seal-cli command-line tool.

    Args:
        encrypted_object_hex: Hex-encoded BCS-serialized encrypted object
        identity: Seal identity (hex string) - not used by seal-cli but kept for logging

    Returns:
        Decrypted plaintext bytes
    """
    # Use threshold number of key server IDs for decryption
    key_server_ids_to_use = SEAL_KEY_SERVER_IDS[:SEAL_THRESHOLD] if SEAL_KEY_SERVER_IDS else []
    keys_to_use = SEAL_SECRET_KEYS[:SEAL_THRESHOLD] if SEAL_SECRET_KEYS else []

    # Build seal-cli decrypt command
    # Format: seal-cli decrypt <encrypted_object_hex> <secret_key_1> <secret_key_2> ... [-- <key_server_id_1> <key_server_id_2> ...]
    # Note: With envelope encryption, encrypted_object_hex is small (~400 bytes), so no argument limit issues
    cmd = [SEAL_CLI_PATH, "decrypt", encrypted_object_hex]

    # Use secret keys if available, otherwise use key server IDs for on-demand key fetching
    if keys_to_use:
        cmd.extend(keys_to_use)
        if key_server_ids_to_use and len(key_server_ids_to_use) == len(keys_to_use):
            cmd.append("--")
            cmd.extend(key_server_ids_to_use)
    elif key_server_ids_to_use:
        cmd.append("--")
        cmd.extend(key_server_ids_to_use)
    else:
        raise ValueError("No secret keys or key server IDs configured for decryption")

    logger.debug(f"Running seal-cli decrypt with {len(keys_to_use)} keys for identity {identity[:16]}...")

    try:
        # Run seal-cli
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,  # Capture as text for easier parsing
            check=True,
            timeout=60.0
        )

        # Parse output
        # seal-cli outputs: "Decrypted message: <hex>"
        output = result.stdout.strip()
        stderr_output = result.stderr.strip()

        # Look for "Decrypted message:" line
        for line in output.split('\n'):
            if 'Decrypted message:' in line:
                # Extract hex string after colon
                hex_part = line.split('Decrypted message:')[-1].strip()
                # Remove any whitespace and non-hex characters (keep only 0-9a-fA-F)
                hex_clean = ''.join(c for c in hex_part if c in '0123456789abcdefABCDEF')
                if hex_clean:
                    try:
                        return bytes.fromhex(hex_clean)
                    except ValueError as e:
                        logger.warning(f"Failed to parse hex output: {e}, trying alternative parsing")
                        continue

        # If no "Decrypted message:" line found, try parsing entire output as hex
        # (some versions might output differently)
        output_clean = ''.join(c for c in output if c in '0123456789abcdefABCDEF')
        if output_clean and len(output_clean) >= 2:
            try:
                return bytes.fromhex(output_clean)
            except ValueError:
                pass

        # If stderr has output, include it in error
        error_msg = f"seal-cli output did not contain decrypted data"
        if stderr_output:
            error_msg += f". stderr: {stderr_output}"
        if output:
            error_msg += f". stdout: {output[:200]}"
        raise ValueError(error_msg)

    except subprocess.CalledProcessError as e:
        error_output = e.stderr if isinstance(e.stderr, str) else (e.stderr.decode('utf-8', errors='ignore') if e.stderr else '')
        stdout_output = e.stdout if isinstance(e.stdout, str) else (e.stdout.decode('utf-8', errors='ignore') if e.stdout else '')
        logger.error(f"seal-cli decrypt failed (exit {e.returncode}): {error_output}")
        if stdout_output:
            logger.debug(f"seal-cli stdout: {stdout_output}")
        raise RuntimeError(f"Seal decryption failed: {error_output}") from e
    except subprocess.TimeoutExpired:
        raise RuntimeError("Seal decryption timed out after 60 seconds") from None


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

