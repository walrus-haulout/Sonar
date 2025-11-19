/**
 * @sonar/seal - Envelope Format with Versioning
 * Explicit versioning for envelope format enables future protocol evolution
 */

/**
 * Envelope format version for forward compatibility
 * Current: 1.0
 * Format: [1 byte version][4 bytes key length][sealed key][encrypted file]
 */
export const ENVELOPE_VERSION = 1;
export const ENVELOPE_VERSION_BYTE_SIZE = 1;
export const ENVELOPE_KEY_LENGTH_BYTE_SIZE = 4;

/**
 * Build envelope with version header
 * Format: [version:1][keyLength:4][sealedKey:N][encryptedFile:M]
 */
export function buildEnvelopeWithVersion(
  sealedKey: Uint8Array,
  encryptedFile: Uint8Array
): Uint8Array {
  const envelope = new Uint8Array(
    ENVELOPE_VERSION_BYTE_SIZE + ENVELOPE_KEY_LENGTH_BYTE_SIZE + sealedKey.length + encryptedFile.length
  );

  let offset = 0;

  // Write version (1 byte)
  envelope[offset] = ENVELOPE_VERSION;
  offset += ENVELOPE_VERSION_BYTE_SIZE;

  // Write key length (4 bytes, little-endian)
  const keyLengthView = new DataView(envelope.buffer, offset, ENVELOPE_KEY_LENGTH_BYTE_SIZE);
  keyLengthView.setUint32(0, sealedKey.length, true);
  offset += ENVELOPE_KEY_LENGTH_BYTE_SIZE;

  // Write sealed key
  envelope.set(sealedKey, offset);
  offset += sealedKey.length;

  // Write encrypted file
  envelope.set(encryptedFile, offset);

  return envelope;
}

/**
 * Parse envelope with version header
 * Returns version and parsed components
 */
export function parseEnvelopeWithVersion(data: Uint8Array): {
  version: number;
  sealedKey: Uint8Array;
  encryptedFile: Uint8Array;
  headerSize: number;
} {
  if (data.length < ENVELOPE_VERSION_BYTE_SIZE + ENVELOPE_KEY_LENGTH_BYTE_SIZE) {
    throw new Error('Envelope too small to contain header');
  }

  let offset = 0;

  // Read version
  const version = data[offset];
  offset += ENVELOPE_VERSION_BYTE_SIZE;

  if (version !== ENVELOPE_VERSION) {
    throw new Error(`Unsupported envelope version: ${version}. Expected ${ENVELOPE_VERSION}`);
  }

  // Read key length
  const keyLengthView = new DataView(data.buffer, data.byteOffset + offset, ENVELOPE_KEY_LENGTH_BYTE_SIZE);
  const keyLength = keyLengthView.getUint32(0, true);
  offset += ENVELOPE_KEY_LENGTH_BYTE_SIZE;

  // Validate key length
  if (keyLength < 150 || keyLength > 800) {
    throw new Error(`Invalid sealed key length: ${keyLength}. Expected 150-800 bytes.`);
  }

  if (data.length < offset + keyLength) {
    throw new Error('Envelope truncated: not enough data for sealed key');
  }

  // Extract sealed key and encrypted file
  const sealedKey = data.slice(offset, offset + keyLength);
  const encryptedFile = data.slice(offset + keyLength);

  return {
    version,
    sealedKey,
    encryptedFile,
    headerSize: offset + keyLength,
  };
}

/**
 * Check if data uses versioned envelope format
 */
export function isVersionedEnvelope(data: Uint8Array): boolean {
  if (data.length < ENVELOPE_VERSION_BYTE_SIZE + ENVELOPE_KEY_LENGTH_BYTE_SIZE) {
    return false;
  }

  try {
    const version = data[0];
    if (version !== ENVELOPE_VERSION) {
      return false;
    }

    const keyLengthView = new DataView(data.buffer, data.byteOffset + 1, 4);
    const keyLength = keyLengthView.getUint32(0, true);

    // Check if key length is in valid range
    return keyLength >= 150 && keyLength <= 800 && data.length > 5 + keyLength;
  } catch {
    return false;
  }
}

/**
 * Migrate legacy envelope (no version) to versioned envelope
 * For backwards compatibility with old format
 */
export function migrateToVersionedEnvelope(legacyEnvelope: Uint8Array): Uint8Array {
  // Legacy format: [4 bytes key length][sealed key][encrypted file]
  if (legacyEnvelope.length < 4) {
    throw new Error('Legacy envelope too small');
  }

  const keyLengthView = new DataView(
    legacyEnvelope.buffer,
    legacyEnvelope.byteOffset,
    4
  );
  const keyLength = keyLengthView.getUint32(0, true);

  // Validate key length before migrating
  if (keyLength < 150 || keyLength > 800) {
    throw new Error(`Invalid sealed key length: ${keyLength}. Expected 150-800 bytes.`);
  }

  const sealedKey = legacyEnvelope.slice(4, 4 + keyLength);
  const encryptedFile = legacyEnvelope.slice(4 + keyLength);

  // Build new versioned envelope
  return buildEnvelopeWithVersion(sealedKey, encryptedFile);
}
