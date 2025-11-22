#!/usr/bin/env python3
"""
Debug script to test blob decryption with detailed size tracking.
Usage: python debug_blob.py <blob_id> <sealed_key_hex> <seal_identity> <session_key_json>
"""

import sys
import os
import json
import logging
from seal_decryptor import (
    _fetch_walrus_blob,
    _is_envelope_format,
    _decrypt_with_seal_cli,
    _decrypt_aes,
)

# Set up detailed logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(levelname)s: %(message)s'
)
logger = logging.getLogger(__name__)


def debug_decrypt(blob_id: str, sealed_key_hex: str, identity: str, session_key_json: str):
    """Debug decryption with detailed size tracking at each step."""

    print(f"\n=== Debugging Blob Decryption ===")
    print(f"Blob ID: {blob_id}")
    print(f"Identity: {identity[:16]}...")
    print(f"Sealed key hex length: {len(sealed_key_hex)} chars ({len(sealed_key_hex)//2} bytes)")
    print()

    try:
        # Step 1: Fetch blob
        print("Step 1: Fetching blob from Walrus...")
        blob_bytes = _fetch_walrus_blob(blob_id)
        print(f"  ✓ Fetched: {len(blob_bytes)} bytes")
        print(f"    First 20 bytes (hex): {blob_bytes[:20].hex()}")

        # Step 2: Check envelope format
        print("\nStep 2: Checking envelope format...")
        is_envelope = _is_envelope_format(blob_bytes)
        print(f"  ✓ Is envelope: {is_envelope}")

        if not is_envelope:
            print("\n  WARNING: Blob is not in envelope format!")
            print("  Attempting direct Seal decryption...")
            plaintext = _decrypt_with_seal_cli(sealed_key_hex, identity, session_key_json)
            print(f"  ✓ Direct decryption returned: {len(plaintext)} bytes")
            return plaintext

        # Step 3: Parse envelope structure
        print("\nStep 3: Parsing envelope structure...")
        key_length = int.from_bytes(blob_bytes[:4], byteorder='little')
        encrypted_file_bytes = blob_bytes[4 + key_length:]
        print(f"  ✓ Key length (from first 4 bytes): {key_length} bytes")
        print(f"  ✓ Encrypted file bytes: {len(encrypted_file_bytes)} bytes")
        print(f"    Expected: {len(blob_bytes)} - 4 - {key_length} = {len(blob_bytes) - 4 - key_length}")

        # Step 4: Decrypt sealed key
        print("\nStep 4: Decrypting sealed key with Seal...")
        print(f"  Input sealed key hex: {len(sealed_key_hex)} chars")
        aes_key_bytes = _decrypt_with_seal_cli(sealed_key_hex, identity, session_key_json)
        print(f"  ✓ Seal decryption returned: {len(aes_key_bytes)} bytes")
        if len(aes_key_bytes) == 32:
            print(f"    ✓ AES key is correct size (32 bytes)")
        else:
            print(f"    ⚠ WARNING: Expected 32 bytes, got {len(aes_key_bytes)}")

        # Step 5: Decrypt file with AES
        print("\nStep 5: Decrypting file with AES...")
        print(f"  Input encrypted file: {len(encrypted_file_bytes)} bytes")
        print(f"    IV: {encrypted_file_bytes[:12].hex() if len(encrypted_file_bytes) >= 12 else 'TOO SHORT'}")

        plaintext = _decrypt_aes(encrypted_file_bytes, aes_key_bytes)
        print(f"  ✓ AES decryption returned: {len(plaintext)} bytes")

        if len(plaintext) < 1024:
            print(f"    ⚠ WARNING: Plaintext is too small ({len(plaintext)} bytes < 1KB)")
            print(f"    This would fail backend verification!")
        else:
            print(f"    ✓ Plaintext size is acceptable (>1KB)")

        print(f"\n=== Final Result ===")
        print(f"✓ Decryption successful: {len(plaintext)} bytes")
        return plaintext

    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return None


if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("Usage: python debug_blob.py <blob_id> <sealed_key_hex> <seal_identity> <session_key_json>")
        sys.exit(1)

    blob_id = sys.argv[1]
    sealed_key_hex = sys.argv[2]
    identity = sys.argv[3]
    session_key_json = sys.argv[4]

    plaintext = debug_decrypt(blob_id, sealed_key_hex, identity, session_key_json)
    sys.exit(0 if plaintext else 1)
