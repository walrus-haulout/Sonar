/**
 * @sonar/seal - Encryption APIs
 * High-level encryption functions for files and data
 */

import type { SealClient } from '@mysten/seal';
import type {
  EncryptFileOptions,
  EncryptionResult,
  EnvelopeEncryptionResult,
  EncryptionMetadata,
  ProgressCallback,
} from './types';
import { DemType } from './types';
import { EncryptionError } from './errors';
import {
  DEFAULT_THRESHOLD,
  DEFAULT_DEM_TYPE,
  ENVELOPE_THRESHOLD_BYTES,
  SEAL_OVERHEAD_BYTES,
} from './constants';
import {
  generateRandomIdentity,
  parsePackageId,
  bytesToHex,
  shouldUseEnvelopeEncryption,
  estimateEncryptedSize,
} from './utils';

/**
 * Encrypt a file or data blob
 * Automatically chooses between direct Seal encryption and envelope encryption
 */
export async function encryptFile(
  client: SealClient,
  data: File | Uint8Array,
  options: EncryptFileOptions,
  onProgress?: ProgressCallback
): Promise<EncryptionResult> {
  const {
    threshold = DEFAULT_THRESHOLD,
    packageId,
    accessPolicy,
    customId,
    useEnvelope,
  } = options;

  onProgress?.(0, 'Preparing encryption...');

  // Convert File to Uint8Array if needed
  const dataBytes =
    data instanceof File ? new Uint8Array(await data.arrayBuffer()) : data;

  const originalSize = dataBytes.length;

  // Determine encryption strategy
  const shouldEnvelope =
    useEnvelope ??
    shouldUseEnvelopeEncryption(originalSize);

  if (shouldEnvelope) {
    onProgress?.(10, 'Using envelope encryption for large file...');
    return encryptLargeFile(client, dataBytes, options, onProgress);
  }

  onProgress?.(10, 'Using direct Seal encryption...');
  return encryptSmallFile(client, dataBytes, options, onProgress);
}

/**
 * Encrypt small file directly with Seal
 * Recommended for files < 1MB
 */
