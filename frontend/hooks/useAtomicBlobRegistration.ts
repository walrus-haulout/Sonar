"use client";

import { useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { CHAIN_CONFIG } from "@/lib/sui/client";

/**
 * Atomic Blob Registration Hook
 * Implements two-phase atomic registration pattern:
 * 1. register_blob_intent() - Creates BlobRegistration on-chain
 * 2. finalize_submission_with_blob() - Atomically links blob to AudioSubmission
 */

/**
 * Validate Walrus blob ID format
 * Walrus blob IDs are base64url-encoded strings (A-Za-z0-9_-)
 */
function isValidWalrusBlobId(blobId: string): boolean {
  if (!blobId || typeof blobId !== "string") return false;

  // Walrus blob IDs should be base64url format
  // Typical length: 32-64 characters
  const base64urlPattern = /^[A-Za-z0-9_-]+$/;
  return (
    base64urlPattern.test(blobId) && blobId.length >= 16 && blobId.length <= 128
  );
}

/**
 * Validate Seal policy ID format
 * Should be a hex string (Sui object ID)
 */
function isValidSealPolicyId(policyId: string): boolean {
  if (!policyId || typeof policyId !== "string") return false;

  // Sui object IDs are 64-character hex strings starting with 0x
  const hexPattern = /^0x[a-fA-F0-9]{64}$/;
  return hexPattern.test(policyId);
}

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
    durationSeconds: number,
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
                    change.type === "created" &&
                    change.objectType &&
                    change.objectType.includes(
                      "::marketplace::BlobRegistration",
                    )
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
                    event.type.includes("BlobRegistrationCreated") &&
                    event.parsedJson
                  ) {
                    const json = event.parsedJson as {
                      registration_id?: string;
                    };
                    if (json.registration_id) {
                      resolve(json.registration_id);
                      return;
                    }
                  }
                }
              }

              reject(
                new Error(
                  "Could not find registration object ID in transaction",
                ),
              );
            } catch (error) {
              reject(error);
            }
          },
          onError: (error) => {
            reject(
              new Error(
                `Failed to register blob intent: ${error instanceof Error ? error.message : "Unknown error"}`,
              ),
            );
          },
        },
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
    submissionFeeMist: number = 250_000_000, // 0.25 SUI minimum (actual fee varies 0.25-10 SUI based on quality)
    previewBlobHash?: Uint8Array,
  ): Promise<{ submissionId: string; digest: string }> {
    return new Promise((resolve, reject) => {
      // Validate blob IDs before constructing transaction
      if (!isValidWalrusBlobId(walrusBlobId)) {
        const error = new Error(
          `Invalid Walrus blob ID format: "${walrusBlobId}". ` +
            `Expected base64url string (A-Za-z0-9_-), length 16-128 chars.`,
        );
        console.error("[AtomicRegistration] Blob ID validation failed:", {
          walrusBlobId,
          length: walrusBlobId.length,
          pattern: /^[A-Za-z0-9_-]+$/.test(walrusBlobId),
        });
        reject(error);
        return;
      }

      if (!isValidSealPolicyId(sealPolicyId)) {
        const error = new Error(
          `Invalid Seal policy ID format: "${sealPolicyId}". ` +
            `Expected 0x-prefixed 64-char hex string.`,
        );
        console.error(
          "[AtomicRegistration] Seal policy ID validation failed:",
          {
            sealPolicyId,
            length: sealPolicyId.length,
            hasPrefix: sealPolicyId.startsWith("0x"),
          },
        );
        reject(error);
        return;
      }

      // Validate registration ID (should be Sui object ID)
      if (!registrationId || !registrationId.startsWith("0x")) {
        const error = new Error(
          `Invalid registration ID: "${registrationId}". ` +
            `Expected Sui object ID (0x-prefixed hex).`,
        );
        console.error(
          "[AtomicRegistration] Registration ID validation failed:",
          {
            registrationId,
          },
        );
        reject(error);
        return;
      }

      const tx = new Transaction();
      tx.setGasBudget(50_000_000); // 0.05 SUI

      if (!CHAIN_CONFIG.marketplaceId) {
        reject(new Error("Marketplace ID not configured"));
        return;
      }

      const marketplaceRef = tx.object(CHAIN_CONFIG.marketplaceId);
      const registrationRef = tx.object(registrationId);
      const submissionFeeCoin = tx.splitCoins(tx.gas, [submissionFeeMist])[0];

      // Debug logging before transaction construction
      console.log("[AtomicRegistration] Transaction parameters:", {
        registrationId,
        walrusBlobId,
        walrusBlobIdLength: walrusBlobId.length,
        walrusBlobIdSample: walrusBlobId.substring(0, 20) + "...",
        previewBlobId,
        previewBlobIdLength: previewBlobId.length,
        sealPolicyId,
        sealPolicyIdPrefix: sealPolicyId.substring(0, 10) + "...",
        durationSeconds,
        submissionFeeMist,
        hasPreviewBlobHash: !!previewBlobHash,
        previewBlobHashLength: previewBlobHash?.length,
        marketplaceId: CHAIN_CONFIG.marketplaceId,
        packageId: CHAIN_CONFIG.packageId,
        gasBudget: 50_000_000,
      });

      tx.moveCall({
        target: `${CHAIN_CONFIG.packageId}::marketplace::finalize_submission_with_blob`,
        arguments: [
          marketplaceRef,
          submissionFeeCoin,
          registrationRef,
          tx.pure.string(walrusBlobId),
          tx.pure.string(previewBlobId),
          previewBlobHash
            ? tx.pure.option("vector<u8>", Array.from(previewBlobHash))
            : tx.pure.option("vector<u8>", null),
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
                    change.type === "created" &&
                    change.objectType &&
                    change.objectType.includes("::marketplace::AudioSubmission")
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
                    event.type.includes("SubmissionCreated") &&
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
                    "Could not find submission object ID in transaction",
                  ),
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
            console.error(
              "[AtomicRegistration] Transaction execution failed:",
              {
                error: error instanceof Error ? error.message : String(error),
                errorName: error instanceof Error ? error.name : "Unknown",
                errorStack: error instanceof Error ? error.stack : undefined,
                transactionParams: {
                  registrationId,
                  walrusBlobId: walrusBlobId.substring(0, 20) + "...",
                  previewBlobId: previewBlobId.substring(0, 20) + "...",
                  sealPolicyId: sealPolicyId.substring(0, 20) + "...",
                  durationSeconds,
                  marketplaceId: CHAIN_CONFIG.marketplaceId,
                  packageId: CHAIN_CONFIG.packageId,
                },
              },
            );

            reject(
              new Error(
                `Failed to finalize submission: ${error instanceof Error ? error.message : "Unknown error"}. ` +
                  `Check console for transaction details.`,
              ),
            );
          },
        },
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
    previewBlobHash?: Uint8Array,
    options?: {
      existingRegistrationId?: string;
      onPhase1Complete?: (registrationId: string) => void;
    },
  ): Promise<{ submissionId: string; registrationId: string; digest: string }> {
    try {
      let registrationId = options?.existingRegistrationId;

      if (!registrationId) {
        // Phase 1: Register blob intent on-chain
        console.log("[AtomicRegistration] Phase 1: Registering blob intent...");
        registrationId = await registerBlobIntent(
          sealPolicyId,
          durationSeconds,
        );
        console.log("[AtomicRegistration] Phase 1 complete:", registrationId);
        options?.onPhase1Complete?.(registrationId);
      } else {
        console.log(
          "[AtomicRegistration] Skipping Phase 1, using existing registration:",
          registrationId,
        );
      }

      // Phase 2: Finalize submission with actual blob IDs
      console.log("[AtomicRegistration] Phase 2: Finalizing with blob IDs...");
      const { submissionId, digest } = await finalizeSubmissionWithBlob(
        registrationId,
        walrusBlobId,
        previewBlobId,
        sealPolicyId,
        durationSeconds,
        250_000_000, // 0.25 SUI (contract minimum)
        previewBlobHash,
      );
      console.log(
        "[AtomicRegistration] Phase 2 complete:",
        submissionId,
        "Digest:",
        digest,
      );

      return {
        submissionId,
        registrationId,
        digest,
      };
    } catch (error) {
      console.error("[AtomicRegistration] Failed:", error);
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
