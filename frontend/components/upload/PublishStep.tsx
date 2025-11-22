"use client";

import { useState } from "react";
import { Coins, Wallet, Loader2 } from "lucide-react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import type {
  WalrusUploadResult,
  DatasetMetadata,
  VerificationResult,
  PublishResult,
} from "@/lib/types/upload";
import {
  extractObjectId,
  isSuiCreatedObject,
  type SuiEventParsedJson,
} from "@/lib/types/sui";
import { SonarButton } from "@/components/ui/SonarButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { CHAIN_CONFIG } from "@/lib/sui/client";
import { useAtomicBlobRegistration } from "@/hooks/useAtomicBlobRegistration";

/**
 * Convert Uint8Array to base64 string (browser-safe)
 */
function _uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

interface PublishStepProps {
  walrusUpload: WalrusUploadResult;
  metadata: DatasetMetadata;
  verification: VerificationResult;
  onPublished: (result: PublishResult) => void;
  onError: (error: string) => void;
}

const UPLOAD_FEE_MIST = 250_000_000; // 0.25 SUI expressed in MIST (1 SUI = 1_000_000_000 MIST)
const MIST_PER_SUI = 1_000_000_000;

function formatMistToSui(mist: number) {
  const value = mist / MIST_PER_SUI;
  return Number(value.toFixed(9)).toString();
}

const UPLOAD_FEE_LABEL = `${formatMistToSui(UPLOAD_FEE_MIST)} SUI`;

/**
 * PublishStep Component
 * Handles blockchain submission with fixed SUI submission fee
 */