async function encryptSmallFile(
  client: SealClient,
  data: Uint8Array,
  options: EncryptFileOptions,
  onProgress?: ProgressCallback
): Promise<EncryptionResult> {
  const {
    threshold = DEFAULT_THRESHOLD,
    packageId,
    accessPolicy,
    customId,
  } = options;

  try {
    onProgress?.(20, 'Generating identity...');

    // Generate or use custom identity
    const identity = customId || generateRandomIdentity();
    const identityHex = bytesToHex(identity);

    onProgress?.(40, 'Encrypting with Seal...');

    // Encrypt with Seal
    // packageId is optional - only needed for decryption with custom policies
    const encryptParams: any = {
      threshold,
      id: identityHex,
      data,
    };

    if (packageId) {
      encryptParams.packageId = packageId;
    }

    const { encryptedObject, key } = await client.encrypt(encryptParams);

    onProgress?.(90, 'Finalizing...');

    const metadata: EncryptionMetadata = {
      threshold,
      packageId,
      accessPolicy,
      demType: DEFAULT_DEM_TYPE,
      timestamp: Date.now(),
      originalSize: data.length,
      encryptedSize: encryptedObject.length,
      isEnvelope: false,
    };

    onProgress?.(100, 'Encryption complete');

    return {
      encryptedData: encryptedObject,
      backupKey: key,
      identity: identityHex,
      metadata,
    };
  } catch (error) {
    throw new EncryptionError(
      'Encryption failed',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Encrypt large file with envelope encryption (AES + Seal)
 * Recommended for files > 1MB
 *
 * Process:
 * 1. Generate random AES-256 key
 * 2. Encrypt file with AES-GCM (fast, parallel)
 * 3. Seal-encrypt the AES key (small, fast)
 * 4. Return both encrypted file and sealed key
 */
async function encryptLargeFile(
  client: SealClient,
  data: Uint8Array,
  options: EncryptFileOptions,
  onProgress?: ProgressCallback
): Promise<EncryptionResult> {
  const {
    threshold = DEFAULT_THRESHOLD,
    packageId,
    accessPolicy,
    customId,
  } = options;

  try {
    onProgress?.(10, 'Generating AES key...');

    // Generate random AES-256 key
    const aesKey = crypto.getRandomValues(new Uint8Array(32)); // 256 bits

    onProgress?.(20, 'Encrypting file with AES-GCM...');

    // Encrypt file with AES-GCM
    const encryptedFile = await encryptWithAES(data, aesKey);

    onProgress?.(60, 'Sealing AES key...');

    // Generate identity for the AES key
    const identity = customId || generateRandomIdentity();
    const identityHex = bytesToHex(identity);

    // Seal-encrypt the AES key
    // packageId is optional - only needed for decryption with custom policies
    const sealParams: any = {
      threshold,
      id: identityHex,
      data: aesKey,
    };

    if (packageId) {
      sealParams.packageId = packageId;
    }

    const { encryptedObject: sealedKey, key: backupKey } =
      await client.encrypt(sealParams);

    onProgress?.(90, 'Creating envelope...');

    // Create envelope: [sealed key length (4 bytes)][sealed key][encrypted file]
    const envelope = createEnvelope(sealedKey, encryptedFile);

    const metadata: EncryptionMetadata = {
      threshold,
      packageId,
      accessPolicy,
      demType: DemType.AES, // File encrypted with AES, key sealed with Seal
      timestamp: Date.now(),
      originalSize: data.length,
      encryptedSize: envelope.length,
      isEnvelope: true,
    };

    onProgress?.(100, 'Envelope encryption complete');

    return {
      encryptedData: envelope,
      backupKey,
      identity: identityHex,
      metadata,
    };
  } catch (error) {
    throw new EncryptionError(
      'Envelope encryption failed',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Encrypt data with AES-256-GCM
 * Uses Web Crypto API for hardware-accelerated encryption
 */
async function encryptWithAES(
  data: Uint8Array,
  key: Uint8Array
): Promise<Uint8Array> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new EncryptionError(
      'Web Crypto API not available. This feature requires a browser environment or Node.js with webcrypto support.'
    );
  }

  try {
    // Import AES key
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(key),
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    // Generate random IV (12 bytes for GCM)
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt data
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(iv),
      },
      cryptoKey,
      new Uint8Array(data)
    );

    // Prepend IV to encrypted data: [IV (12 bytes)][encrypted data]
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encrypted), iv.length);

    return result;
  } catch (error) {
    throw new EncryptionError(
      'AES encryption failed',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Create envelope format: [sealed key length][sealed key][encrypted file]
 * This allows decryption to extract the sealed key first, then decrypt the file
 */
function createEnvelope(
  sealedKey: Uint8Array,
  encryptedFile: Uint8Array
): Uint8Array {
  // Store sealed key length as 4-byte little-endian integer
  const keyLength = new Uint8Array(4);
  const view = new DataView(keyLength.buffer);
  view.setUint32(0, sealedKey.length, true); // little-endian

  // Concatenate: [key length][sealed key][encrypted file]
  const envelope = new Uint8Array(
    keyLength.length + sealedKey.length + encryptedFile.length
  );
  envelope.set(keyLength, 0);
  envelope.set(sealedKey, keyLength.length);
  envelope.set(encryptedFile, keyLength.length + sealedKey.length);

  return envelope;
}

/**
 * Encrypt metadata (for storing alongside encrypted files)
 */
export async function encryptMetadata(
  client: SealClient,
  metadata: any,
  options: Omit<EncryptFileOptions, 'useEnvelope'>
): Promise<EncryptionResult> {
  // Serialize metadata to JSON
  const json = JSON.stringify(metadata);
  const data = new TextEncoder().encode(json);

  // Metadata is always small, use direct encryption
  return encryptSmallFile(client, data, options);
}

/**
 * Estimate encrypted file size
 * Useful for pre-allocation or progress calculation
 */
export function estimateEncryptedFileSize(
  originalSize: number,
  useEnvelope?: boolean
): number {
  const shouldEnvelope =
    useEnvelope ?? shouldUseEnvelopeEncryption(originalSize);

  if (shouldEnvelope) {
    // Envelope: [4 bytes key length][~300 bytes sealed key][12 bytes IV][originalSize + 16 bytes GCM tag]
    return 4 + SEAL_OVERHEAD_BYTES + 12 + originalSize + 16;
  } else {
    // Direct Seal encryption
    return estimateEncryptedSize(originalSize);
  }
}

/**
 * Check if data should use envelope encryption
 */
export function recommendEnvelopeEncryption(dataSize: number): boolean {
  return shouldUseEnvelopeEncryption(dataSize);
}
