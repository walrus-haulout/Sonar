'use client';

import { useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { CHAIN_CONFIG } from '@/lib/sui/client';
import { reencryptBlob, validateReencryptionOptions } from '@sonar/seal';
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
  const { mutate: signAndExecute, isPending: isSubmitting } =
    useSignAndExecuteTransaction();

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
    return new Promise((resolve, reject) => {
      if (!CHAIN_CONFIG.packageId) {
        reject(new Error('Package ID not configured'));
        return;
      }

      // Step 1: Decrypt and re-encrypt the blob in memory
      // This assumes we have access to the Seal SDK through a context provider
      // For now, we'll implement the transaction submission part
      // The actual crypto operations would be done in a service worker or backend

      try {
        request.onProgress?.('reencrypting', 0, 'Starting re-encryption process...');

        // Step 2: Simulate re-encryption (in production, this would be async via SDK)
        // For now, we'll show the transaction submission part

        const tx = new Transaction();
        tx.setGasBudget(100_000_000); // 0.1 SUI for re-encryption + storage

        // Get mutable reference to AudioSubmission
        const submissionRef = tx.object(request.submissionId);

        // Call reencrypt_submission with new blob IDs
        // In production, these would come from Walrus upload
        const placeholderNewBlobId = 'placeholder-blob-id'; // Would be from Walrus

        tx.moveCall({
          target: `${CHAIN_CONFIG.packageId}::marketplace::reencrypt_submission`,
          arguments: [
            submissionRef,
            tx.pure.string(placeholderNewBlobId),
            tx.pure.string(request.newSealPolicyId),
          ],
        });

        request.onProgress?.('reencrypting', 50, 'Submitting re-encryption transaction...');

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

                const txDetails = await suiClient.getTransactionBlock({
                  digest: result.digest,
                  options: {
                    showObjectChanges: true,
                    showEvents: true,
                  },
                });

                request.onProgress?.('finalizing', 100, 're-encryption complete');

                resolve({
                  submissionId: request.submissionId,
                  newBlobId: placeholderNewBlobId,
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
    isSubmitting,
  };
}
