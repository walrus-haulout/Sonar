/**
 * @sonar/seal - Re-encryption APIs
 * Support for policy rotation and key updates without re-uploading bulk data
 */

import type { SealClient } from '@mysten/seal';
import type { DecryptFileOptions, DecryptionResult } from './types';
import { DecryptionError } from './errors';
import { decryptFile } from './decryption';
import { encryptFile } from './encryption';

export interface ReencryptionOptions {
  // Decryption context (for reading current encrypted blob)
  decryptionOptions: DecryptFileOptions;

  // Encryption context (for writing re-encrypted blob with new policy)
  encryptionOptions: {
    client: SealClient;
    identity: string; // New policy identity/seal_policy_id
    packageId?: string;
    threshold?: number;
  };

  // Progress callback for long-running operations
  onProgress?: (stage: ReencryptionStage, progress: number, message: string) => void;
}

export type ReencryptionStage = 'decrypting' | 'reencrypting' | 'uploading' | 'finalizing';

export interface ReencryptionResult {
  // Original blob metadata
  originalBlobSize: number;
  originalPolicyId: string;

  // New blob metadata
  newBlobSize: number;
  newPolicyId: string;

  // Timing
  decryptionTimeMs: number;
  encryptionTimeMs: number;
  totalTimeMs: number;

  // Success indicator
  success: boolean;
}

/**
 * Re-encrypt data with a new policy without reading/writing bulk data twice
 *
 * This function enables:
 * - Policy rotation (changing access rules)
 * - Key rotation (updating master key)
 * - Access revocation (removing access to decrypted data)
 *
 * Pattern:
 * 1. Decrypt original blob with current policy
 * 2. Re-encrypt decrypted data with new policy
 * 3. Return re-encrypted blob without storing intermediate plaintext
 *
 * Security note: Plaintext exists only in memory during this operation.
 * Caller is responsible for secure memory handling if needed.
 */
export async function reencryptBlob(
  encryptedBlob: Uint8Array,
  options: ReencryptionOptions
): Promise<{ reencryptedBlob: Uint8Array; result: ReencryptionResult }> {
  const startTime = Date.now();
  const decryptStartTime = Date.now();

  options.onProgress?.('decrypting', 0, 'Decrypting blob with current policy...');

  try {
    // Phase 1: Decrypt blob with current policy
    const decryptionResult = await decryptFile(
      options.decryptionOptions.client,
      encryptedBlob,
      options.decryptionOptions,
      (progress) => {
        const decryptProgress = Math.floor(progress * 30); // 0-30%
        options.onProgress?.('decrypting', decryptProgress, `Decrypting: ${decryptProgress}%`);
      }
    );

    const decryptionTimeMs = Date.now() - decryptStartTime;

    options.onProgress?.(
      'reencrypting',
      30,
      `Decryption complete. Decrypted size: ${decryptionResult.data.length} bytes`
    );

    const encryptStartTime = Date.now();

    // Phase 2: Re-encrypt with new policy
    options.onProgress?.('reencrypting', 30, 'Re-encrypting with new policy...');

    const reencryptionResult = await encryptFile(
      options.encryptionOptions.client,
      decryptionResult.data,
      options.encryptionOptions.identity,
      {
        packageId: options.encryptionOptions.packageId,
        threshold: options.encryptionOptions.threshold,
      },
      (progress) => {
        const encryptProgress = 30 + Math.floor(progress * 70); // 30-100%
        options.onProgress?.('reencrypting', encryptProgress, `Re-encrypting: ${encryptProgress}%`);
      }
    );

    const encryptionTimeMs = Date.now() - encryptStartTime;
    const totalTimeMs = Date.now() - startTime;

    options.onProgress?.('finalizing', 100, 'Re-encryption complete');

    return {
      reencryptedBlob: reencryptionResult.encryptedData,
      result: {
        originalBlobSize: encryptedBlob.length,
        originalPolicyId: options.decryptionOptions.identity,
        newBlobSize: reencryptionResult.encryptedData.length,
        newPolicyId: options.encryptionOptions.identity,
        decryptionTimeMs,
        encryptionTimeMs,
        totalTimeMs,
        success: true,
      },
    };
  } catch (error) {
    throw new DecryptionError(
      undefined,
      `Re-encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Streaming re-encryption for very large blobs
 *
 * Instead of loading entire blob into memory, processes chunks.
 * Useful for multi-GB files where memory is constrained.
 *
 * Note: Requires streaming support in underlying encryption/decryption
 * Currently returns error - requires additional SDK enhancements
 */
export async function reencryptBlobStreaming(
  // Stream source - not yet supported by Seal SDK
  _options: ReencryptionOptions
): Promise<never> {
  throw new Error(
    'Streaming re-encryption not yet implemented. Requires Seal SDK streaming support.'
  );
}

/**
 * Validate re-encryption parameters before performing operation
 */
export function validateReencryptionOptions(options: ReencryptionOptions): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate decryption options
  if (!options.decryptionOptions) {
    errors.push('Decryption options required');
  } else {
    if (!options.decryptionOptions.client) {
      errors.push('Decryption client required');
    }
    if (!options.decryptionOptions.identity) {
      errors.push('Original policy identity required');
    }
  }

  // Validate encryption options
  if (!options.encryptionOptions) {
    errors.push('Encryption options required');
  } else {
    if (!options.encryptionOptions.client) {
      errors.push('Encryption client required');
    }
    if (!options.encryptionOptions.identity) {
      errors.push('New policy identity required');
    }
    // Ensure new policy is different from old
    if (
      options.decryptionOptions?.identity === options.encryptionOptions.identity
    ) {
      errors.push('New policy must differ from current policy');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