export function PublishStep({
  walrusUpload,
  metadata,
  verification,
  onPublished,
  onError,
}: PublishStepProps) {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const { submitWithAtomicRegistration, isSubmitting: isAtomicSubmitting } =
    useAtomicBlobRegistration();
  const [publishState, setPublishState] = useState<
    "idle" | "signing" | "broadcasting" | "confirming"
  >("idle");
  const publishDisabled =
    isPending || isAtomicSubmitting || publishState !== "idle";

  // Helper to clear pending upload from local storage
  const clearPendingUpload = (walrusBlobId: string) => {
    try {
      const pending = JSON.parse(
        localStorage.getItem("pending_uploads") || "{}",
      );
      const fileIdToRemove = Object.keys(pending).find(
        (key) => pending[key].walrusBlobId === walrusBlobId,
      );
      if (fileIdToRemove) {
        delete pending[fileIdToRemove];
        localStorage.setItem("pending_uploads", JSON.stringify(pending));
        console.log(
          "[PublishStep] Cleared pending upload for blob:",
          walrusBlobId,
        );
      }
    } catch (e) {
      console.error("Failed to clear pending upload:", e);
    }
  };

  const handlePublish = async () => {
    if (!account) {
      onError("Please connect your wallet first");
      return;
    }

    try {
      setPublishState("signing");

      if (!CHAIN_CONFIG.packageId || !CHAIN_CONFIG.marketplaceId) {
        onError(
          `Blockchain configuration missing required IDs: ${CHAIN_CONFIG.missingKeys.join(", ") || "PACKAGE_ID / MARKETPLACE_ID"}`,
        );
        setPublishState("idle");
        return;
      }

      // Build transaction
      const tx = new Transaction();
      tx.setGasBudget(50_000_000); // 0.05 SUI

      const marketplaceSharedRef = tx.object(CHAIN_CONFIG.marketplaceId);

      // Check if multi-file dataset
      const isMultiFile = walrusUpload.files && walrusUpload.files.length > 0;

      if (isMultiFile) {
        // Multi-file dataset: Call submit_audio_dataset
        const files = walrusUpload.files;
        if (!files || files.length === 0) {
          onError("No files found in multi-file upload result");
          setPublishState("idle");
          return;
        }

        const blobIds = files.map((f) => f.blobId);
        const previewBlobIds = files.map((f) => f.previewBlobId || "");
        const sealPolicyIds = files.map((f) => f.seal_policy_id);
        const durations = files.map((f) => Math.max(1, Math.floor(f.duration))); // Convert to u64

        const uploadFeeCoin = tx.splitCoins(tx.gas, [UPLOAD_FEE_MIST])[0];

        tx.moveCall({
          target: `${CHAIN_CONFIG.packageId}::marketplace::submit_audio_dataset`,
          arguments: [
            marketplaceSharedRef,
            uploadFeeCoin,
            tx.pure.vector("string", blobIds),
            tx.pure.vector("string", previewBlobIds),
            tx.pure.vector("string", sealPolicyIds),
            tx.pure.vector("u64", durations),
            tx.pure.u64(walrusUpload.bundleDiscountBps || 0), // bundle_discount_bps
          ],
        });
      } else {
        // Single file: Use atomic blob registration for true atomicity
        // This replaces the old submit_audio call with a two-phase atomic transaction:
        // Phase 1: register_blob_intent() creates BlobRegistration on-chain
        // Phase 2: finalize_submission_with_blob() atomically creates AudioSubmission
        setPublishState("signing");

        try {
          console.log("[PublishStep] Starting atomic blob registration flow");

          // Validate Walrus upload data before proceeding
          console.log("[PublishStep] Validating Walrus upload data:", {
            blobId: walrusUpload.blobId,
            blobIdLength: walrusUpload.blobId.length,
            blobIdSample: walrusUpload.blobId.substring(0, 30) + "...",
            previewBlobId: walrusUpload.previewBlobId,
            sealPolicyId: walrusUpload.seal_policy_id,
            sealPolicyIdLength: walrusUpload.seal_policy_id?.length,
            hasEncryptedObjectHex: !!walrusUpload.encryptedObjectBcsHex,
            encryptedObjectHexLength:
              walrusUpload.encryptedObjectBcsHex?.length,
          });

          // Validate blob ID format
          if (!walrusUpload.blobId || walrusUpload.blobId.length < 16) {
            onError(
              `Invalid Walrus blob ID: "${walrusUpload.blobId}". ` +
                `Upload may have failed. Please try re-uploading.`,
            );
            setPublishState("idle");
            return;
          }

          // Validate seal policy ID
          if (
            !walrusUpload.seal_policy_id ||
            !walrusUpload.seal_policy_id.startsWith("0x")
          ) {
            onError(
              `Invalid Seal policy ID: "${walrusUpload.seal_policy_id}". ` +
                `Encryption may have failed. Please try re-encrypting.`,
            );
            setPublishState("idle");
            return;
          }

          // Check for existing registration ID in pending uploads (Recovery Flow)
          let existingRegistrationId: string | undefined;
          try {
            const pending = JSON.parse(
              localStorage.getItem("pending_uploads") || "{}",
            );
            const fileId = Object.keys(pending).find(
              (k) => pending[k].walrusBlobId === walrusUpload.blobId,
            );
            if (fileId && pending[fileId].registrationId) {
              existingRegistrationId = pending[fileId].registrationId;
              console.log(
                "[PublishStep] Found existing registration ID:",
                existingRegistrationId,
              );
            }
          } catch (e) {
            console.warn("Failed to check pending uploads:", e);
          }

          const result = await submitWithAtomicRegistration(
            walrusUpload.blobId,
            walrusUpload.previewBlobId || "",
            walrusUpload.seal_policy_id,
            3600, // duration_seconds (placeholder - should come from audioFile)
            undefined, // previewBlobHash
            {
              existingRegistrationId,
              onPhase1Complete: (regId) => {
                // Save registration ID to pending uploads
                try {
                  const pending = JSON.parse(
                    localStorage.getItem("pending_uploads") || "{}",
                  );
                  const fileId = Object.keys(pending).find(
                    (k) => pending[k].walrusBlobId === walrusUpload.blobId,
                  );
                  if (fileId) {
                    pending[fileId] = {
                      ...pending[fileId],
                      registrationId: regId,
                    };
                    localStorage.setItem(
                      "pending_uploads",
                      JSON.stringify(pending),
                    );
                    console.log(
                      "[PublishStep] Saved registration ID to pending uploads:",
                      regId,
                    );
                  }
                } catch (e) {
                  console.warn("Failed to save registration ID:", e);
                }
              },
            },
          );

          console.log("[PublishStep] Atomic registration successful:", result);
          setPublishState("confirming");

          // Proceed with object change detection
          onPublished({
            txDigest: "",
            datasetId: result.submissionId,
            confirmed: true,
          });

          // Clear pending upload
          clearPendingUpload(walrusUpload.blobId);

          return;
        } catch (error) {
          const errorMsg =
            error instanceof Error
              ? error.message
              : "Atomic registration failed";

          // Enhanced error logging
          console.error(
            "[PublishStep] Atomic registration failed with details:",
            {
              error: errorMsg,
              errorStack: error instanceof Error ? error.stack : undefined,
              walrusUpload: {
                blobId: walrusUpload.blobId?.substring(0, 30) + "...",
                blobIdLength: walrusUpload.blobId?.length,
                previewBlobId:
                  walrusUpload.previewBlobId?.substring(0, 30) + "...",
                sealPolicyId:
                  walrusUpload.seal_policy_id?.substring(0, 30) + "...",
                hasStrategy: !!walrusUpload.strategy,
                strategy: walrusUpload.strategy,
              },
            },
          );

          // Provide user-friendly error message
          let userMessage = errorMsg;
          if (errorMsg.includes("Invalid Walrus blob ID")) {
            userMessage =
              "The Walrus upload appears incomplete. Please try uploading again.";
          } else if (errorMsg.includes("Invalid Seal policy ID")) {
            userMessage =
              "The encryption step appears incomplete. Please try encrypting again.";
          } else if (errorMsg.includes("encoding")) {
            userMessage =
              "Blockchain validation failed. This may be a network issue. Please try again.";
          }

          console.error("[PublishStep] Atomic registration failed:", errorMsg);
          onError(userMessage);
          setPublishState("idle");
          return;
        }
      }

      setPublishState("broadcasting");

      // Sign and execute (for multi-file datasets using old flow)
      signAndExecute(
        {
          transaction: tx,
        },
        {
          onSuccess: async (result) => {
            setPublishState("confirming");
            let datasetId: string | null = null;

            try {
              const txDetails = await suiClient.getTransactionBlock({
                digest: result.digest,
                options: {
                  showObjectChanges: true,
                  showEffects: true,
                  showEvents: true,
                },
              });

              // 1. Check objectChanges
              if (txDetails.objectChanges) {
                for (const change of txDetails.objectChanges) {
                  if (change.type === "published") continue;
                  const objectId = change.objectId || extractObjectId(change);
                  if (
                    change.objectType &&
                    objectId &&
                    (change.objectType.includes(
                      "::marketplace::AudioSubmission",
                    ) ||
                      change.objectType.includes(
                        "::marketplace::DatasetSubmission",
                      ))
                  ) {
                    datasetId = objectId;
                    break;
                  }
                }
              }

              // 2. Check events
              if (!datasetId && txDetails.events && CHAIN_CONFIG.packageId) {
                for (const event of txDetails.events) {
                  const parsedJson = event.parsedJson as
                    | SuiEventParsedJson
                    | undefined;
                  if (
                    (event.type.includes("SubmissionCreated") ||
                      event.type.includes("DatasetSubmissionCreated")) &&
                    parsedJson?.submission_id
                  ) {
                    datasetId = parsedJson.submission_id;
                    break;
                  }
                }
              }

              // 3. Check effects.created
              if (!datasetId && txDetails.effects?.created) {
                for (const createdRef of txDetails.effects.created) {
                  try {
                    const objectId = extractObjectId(createdRef);
                    if (!objectId) continue;
                    const obj = await suiClient.getObject({
                      id: objectId,
                      options: { showType: true },
                    });
                    if (
                      obj.data?.type &&
                      (obj.data.type.includes(
                        "::marketplace::AudioSubmission",
                      ) ||
                        obj.data.type.includes(
                          "::marketplace::DatasetSubmission",
                        ))
                    ) {
                      datasetId = objectId;
                      break;
                    }
                  } catch (e) {
                    console.warn(e);
                  }
                }
              }

              // 4. Check effects.mutated
              if (!datasetId && txDetails.effects?.mutated) {
                for (const mutatedRef of txDetails.effects.mutated) {
                  try {
                    const objectId = extractObjectId(mutatedRef);
                    if (!objectId || objectId === CHAIN_CONFIG.marketplaceId)
                      continue;
                    const obj = await suiClient.getObject({
                      id: objectId,
                      options: { showType: true },
                    });
                    if (
                      obj.data?.type &&
                      (obj.data.type.includes(
                        "::marketplace::AudioSubmission",
                      ) ||
                        obj.data.type.includes(
                          "::marketplace::DatasetSubmission",
                        ))
                    ) {
                      datasetId = objectId;
                      break;
                    }
                  } catch (e) {
                    console.warn(e);
                  }
                }
              }

              if (datasetId) {
                console.log("Dataset ID confirmed:", datasetId);

                // Clear pending uploads
                if (isMultiFile && walrusUpload.files) {
                  walrusUpload.files.forEach((f) =>
                    clearPendingUpload(f.blobId),
                  );
                } else {
                  clearPendingUpload(walrusUpload.blobId);
                }

                // Backend Metadata Storage
                try {
                  const fallbackDuration = Math.max(
                    1,
                    Math.floor(walrusUpload.files?.[0]?.duration ?? 3600),
                  );
                  const fallbackPreviewId =
                    walrusUpload.previewBlobId ??
                    walrusUpload.files?.[0]?.previewBlobId ??
                    null;
                  const fallbackMime =
                    walrusUpload.mimeType ||
                    walrusUpload.files?.[0]?.mimeType ||
                    "audio/mpeg";
                  const fallbackPreviewMime =
                    walrusUpload.previewMimeType ??
                    walrusUpload.files?.[0]?.previewMimeType ??
                    null;

                  const files =
                    walrusUpload.files && walrusUpload.files.length > 0
                      ? walrusUpload.files.map((file) => ({
                          file_index: file.file_index || 0,
                          seal_policy_id: file.seal_policy_id,
                          blob_id: file.blobId,
                          preview_blob_id: file.previewBlobId ?? null,
                          duration_seconds: Math.max(
                            1,
                            Math.floor(file.duration),
                          ),
                          mime_type:
                            file.mimeType ||
                            walrusUpload.mimeType ||
                            "audio/mpeg",
                          preview_mime_type:
                            file.previewMimeType ??
                            walrusUpload.previewMimeType ??
                            null,
                        }))
                      : [
                          {
                            file_index: 0,
                            seal_policy_id: walrusUpload.seal_policy_id,
                            blob_id: walrusUpload.blobId,
                            preview_blob_id: fallbackPreviewId,
                            duration_seconds: fallbackDuration,
                            mime_type: fallbackMime,
                            preview_mime_type: fallbackPreviewMime,
                          },
                        ];

                  const verificationMetadata = verification
                    ? {
                        verification_id: verification.id,
                        quality_score: verification.qualityScore,
                        safety_passed: verification.safetyPassed,
                        verified_at: new Date().toISOString(),
                      }
                    : null;

                  const datasetMetadata = {
                    title: metadata.title,
                    description: metadata.description,
                    languages: metadata.languages,
                    tags: metadata.tags,
                    per_file_metadata: metadata.perFileMetadata,
                    audio_quality: metadata.audioQuality || null,
                    speakers: metadata.speakers || null,
                    categorization: metadata.categorization,
                  };

                  await fetch(`/api/datasets/${datasetId}/seal-metadata`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      files,
                      verification: verificationMetadata,
                      metadata: datasetMetadata,
                    }),
                  });
                } catch (error) {
                  const errorMsg =
                    error instanceof Error
                      ? error.message
                      : "Atomic registration failed";

                  // Enhanced error logging
                  console.error(
                    "[PublishStep] Atomic registration failed with details:",
                    {
                      error: errorMsg,
                      errorStack:
                        error instanceof Error ? error.stack : undefined,
                      walrusUpload: {
                        blobId: walrusUpload.blobId?.substring(0, 30) + "...",
                        blobIdLength: walrusUpload.blobId?.length,
                        previewBlobId:
                          walrusUpload.previewBlobId?.substring(0, 30) + "...",
                        sealPolicyId:
                          walrusUpload.seal_policy_id?.substring(0, 30) + "...",
                        hasStrategy: !!walrusUpload.strategy,
                        strategy: walrusUpload.strategy,
                      },
                    },
                  );

                  // Provide user-friendly error message
                  let userMessage = errorMsg;
                  if (errorMsg.includes("Invalid Walrus blob ID")) {
                    userMessage =
                      "The Walrus upload appears incomplete. Please try uploading again.";
                  } else if (errorMsg.includes("Invalid Seal policy ID")) {
                    userMessage =
                      "The encryption step appears incomplete. Please try encrypting again.";
                  } else if (errorMsg.includes("encoding")) {
                    userMessage =
                      "Blockchain validation failed. This may be a network issue. Please try again.";
                  }

                  console.error(
                    "[PublishStep] Atomic registration failed:",
                    errorMsg,
                  );
                  onError(userMessage);
                  setPublishState("idle");
                  return;
                }

                onPublished({
                  txDigest: result.digest,
                  datasetId,
                  confirmed: true,
                });
                return;
              }

              throw new Error("Failed to extract dataset ID from transaction");
            } catch (error) {
              console.error("Transaction confirmation failed:", error);
              onError("Failed to confirm transaction.");
              setPublishState("idle");
            }
          },
          onError: (error) => {
            console.error("Transaction failed:", error);
            setPublishState("idle");
            onError(error.message || "Failed to publish dataset to blockchain");
          },
        },
      );
    } catch (error) {
      console.error("Publish error:", error);
      setPublishState("idle");
      onError(
        error instanceof Error ? error.message : "Failed to publish dataset",
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Wallet Connection Check */}
      {!account ? (
        <GlassCard className="bg-sonar-coral/10 border border-sonar-coral">
          <div className="flex items-center space-x-4">
            <Wallet className="w-8 h-8 text-sonar-coral" />
            <div>
              <h3 className="text-lg font-mono font-bold text-sonar-coral">
                Wallet Not Connected
              </h3>
              <p className="text-sm text-sonar-highlight/70 mt-1">
                Please connect your Sui wallet to publish your dataset to the
                blockchain.
              </p>
            </div>
          </div>
        </GlassCard>
      ) : (
        <>
          {/* Transaction Summary */}
          <GlassCard>
            <h3 className="text-lg font-mono font-bold text-sonar-highlight-bright mb-4">
              Publication Summary
            </h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-sonar-highlight/70">Dataset Title:</span>
                <span className="text-sonar-highlight-bright font-mono">
                  {metadata.title}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-sonar-highlight/70">Languages:</span>
                <span className="text-sonar-highlight-bright font-mono">
                  {(metadata.languages || []).join(", ") || "Not specified"}
                </span>
              </div>

              {walrusUpload.files && walrusUpload.files.length > 0 ? (
                <>
                  {/* Multi-file dataset */}
                  <div className="flex justify-between">
                    <span className="text-sonar-highlight/70">Files:</span>
                    <span className="text-sonar-signal font-mono">
                      {walrusUpload.files.length} audio files
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-sonar-highlight/70">
                      Total Duration:
                    </span>
                    <span className="text-sonar-signal font-mono">
                      {Math.floor(
                        walrusUpload.files.reduce(
                          (sum, f) => sum + f.duration,
                          0,
                        ) / 60,
                      )}{" "}
                      minutes
                    </span>
                  </div>

                  {walrusUpload.bundleDiscountBps &&
                    walrusUpload.bundleDiscountBps > 0 && (
                      <div className="flex justify-between">
                        <span className="text-sonar-highlight/70">
                          Bundle Discount:
                        </span>
                        <span className="text-sonar-signal font-mono">
                          {walrusUpload.bundleDiscountBps / 100}%
                        </span>
                      </div>
                    )}
                </>
              ) : (
                <>
                  {/* Single file dataset */}
                  <div className="flex justify-between">
                    <span className="text-sonar-highlight/70">
                      Walrus Blob ID:
                    </span>
                    <span className="text-sonar-signal font-mono text-xs truncate max-w-xs">
                      {walrusUpload.blobId}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-sonar-highlight/70">
                      Seal Policy ID:
                    </span>
                    <span className="text-sonar-signal font-mono text-xs truncate max-w-xs">
                      {walrusUpload.seal_policy_id}
                    </span>
                  </div>
                </>
              )}

              {verification.qualityScore && (
                <div className="flex justify-between">
                  <span className="text-sonar-highlight/70">
                    Quality Score:
                  </span>
                  <span className="text-sonar-signal font-mono">
                    {Math.round(verification.qualityScore * 100)}%
                  </span>
                </div>
              )}
            </div>
          </GlassCard>

          {/* Upload Fee Info */}
          <GlassCard className="bg-sonar-blue/5">
            <div className="flex items-start space-x-4">
              <Coins className="w-6 h-6 text-sonar-blue mt-0.5" />
              <div className="flex-1">
                <h4 className="font-mono font-semibold text-sonar-blue mb-2">
                  Upload Fee Required
                </h4>
                <p className="text-sm text-sonar-highlight/80 mb-3">
                  A fixed upload fee of{" "}
                  <span className="text-sonar-signal font-mono">
                    {UPLOAD_FEE_LABEL}
                  </span>{" "}
                  is required to publish your dataset on mainnet. This helps
                  prevent spam uploads while tokenomics launch is pending.
                </p>
                <div className="p-3 rounded-sonar bg-sonar-abyss/30">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-sonar-highlight/70">
                      Estimated Fee:
                    </span>
                    <span className="font-mono font-bold text-sonar-signal">
                      {UPLOAD_FEE_LABEL}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Publish Button */}
          <div className="flex flex-col items-center space-y-4">
            {publishState === "idle" && (
              <SonarButton
                variant="primary"
                onClick={handlePublish}
                disabled={publishDisabled}
                className="w-full"
              >
                Publish to Blockchain
              </SonarButton>
            )}

            {(publishState === "signing" ||
              publishState === "broadcasting" ||
              publishState === "confirming") && (
              <GlassCard className="w-full bg-sonar-signal/10 border border-sonar-signal">
                <div className="flex items-center space-x-4">
                  <Loader2 className="w-6 h-6 text-sonar-signal animate-spin" />
                  <div className="flex-1">
                    <p className="font-mono font-semibold text-sonar-highlight-bright">
                      {publishState === "signing" &&
                        "Waiting for wallet signature..."}
                      {publishState === "broadcasting" &&
                        "Broadcasting transaction..."}
                      {publishState === "confirming" &&
                        "Confirming on blockchain..."}
                    </p>
                    <p className="text-xs text-sonar-highlight/70 mt-1">
                      Please do not close this window
                    </p>
                  </div>
                </div>
              </GlassCard>
            )}
          </div>

          {/* Info Box */}
          <GlassCard className="bg-sonar-signal/5">
            <div className="text-sm text-sonar-highlight/80 space-y-2">
              <p className="font-mono font-semibold text-sonar-signal">
                What happens next?
              </p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Your dataset will be published to the Sui blockchain</li>
                <li>Buyers can discover and purchase access</li>
                <li>Revenue will be sent directly to your wallet</li>
                <li>You maintain full ownership and control</li>
              </ul>
            </div>
          </GlassCard>
        </>
      )}
    </div>
  );
}
