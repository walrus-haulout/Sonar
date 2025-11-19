'use client';

import { useState } from 'react';
import { useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { CHAIN_CONFIG } from '@/lib/sui/client';
import { reencryptBlob, validateReencryptionOptions } from '@sonar/seal';
import { useSeal } from './useSeal';
import { useWalrusParallelUpload } from './useWalrusParallelUpload';
import type { ReencryptionOptions, ReencryptionStage } from '@sonar/seal';

/**
 * useReencryption Hook
 * Orchestrates complete re-encryption workflow:
 * 1. Decrypt blob with current policy
 * 2. Re-encrypt with new policy
 * 3. Upload new blob to Walrus
 * 4. Atomically update Move object references
 */

export interface ReencryptionRequest {
  submissionId: string; // Move object ID of AudioSubmission to reencrypt
  currentEncryptedBlob: Uint8Array; // Current encrypted blob
  currentSealPolicyId: string; // Current policy ID
  newSealPolicyId: string; // New policy ID for access change
  onProgress?: (stage: ReencryptionStage, progress: number, message: string) => void;
}

export interface ReencryptionProgress {
  stage: ReencryptionStage;
  progress: number;
  message: string;
}

export function useReencryption() {
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const { sealClient, sessionKey } = useSeal();
  const { uploadBlob } = useWalrusParallelUpload();
  const [isReencrypting, setIsReencrypting] = useState(false);

  /**
   * Complete re-encryption workflow
   *
   * Steps:
   * 1. Validate options
   * 2. Decrypt with current policy
   * 3. Re-encrypt with new policy
   * 4. Upload new blob to Walrus (if Walrus integration available)
   * 5. Call reencrypt_submission() on-chain to update references
   */
  async function reencryptSubmission(
    request: ReencryptionRequest
  ): Promise<{ submissionId: string; newBlobId?: string; digest: string }> {
    return new Promise(async (resolve, reject) => {
      if (!CHAIN_CONFIG.packageId) {
        reject(new Error('Package ID not configured'));
        return;
      }

      if (!sealClient || !sessionKey) {
        reject(new Error('Seal client or session not initialized'));
        return;
      }

      try {
        // Step 1: Fetch current encrypted blob
        request.onProgress?.('decrypting', 0, 'Fetching current encrypted blob...');

        // TODO: Use a proper fetcher that handles Walrus aggregators
        const walrusAggregator = process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL || 'https://aggregator.walrus-testnet.walrus.space';
        // We need the blob ID. The request has `currentEncryptedBlob` as Uint8Array?
        // The interface says `currentEncryptedBlob: Uint8Array`.
        // If the caller passes the data, we don't need to fetch!
        // But for large files, passing Uint8Array might be heavy.
        // The interface should probably take `blobId` instead.
        // But let's stick to the interface for now, assuming caller fetched it or we change the interface.

        // Wait, the interface `ReencryptionRequest` has `currentEncryptedBlob: Uint8Array`.
        // This means the caller is expected to fetch it.
        // This is fine for now.

        const encryptedBlob = request.currentEncryptedBlob;

        // Step 2: Re-encrypt blob
        request.onProgress?.('reencrypting', 0, 'Starting re-encryption process...');

        const { reencryptedBlob, result: reencryptStats } = await reencryptBlob(encryptedBlob, {
          decryptionOptions: {
            client: sealClient,
            sessionKey,
            packageId: CHAIN_CONFIG.packageId,
            identity: request.currentSealPolicyId,
            suiClient: suiClient,
          },
          encryptionOptions: {
            client: sealClient,
            identity: request.newSealPolicyId,
            packageId: CHAIN_CONFIG.packageId,
            accessPolicy: 'purchase', // Assuming purchase policy for now
            threshold: 4, // Should match system config
          },
          onProgress: request.onProgress,
        });

        // Step 3: Upload new blob to Walrus
        request.onProgress?.('uploading', 0, 'Uploading re-encrypted blob to Walrus...');

        // We need to upload `reencryptedBlob`.
        // We can use `uploadBlob` from `useWalrusParallelUpload` if we had it here.
        // But we can't use a hook inside a function.
        // We should probably accept an `uploader` function or implement a simple upload here.
        // Since `useWalrusParallelUpload` is complex (parallel, sponsored), duplicating it here is hard.
        // Ideally, `useReencryption` should use `useWalrusParallelUpload` internally.

        // Let's assume we can use a simple upload for now, or we need to refactor `useReencryption` to use the hook.
        // `useReencryption` IS a hook. So I can call `useWalrusParallelUpload` at the top level!

        // I will use the `uploadBlob` from the hook which I will add to `useReencryption`.

        const blob = new Blob([reencryptedBlob as any]);
        const uploadResult = await uploadBlob(blob, request.newSealPolicyId, {
          originalMimeType: 'application/octet-stream', // We might lose mime type here if not passed
          originalFileName: 'reencrypted.bin',
        });

        const newBlobId = uploadResult.blobId;

        // Step 4: Update on-chain submission
        request.onProgress?.('finalizing', 0, 'Updating on-chain submission...');

        const tx = new Transaction();
        tx.setGasBudget(100_000_000); // 0.1 SUI

        const submissionRef = tx.object(request.submissionId);

        tx.moveCall({
          target: `${CHAIN_CONFIG.packageId}::marketplace::reencrypt_submission`,
          arguments: [
            submissionRef,
            tx.pure.string(newBlobId),
            tx.pure.string(request.newSealPolicyId),
          ],
        });

        signAndExecute(
          { transaction: tx },
          {
            onSuccess: async (result) => {
              try {
                request.onProgress?.(
                  'finalizing',
                  90,
                  'Re-encryption confirmed. Fetching transaction details...'
                );

                await suiClient.waitForTransaction({ digest: result.digest });

                request.onProgress?.('finalizing', 100, 'Re-encryption complete');

                resolve({
                  submissionId: request.submissionId,
                  newBlobId,
                  digest: result.digest,
                });
              } catch (error) {
                reject(error);
              }
            },
            onError: (error) => {
              reject(
                new Error(
                  `Re-encryption transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
                )
              );
            },
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Validate re-encryption is possible before starting process
   */
  function validateReencryption(request: ReencryptionRequest): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!request.submissionId) {
      errors.push('Submission ID required');
    }
    if (!request.currentEncryptedBlob || request.currentEncryptedBlob.length === 0) {
      errors.push('Current encrypted blob required');
    }
    if (!request.currentSealPolicyId) {
      errors.push('Current Seal policy ID required');
    }
    if (!request.newSealPolicyId) {
      errors.push('New Seal policy ID required');
    }
    if (request.currentSealPolicyId === request.newSealPolicyId) {
      errors.push('New policy must differ from current policy');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  return {
    reencryptSubmission,
    validateReencryption,
    isSubmitting: isReencrypting,
  };
}
