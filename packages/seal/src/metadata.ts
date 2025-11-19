/**
 * @sonar/seal - Metadata Verification
 * Hash-based integrity checking for encryption metadata
 */

/**
 * Metadata that travels with encrypted blob
 */
export interface EncryptionMetadata {
  // Core properties
  sealPolicyId: string;
  packageId: string;
  identity: string;
  threshold?: number;

  // Blob properties
  originalSize: number;
  encryptedSize: number;
  mimeType?: string;

  // Timing
  encryptedAt: number; // Unix timestamp in seconds

  // Hash for integrity verification
  metadataHash?: string;
}

/**
 * Create SHA-256 hash of metadata
 */
export async function hashMetadata(metadata: Omit<EncryptionMetadata, 'metadataHash'>): Promise<string> {
  const metadataJson = JSON.stringify(metadata);
  const encoder = new TextEncoder();
  const data = encoder.encode(metadataJson);

  if (!globalThis.crypto?.subtle) {
    throw new Error('SubtleCrypto not available. Metadata hashing requires a secure context.');
  }

  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  return bufferToHex(new Uint8Array(hashBuffer));
}

/**
 * Verify metadata hash integrity
 */
export async function verifyMetadataHash(metadata: EncryptionMetadata): Promise<boolean> {
  if (!metadata.metadataHash) {
    return false; // No hash to verify
  }

  const { metadataHash, ...metadataWithoutHash } = metadata;
  const computedHash = await hashMetadata(metadataWithoutHash);

  return computedHash === metadataHash;
}

/**
 * Add hash to metadata
 */
export async function addHashToMetadata(
  metadata: Omit<EncryptionMetadata, 'metadataHash'>
): Promise<EncryptionMetadata> {
  const metadataHash = await hashMetadata(metadata);
  return {
    ...metadata,
    metadataHash,
  };
}

/**
 * Create metadata for encrypted blob
 */
export async function createEncryptionMetadata(
  sealPolicyId: string,
  packageId: string,
  identity: string,
  originalSize: number,
  encryptedSize: number,
  options?: {
    mimeType?: string;
    threshold?: number;
  }
): Promise<EncryptionMetadata> {
  const metadata: Omit<EncryptionMetadata, 'metadataHash'> = {
    sealPolicyId,
    packageId,
    identity,
    originalSize,
    encryptedSize,
    mimeType: options?.mimeType,
    threshold: options?.threshold,
    encryptedAt: Math.floor(Date.now() / 1000),
  };

  return addHashToMetadata(metadata);
}

/**
 * Validate metadata consistency with blob
 */
export async function validateMetadata(
  metadata: EncryptionMetadata,
  encryptedBlobSize: number
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Check hash
  const hashValid = await verifyMetadataHash(metadata);
  if (!hashValid) {
    errors.push('Metadata hash verification failed');
  }

  // Check sizes
  if (encryptedBlobSize < metadata.encryptedSize) {
    errors.push(`Blob size mismatch: expected ${metadata.encryptedSize}, got ${encryptedBlobSize}`);
  }

  // Check timestamp
  const now = Math.floor(Date.now() / 1000);
  if (metadata.encryptedAt > now) {
    errors.push('Metadata timestamp is in the future');
  }

  // Check encryption time is recent (within 1 day)
  if (now - metadata.encryptedAt > 86400) {
    errors.push('Metadata is older than 1 day');
  }

  // Validate IDs are not empty
  if (!metadata.sealPolicyId) {
    errors.push('Missing seal policy ID');
  }
  if (!metadata.packageId) {
    errors.push('Missing package ID');
  }
  if (!metadata.identity) {
    errors.push('Missing identity');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Convert buffer to hex string
 */
function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to buffer
 */
export function hexToBuffer(hex: string): Uint8Array {
  const buffer = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    buffer[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return buffer;
}
