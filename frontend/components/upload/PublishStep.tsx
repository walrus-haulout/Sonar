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

/**
 * Retry a transaction query with exponential backoff
 * Handles cases where transaction isn't indexed immediately
 */
async function retryTransactionQuery<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  baseDelay: number = 1000,
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const isLastRetry = i === maxRetries - 1;
      const isNotFoundError = error?.message?.includes("Could not find");

      if (isLastRetry || !isNotFoundError) {
        throw error;
      }

      const delay = baseDelay * Math.pow(2, i);
      console.log(
        `[PublishStep] Transaction not found, retrying in ${delay}ms... (attempt ${i + 1}/${maxRetries})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Retry limit exceeded");
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

  // Debug: Log verification data structure
  console.log("[PublishStep] Verification data received:", {
    hasAnalysis: !!verification.analysis,
    hasTranscript: !!verification.transcript,
    transcriptPreview: verification.transcript?.slice(0, 100),
    analysisKeys: verification.analysis
      ? Object.keys(verification.analysis)
      : [],
    qualityScore: verification.qualityScore,
    hasInsights: !!verification.insights,
    insightsCount: verification.insights?.length,
    hasQualityBreakdown: !!verification.qualityBreakdown,
    fullVerificationKeys: Object.keys(verification),
  });

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

      // Check if multi-file dataset (2+ files)
      const isMultiFile = walrusUpload.files && walrusUpload.files.length > 1;

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

          // Clear pending upload
          clearPendingUpload(walrusUpload.blobId);

          // Proceed with successful publication
          onPublished({
            txDigest: result.digest,
            datasetId: result.submissionId,
            confirmed: true,
          });

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
              const txDetails = await retryTransactionQuery(() =>
                suiClient.getTransactionBlock({
                  digest: result.digest,
                  options: {
                    showObjectChanges: true,
                    showEffects: true,
                    showEvents: true,
                  },
                }),
              );

              // Debug logging
              console.log("[PublishStep] Transaction details:", {
                digest: result.digest,
                hasObjectChanges: !!txDetails.objectChanges,
                objectChangesCount: txDetails.objectChanges?.length || 0,
                hasEvents: !!txDetails.events,
                eventsCount: txDetails.events?.length || 0,
                hasEffects: !!txDetails.effects,
                effectsCreatedCount: txDetails.effects?.created?.length || 0,
                effectsMutatedCount: txDetails.effects?.mutated?.length || 0,
              });

              if (txDetails.objectChanges) {
                console.log(
                  "[PublishStep] Object changes:",
                  txDetails.objectChanges.map((c) => ({
                    type: c.type,
                    objectId: "objectId" in c ? c.objectId : "N/A",
                    objectType: "objectType" in c ? c.objectType : "N/A",
                  })),
                );
              }

              if (txDetails.events) {
                console.log(
                  "[PublishStep] Events:",
                  txDetails.events.map((e) => ({
                    type: e.type,
                    hasSubmissionId: !!(e.parsedJson as any)?.submission_id,
                    parsedJson: e.parsedJson,
                  })),
                );
              }

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

              // 5. FINAL FALLBACK: Check ALL created objects and log their types
              if (!datasetId && txDetails.effects?.created) {
                console.warn(
                  "[PublishStep] Dataset ID not found via standard methods. Checking all created objects...",
                );
                for (const createdRef of txDetails.effects.created) {
                  try {
                    const objectId = extractObjectId(createdRef);
                    if (!objectId) continue;
                    const obj = await suiClient.getObject({
                      id: objectId,
                      options: { showType: true, showContent: true },
                    });
                    console.log("[PublishStep] Created object:", {
                      objectId,
                      type: obj.data?.type,
                      hasContent: !!obj.data?.content,
                    });

                    // Less strict matching - just check if it's from our package
                    if (
                      obj.data?.type &&
                      obj.data.type.includes(CHAIN_CONFIG.packageId || "")
                    ) {
                      console.log(
                        "[PublishStep] Using fallback: object from our package:",
                        objectId,
                      );
                      datasetId = objectId;
                      break;
                    }
                  } catch (e) {
                    console.warn(
                      "[PublishStep] Error checking created object:",
                      e,
                    );
                  }
                }
              }

              if (!datasetId) {
                console.error(
                  "[PublishStep] ❌ Failed to extract dataset ID. Transaction details:",
                  {
                    digest: result.digest,
                    objectChanges: txDetails.objectChanges,
                    events: txDetails.events,
                    effectsCreated: txDetails.effects?.created,
                    effectsMutated: txDetails.effects?.mutated,
                  },
                );
                throw new Error(
                  "Failed to extract dataset ID from transaction. " +
                    "The transaction succeeded but no AudioSubmission or DatasetSubmission object was found. " +
                    `Transaction digest: ${result.digest}`,
                );
              }

              if (datasetId) {
                console.log(
                  "[PublishStep] ✅ Dataset ID confirmed:",
                  datasetId,
                );

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
            } catch (error) {
              console.error("Transaction confirmation failed:", error);
              const errorMsg =
                error instanceof Error
                  ? error.message
                  : "Failed to confirm transaction";
              onError(errorMsg);
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
          {/* Verification Results Summary */}
          <GlassCard className="bg-sonar-signal/5">
            <h3 className="text-lg font-mono font-bold text-sonar-signal mb-4">
              ✓ AI Verification Complete
            </h3>

            <div className="space-y-4 text-sm">
              {/* Overall Summary */}
              {verification.analysis?.overallSummary && (
                <div className="pb-3 border-b border-sonar-signal/20">
                  <p className="text-sonar-highlight/80 leading-relaxed">
                    {verification.analysis.overallSummary}
                  </p>
                </div>
              )}

              {/* Key Metrics */}
              <div className="grid grid-cols-2 gap-3">
                {verification.qualityScore !== undefined && (
                  <div>
                    <span className="text-sonar-highlight/70 text-xs block mb-1">
                      Quality Score
                    </span>
                    <span className="text-sonar-signal font-mono font-bold text-lg">
                      {Math.round(verification.qualityScore * 100)}%
                    </span>
                  </div>
                )}

                <div>
                  <span className="text-sonar-highlight/70 text-xs block mb-1">
                    Safety Check
                  </span>
                  <span className="text-sonar-signal font-mono font-bold text-lg">
                    {verification.safetyPassed ? "✓ Passed" : "⚠ Review"}
                  </span>
                </div>

                {verification.suggestedPrice && (
                  <div>
                    <span className="text-sonar-highlight/70 text-xs block mb-1">
                      Suggested Price
                    </span>
                    <span className="text-sonar-signal font-mono font-bold text-lg">
                      {verification.suggestedPrice.toFixed(2)} SUI
                    </span>
                  </div>
                )}

                {verification.transcriptionDetails && (
                  <div>
                    <span className="text-sonar-highlight/70 text-xs block mb-1">
                      Speakers
                    </span>
                    <span className="text-sonar-signal font-mono font-bold text-lg">
                      {verification.transcriptionDetails.speakerCount}
                    </span>
                  </div>
                )}
              </div>

              {/* Quality Breakdown */}
              {verification.qualityBreakdown && (
                <div className="pt-3 border-t border-sonar-signal/20">
                  <span className="text-sonar-highlight/70 text-xs block mb-2">
                    Quality Breakdown
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {verification.qualityBreakdown.clarity !== null && (
                      <div className="flex justify-between text-xs">
                        <span className="text-sonar-highlight/60">
                          Clarity:
                        </span>
                        <span className="text-sonar-signal font-mono">
                          {Math.round(
                            verification.qualityBreakdown.clarity * 100,
                          )}
                          %
                        </span>
                      </div>
                    )}
                    {verification.qualityBreakdown.contentValue !== null && (
                      <div className="flex justify-between text-xs">
                        <span className="text-sonar-highlight/60">
                          Content:
                        </span>
                        <span className="text-sonar-signal font-mono">
                          {Math.round(
                            verification.qualityBreakdown.contentValue * 100,
                          )}
                          %
                        </span>
                      </div>
                    )}
                    {verification.qualityBreakdown.metadataAccuracy !==
                      null && (
                      <div className="flex justify-between text-xs">
                        <span className="text-sonar-highlight/60">
                          Metadata:
                        </span>
                        <span className="text-sonar-signal font-mono">
                          {Math.round(
                            verification.qualityBreakdown.metadataAccuracy *
                              100,
                          )}
                          %
                        </span>
                      </div>
                    )}
                    {verification.qualityBreakdown.completeness !== null && (
                      <div className="flex justify-between text-xs">
                        <span className="text-sonar-highlight/60">
                          Completeness:
                        </span>
                        <span className="text-sonar-signal font-mono">
                          {Math.round(
                            verification.qualityBreakdown.completeness * 100,
                          )}
                          %
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Insights */}
              {verification.insights && verification.insights.length > 0 && (
                <div className="pt-3 border-t border-sonar-signal/20">
                  <span className="text-sonar-highlight/70 text-xs block mb-2">
                    Key Insights
                  </span>
                  <ul className="space-y-1.5">
                    {verification.insights.slice(0, 5).map((insight, idx) => (
                      <li key={idx} className="flex items-start space-x-2">
                        <span className="text-sonar-signal mt-0.5">•</span>
                        <span className="text-sonar-highlight/70 text-xs leading-relaxed flex-1">
                          {insight}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Transcript Preview */}
              {verification.transcript && (
                <div className="pt-3 border-t border-sonar-signal/20">
                  <span className="text-sonar-highlight/70 text-xs block mb-2">
                    Transcript Preview
                  </span>
                  <div className="bg-sonar-abyss/30 rounded-sonar p-3 max-h-32 overflow-y-auto">
                    <p className="text-sonar-highlight/60 text-xs font-mono leading-relaxed whitespace-pre-wrap">
                      {verification.transcript.slice(0, 300)}
                      {verification.transcript.length > 300 && "..."}
                    </p>
                  </div>
                </div>
              )}

              {/* Concerns */}
              {verification.analysis?.concerns &&
                verification.analysis.concerns.length > 0 && (
                  <div className="pt-3 border-t border-sonar-coral/20">
                    <span className="text-sonar-coral text-xs block mb-2">
                      ⚠ Concerns
                    </span>
                    <ul className="space-y-1">
                      {verification.analysis.concerns.map((concern, idx) => (
                        <li key={idx} className="flex items-start space-x-2">
                          <span className="text-sonar-coral mt-0.5">!</span>
                          <span className="text-sonar-coral/70 text-xs leading-relaxed flex-1">
                            {concern}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          </GlassCard>

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
                  {(verification.detectedLanguages &&
                  verification.detectedLanguages.length > 0
                    ? verification.detectedLanguages
                    : metadata.languages || []
                  ).join(", ") || "Not specified"}
                  {verification.detectedLanguages &&
                    verification.detectedLanguages.length > 0 && (
                      <span className="text-sonar-signal/60 text-xs ml-1">
                        (AI-detected)
                      </span>
                    )}
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
            </div>
          </GlassCard>

          {/* Info Box - Moved before payment */}
          <GlassCard className="bg-sonar-signal/5">
            <div className="text-sm text-sonar-highlight/80 space-y-2">
              <p className="font-mono font-semibold text-sonar-signal">
                Ready to Publish
              </p>
              <p>
                Your audio has been encrypted, uploaded to Walrus, and verified
                by AI. Click below to publish to the blockchain and make it
                available for purchase.
              </p>
            </div>
          </GlassCard>

          {/* Upload Fee Info - Final step before button */}
          <GlassCard className="bg-sonar-blue/5 border-2 border-sonar-blue/30">
            <div className="flex items-start space-x-4">
              <Coins className="w-6 h-6 text-sonar-blue mt-0.5" />
              <div className="flex-1">
                <h4 className="font-mono font-semibold text-sonar-blue mb-2">
                  Final Step: Upload Fee
                </h4>
                <p className="text-sm text-sonar-highlight/80 mb-3">
                  A one-time upload fee of{" "}
                  <span className="text-sonar-signal font-mono font-bold">
                    {UPLOAD_FEE_LABEL}
                  </span>{" "}
                  is required to publish your verified dataset to the
                  blockchain. This helps prevent spam while tokenomics launch is
                  pending.
                </p>
                <div className="p-3 rounded-sonar bg-sonar-abyss/30 border border-sonar-blue/20">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-sonar-highlight/70">
                      Publication Fee:
                    </span>
                    <span className="font-mono font-bold text-sonar-signal text-lg">
                      {UPLOAD_FEE_LABEL}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Publish Button - Absolute final action */}
          <div className="flex flex-col items-center space-y-4">
            {publishState === "idle" && (
              <SonarButton
                variant="primary"
                onClick={handlePublish}
                disabled={publishDisabled}
                className="w-full text-lg py-4"
              >
                Pay {UPLOAD_FEE_LABEL} & Publish to Blockchain
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

            {/* What happens after publishing */}
            {publishState === "idle" && (
              <div className="text-center text-sm text-sonar-highlight/60 space-y-1 mt-2">
                <p>After publishing:</p>
                <p className="text-xs">
                  Buyers can purchase access • Revenue sent to your wallet •
                  Full ownership retained
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
