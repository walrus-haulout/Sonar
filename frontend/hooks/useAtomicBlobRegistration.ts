'use client';

import { useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { CHAIN_CONFIG } from '@/lib/sui/client';

/**
 * Atomic Blob Registration Hook
 * Implements two-phase atomic registration pattern:
 * 1. register_blob_intent() - Creates BlobRegistration on-chain
 * 2. finalize_submission_with_blob() - Atomically links blob to AudioSubmission
 */

export interface BlobRegistrationState {
  registrationId?: string;
  sealPolicyId: string;
  durationSeconds: number;
}

export interface AtomicBlobSubmission {
  registrationId: string;
  walrusBlobId: string;
  previewBlobId: string;
  sealPolicyId: string;
  previewBlobHash?: Uint8Array;
}

export function useAtomicBlobRegistration() {
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending: isSubmitting } =
    useSignAndExecuteTransaction();

  /**
   * Phase 1: Create BlobRegistration on-chain
   * This reserves the blob intent before uploading to Walrus
   */
  async function registerBlobIntent(
    sealPolicyId: string,
    durationSeconds: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const tx = new Transaction();
      tx.setGasBudget(10_000_000); // 0.01 SUI

      tx.moveCall({
        target: `${CHAIN_CONFIG.packageId}::marketplace::register_blob_intent`,
        arguments: [
          tx.pure.string(sealPolicyId),
          tx.pure.u64(Math.floor(durationSeconds)),
        ],
      });

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async (result) => {
            try {
              // Fetch transaction details to get registration object ID
              const txDetails = await suiClient.getTransactionBlock({
                digest: result.digest,
                options: {
                  showObjectChanges: true,
                  showEvents: true,
                },
              });

              // Find the BlobRegistration object that was created
              if (txDetails.objectChanges) {
                for (const change of txDetails.objectChanges) {
                  if (
                    change.type === 'created' &&
                    change.objectType &&
                    change.objectType.includes('::marketplace::BlobRegistration')
                  ) {
                    resolve(change.objectId);
                    return;
                  }
                }
              }

              // Also check events for BlobRegistrationCreated
              if (txDetails.events) {
                for (const event of txDetails.events) {
                  if (
                    event.type.includes('BlobRegistrationCreated') &&
                    event.parsedJson
                  ) {
                    const json = event.parsedJson as { registration_id?: string };
                    if (json.registration_id) {
                      resolve(json.registration_id);
                      return;
                    }
                  }
                }
              }

              reject(
                new Error('Could not find registration object ID in transaction')
              );
            } catch (error) {
              reject(error);
            }
          },
          onError: (error) => {
            reject(
              new Error(
                `Failed to register blob intent: ${error instanceof Error ? error.message : 'Unknown error'}`
              )
            );
          },
        }
      );
    });
  }

  /**
   * Phase 2: Finalize submission with actual blob IDs
   * Atomically creates AudioSubmission and destroys BlobRegistration
   * This ensures blob_id is always synchronized with Move object
   */
  async function finalizeSubmissionWithBlob(
    registrationId: string,
    walrusBlobId: string,
    previewBlobId: string,
    sealPolicyId: string,
    durationSeconds: number,
    submissionFeeMist: number = 250_000_000, // 0.25 SUI
    previewBlobHash?: Uint8Array
  ): Promise<{ submissionId: string; digest: string }> {
    return new Promise((resolve, reject) => {
      const tx = new Transaction();
      tx.setGasBudget(50_000_000); // 0.05 SUI

      if (!CHAIN_CONFIG.marketplaceId) {
        reject(new Error('Marketplace ID not configured'));
        return;
      }

      const marketplaceRef = tx.object(CHAIN_CONFIG.marketplaceId);
      const registrationRef = tx.object(registrationId);
      const submissionFeeCoin = tx.splitCoins(tx.gas, [submissionFeeMist])[0];

      tx.moveCall({
        target: `${CHAIN_CONFIG.packageId}::marketplace::finalize_submission_with_blob`,
        arguments: [
          marketplaceRef,
          submissionFeeCoin,
          registrationRef,
          tx.pure.string(walrusBlobId),
          tx.pure.string(previewBlobId),
          previewBlobHash
            ? tx.pure.option(
                'vector<u8>',
                Array.from(previewBlobHash)
              )
            : tx.pure.option('vector<u8>', null),
        ],
      });

      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async (result) => {
            try {
              // Fetch transaction details to get submission object ID
              const txDetails = await suiClient.getTransactionBlock({
                digest: result.digest,
                options: {
                  showObjectChanges: true,
                  showEvents: true,
                },
              });

              // Find the AudioSubmission object that was created
              let submissionId: string | null = null;

              if (txDetails.objectChanges) {
                for (const change of txDetails.objectChanges) {
                  if (
                    change.type === 'created' &&
                    change.objectType &&
                    change.objectType.includes('::marketplace::AudioSubmission')
                  ) {
                    submissionId = change.objectId;
                    break;
                  }
                }
              }

              // Also check events
              if (!submissionId && txDetails.events) {
                for (const event of txDetails.events) {
                  if (
                    event.type.includes('SubmissionCreated') &&
                    event.parsedJson
                  ) {
                    const json = event.parsedJson as { submission_id?: string };
                    if (json.submission_id) {
                      submissionId = json.submission_id;
                      break;
                    }
                  }
                }
              }

              if (!submissionId) {
                reject(
                  new Error(
                    'Could not find submission object ID in transaction'
                  )
                );
                return;
              }

              resolve({
                submissionId,
                digest: result.digest,
              });
            } catch (error) {
              reject(error);
            }
          },
          onError: (error) => {
            reject(
              new Error(
                `Failed to finalize submission: ${error instanceof Error ? error.message : 'Unknown error'}`
              )
            );
          },
        }
      );
    });
  }

  /**
   * Complete atomic flow: register → upload → finalize
   * Provides a single entry point for the entire atomic submission process
   */
  async function submitWithAtomicRegistration(
    walrusBlobId: string,
    previewBlobId: string,
    sealPolicyId: string,
    durationSeconds: number,
    previewBlobHash?: Uint8Array
  ): Promise<{ submissionId: string; registrationId: string }> {
    try {
      // Phase 1: Register blob intent on-chain
      console.log('[AtomicRegistration] Phase 1: Registering blob intent...');
      const registrationId = await registerBlobIntent(
        sealPolicyId,
        durationSeconds
      );
      console.log('[AtomicRegistration] Phase 1 complete:', registrationId);

      // Phase 2: Finalize submission with actual blob IDs
      console.log('[AtomicRegistration] Phase 2: Finalizing with blob IDs...');
      const { submissionId, digest } = await finalizeSubmissionWithBlob(
        registrationId,
        walrusBlobId,
        previewBlobId,
        sealPolicyId,
        durationSeconds,
        250_000_000, // 0.25 SUI
        previewBlobHash
      );
      console.log(
        '[AtomicRegistration] Phase 2 complete:',
        submissionId,
        'Digest:',
        digest
      );

      return {
        submissionId,
        registrationId,
      };
    } catch (error) {
      console.error('[AtomicRegistration] Failed:', error);
      throw error;
    }
  }

  return {
    registerBlobIntent,
    finalizeSubmissionWithBlob,
    submitWithAtomicRegistration,
    isSubmitting,
  };
}
