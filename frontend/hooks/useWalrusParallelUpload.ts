/**
 * useWalrusParallelUpload
 *
 * Handles Walrus uploads with user-paid registration:
 * 1. Uploads file to Walrus Publisher (HTTP) to get Blob ID and storage metadata.
 * 2. Prompts user to sign a `register_blob` transaction on-chain.
 * 3. Returns the result once the transaction is confirmed.
 */

import type { EncryptionMetadata } from "@sonar/seal";
import { useState, useCallback } from "react";
import {
  useSuiClient,
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { normalizeAudioMimeType, getExtensionForMime } from "@/lib/audio/mime";
import { collectCoinsForAmount } from "@/lib/sui/coin-utils";
import type { WalrusUploadResult } from "@/lib/types/upload";
import { getWalrusClient } from "@/lib/walrus/client";

const MAX_UPLOAD_SIZE = 1 * 1024 * 1024 * 1024; // 1GB

/**
 * Validate Walrus blob ID format
 * Blob IDs should be base64url encoded strings (typically 43-44 characters)
 */
function isValidBlobId(blobId: string | undefined): boolean {
  if (!blobId || typeof blobId !== "string") {
    return false;
  }

  // Blob IDs are base64url encoded (A-Za-z0-9_-)
  // Typical length is 43-44 characters for 256-bit hashes
  const base64urlPattern = /^[A-Za-z0-9_-]{16,}$/;
  return base64urlPattern.test(blobId) && blobId.length >= 16;
}

export interface WalrusUploadProgress {
  totalFiles: number;
  completedFiles: number;
  currentFile: number;
  fileProgress: number; // 0-100
  totalProgress: number; // 0-100
  stage:
    | "encrypting"
    | "uploading"
    | "registering"
    | "finalizing"
    | "completed";
  currentRetry?: number; // Current retry attempt (1-10)
  maxRetries?: number; // Max retry attempts
}

type WalrusUploadMetadata =
  | EncryptionMetadata
  | Record<string, unknown>
  | undefined;

interface UploadBlobOptions {
  fileName?: string;
  mimeType?: string;
  previewBlob?: Blob;
  previewFileName?: string;
  previewMimeType?: string;
}

function ensureBlobMimeType(blob?: Blob, mime?: string): Blob | undefined {
  if (!blob) {
    return undefined;
  }

  const targetMime =
    normalizeAudioMimeType(mime) ?? normalizeAudioMimeType(blob.type);

  if (!targetMime) {
    return blob.type
      ? blob
      : new Blob([blob], { type: "application/octet-stream" });
  }

  if (normalizeAudioMimeType(blob.type) === targetMime) {
    return blob;
  }

  return new Blob([blob], { type: targetMime });
}

function inferFileName(base: string, mime?: string): string {
  const normalizedMime = normalizeAudioMimeType(mime);
  if (!normalizedMime) {
    return base;
  }

  if (base.includes(".")) {
    return base;
  }

  const extension = getExtensionForMime(normalizedMime);
  return extension ? `${base}.${extension}` : base;
}

/**
 * Preflight check for WAL balance before blob registration
 */
async function checkWalBalance(
  suiClient: any,
  walletAddress: string,
): Promise<{ hasBalance: boolean; totalBalance: bigint }> {
  const walCoinType = `${process.env.NEXT_PUBLIC_WAL_TOKEN_PACKAGE}::wal::WAL`;

  try {
    const coinsResult = await collectCoinsForAmount(
      suiClient,
      walletAddress,
      walCoinType,
      1n, // Check if at least 1 unit available
    );

    const hasBalance = coinsResult.coins.length > 0;
    console.log("[Walrus] Preflight WAL check:", {
      hasBalance,
      totalBalance: coinsResult.total.toString(),
      coinCount: coinsResult.coins.length,
    });

    return { hasBalance, totalBalance: coinsResult.total };
  } catch (error) {
    console.error("[Walrus] WAL preflight check failed:", error);
    return { hasBalance: false, totalBalance: 0n };
  }
}

export function useWalrusParallelUpload() {
  const suiClient = useSuiClient();
  const currentAccount = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const [progress, setProgress] = useState<WalrusUploadProgress>({
    totalFiles: 0,
    completedFiles: 0,
    currentFile: 0,
    fileProgress: 0,
    totalProgress: 0,
    stage: "encrypting",
  });

  /**
   * Upload via Edge Function with client-side retry tracking and progress updates
   * Edge Function handles CORS and proxies to Walrus Publisher with 240s timeout
   */
  const fetchUploadWithRetry = useCallback(
    async (
      formData: FormData,
      maxRetries: number = 10,
    ): Promise<{ response: Response; attempt: number }> => {
      let lastError: Error | null = null;
      const fileName =
        formData.get("file") instanceof File
          ? (formData.get("file") as File).name
          : "unknown";

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // Update progress with retry attempt
          setProgress((prev) => ({
            ...prev,
            currentRetry: attempt,
            maxRetries,
          }));

          // Create a new FormData for each attempt (since body can only be read once)
          const attemptFormData = new FormData();
          for (const [key, value] of formData.entries()) {
            attemptFormData.append(key, value);
          }

          console.log(
            `[Upload] Edge Function upload attempt ${attempt}/${maxRetries}`,
            { fileName, attempt, maxRetries },
          );

          const response = await fetch("/api/edge/walrus/upload", {
            method: "POST",
            body: attemptFormData,
          });

          if (response.ok) {
            console.log(`[Upload] Success on attempt ${attempt}`, { fileName });
            return { response, attempt };
          }

          // Log non-200 response for debugging
          let errorDetail = response.statusText;
          try {
            const errorBody = await response.json();
            errorDetail = errorBody.error || errorBody.details || errorDetail;
          } catch {
            // Fallback to statusText if JSON parsing fails
          }

          console.warn(
            `[Upload] Attempt ${attempt}/${maxRetries} failed with HTTP ${response.status}: ${errorDetail}`,
            { fileName, status: response.status, errorDetail },
          );

          // Non-200 response, retry if not the last attempt
          if (attempt < maxRetries) {
            const delayMs = attempt * 2000; // Progressive: 2s, 4s, 6s...
            console.log(`[Upload] Retrying in ${delayMs}ms...`, {
              fileName,
              attempt,
            });
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
          }

          return { response, attempt };
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          const isTimeout =
            lastError.message.includes("timeout") ||
            lastError.message.includes("aborted");

          console.error(
            `[Upload] Attempt ${attempt}/${maxRetries} failed with error:`,
            {
              fileName,
              error: lastError.message,
              isTimeout,
              attempt,
              maxRetries,
            },
          );

          // If last attempt, throw error with context
          if (attempt === maxRetries) {
            const contextualError = new Error(
              `Upload failed after ${maxRetries} attempts: ${lastError.message}${isTimeout ? " (timeout)" : ""}`,
            );
            throw contextualError;
          }

          // Retry with progressive delay
          const delayMs = attempt * 2000; // Progressive: 2s, 4s, 6s...
          console.log(`[Upload] Retrying in ${delayMs}ms...`, {
            fileName,
            attempt,
          });
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      throw lastError || new Error("Upload failed after all retry attempts");
    },
    [],
  );

  /**
   * Upload encrypted blob using Walrus SDK with proper on-chain registration
   * This creates a Sui blockchain transaction that registers the blob
   */
  const uploadToPublisher = useCallback(
    async (
      encryptedBlob: Blob,
      seal_policy_id: string,
      metadata: WalrusUploadMetadata,
      options: UploadBlobOptions = {},
    ): Promise<{
      blobId: string;
      size: number;
      encodingType?: string;
      storageId?: string;
      deletable?: boolean;
      previewBlobId?: string;
      previewStorageId?: string;
      previewSize?: number;
      previewEncodingType?: string;
      previewDeletable?: boolean;
      mimeType?: string;
      previewMimeType?: string;
      blobObjectId?: string;
      previewBlobObjectId?: string;
    }> => {
      if (!currentAccount) {
        throw new Error(
          "Wallet not connected - required for on-chain blob registration",
        );
      }
      const fileSizeMB = (encryptedBlob.size / (1024 * 1024)).toFixed(2);
      console.log(
        `[Upload] Uploading main blob with SDK: ${options.fileName ?? "encrypted-audio.bin"} (${fileSizeMB}MB)`,
        {
          sealed_policy_id: seal_policy_id.substring(0, 20) + "...",
          epochs: "26",
          hasMetadata: !!metadata,
          owner: currentAccount.address,
        },
      );

      // Convert Blob to Uint8Array for SDK
      const arrayBuffer = await encryptedBlob.arrayBuffer();
      const blobData = new Uint8Array(arrayBuffer);

      // Get Walrus client with SDK
      const walrusClient = getWalrusClient();

      console.log("[Upload] Writing blob with on-chain registration...");

      setProgress((prev) => ({
        ...prev,
        stage: "registering",
      }));

      // Use SDK writeBlob which properly registers on-chain
      // The SDK will prompt user to sign the transaction via wallet
      const result = await walrusClient.walrus.writeBlob({
        blob: blobData,
        epochs: 26,
        deletable: true,
        signer: {
          signTransaction: async (tx: any) => {
            const signed = await signAndExecute({
              transaction: tx,
            });
            return signed;
          },
        } as any,
      });

      const blobId = result.blobId;
      const blobObjectId = result.blobObject.id.id;
      const encodingType = result.blobObject.encoding_type;
      const deletable = result.blobObject.deletable;
      const storageId = result.blobObject.storage.id.id;

      // Validate blob ID format
      if (!isValidBlobId(blobId)) {
        console.error("[Upload] Invalid blob ID received from Walrus SDK:", {
          blobId,
          blobIdType: typeof blobId,
          blobIdLength: blobId?.length,
          fullResult: result,
        });
        throw new Error(
          `Invalid blob ID received from Walrus SDK: "${blobId}". ` +
            `Expected base64url encoded string. Upload may have failed.`,
        );
      }

      console.log("[Upload] Main blob uploaded and registered on-chain:", {
        blobId,
        blobObjectId,
        size: encryptedBlob.size,
      });

      // Upload preview blob if provided
      let finalPreviewBlobId: string | undefined;
      let previewStorageId: string | undefined;
      let previewSize: number | undefined;
      let previewEncodingType: string | undefined;
      let previewDeletable: boolean | undefined;
      let previewBlobObjectId: string | undefined;
      let effectivePreviewMimeType =
        normalizeAudioMimeType(options.previewMimeType) ??
        normalizeAudioMimeType(options.previewBlob?.type);

      if (options.previewBlob) {
        const previewBlob =
          ensureBlobMimeType(options.previewBlob, options.previewMimeType) ??
          options.previewBlob;
        effectivePreviewMimeType =
          normalizeAudioMimeType(previewBlob.type) ?? effectivePreviewMimeType;
        const previewFileName = inferFileName(
          options.previewFileName ?? "preview",
          effectivePreviewMimeType,
        );

        const previewSizeMB = (previewBlob.size / (1024 * 1024)).toFixed(2);
        console.log(
          `[Upload] Uploading preview blob with SDK: ${previewFileName} (${previewSizeMB}MB)`,
        );

        try {
          // Convert preview Blob to Uint8Array
          const previewArrayBuffer = await previewBlob.arrayBuffer();
          const previewBlobData = new Uint8Array(previewArrayBuffer);

          // Upload preview with SDK
          const previewResult = await walrusClient.walrus.writeBlob({
            blob: previewBlobData,
            epochs: 26,
            deletable: true,
            signer: {
              signTransaction: async (tx: any) => {
                const signed = await signAndExecute({
                  transaction: tx,
                });
                return signed;
              },
            } as any,
          });

          finalPreviewBlobId = previewResult.blobId;
          previewBlobObjectId = previewResult.blobObject.id.id;
          previewStorageId = previewResult.blobObject.storage.id.id;
          previewEncodingType =
            previewResult.blobObject.encoding_type?.toString();
          previewDeletable = previewResult.blobObject.deletable;
          previewSize = previewBlob.size;

          console.log(
            "[Upload] Preview blob uploaded and registered on-chain:",
            {
              blobId: finalPreviewBlobId,
              blobObjectId: previewBlobObjectId,
              storageId: previewStorageId,
              size: previewSize,
            },
          );
        } catch (previewError) {
          // Log error but don't fail the entire upload
          console.warn(
            `[Upload] Preview upload exception (non-fatal):`,
            previewError instanceof Error ? previewError.message : previewError,
            {
              fileName: previewFileName,
              size: previewSizeMB,
            },
          );
          // Continue without preview
        }
      }

      console.log("[Upload] SDK upload complete with on-chain registration:");
      console.log(
        "  Main blob:",
        blobId,
        "| Object ID:",
        blobObjectId,
        `(${encryptedBlob.size} bytes)`,
      );
      console.log(
        "  Preview blob:",
        finalPreviewBlobId || "none",
        finalPreviewBlobId
          ? `| Object ID: ${previewBlobObjectId} (${previewSize} bytes)`
          : "",
      );

      return {
        blobId,
        size: encryptedBlob.size,
        encodingType: encodingType?.toString(),
        storageId,
        deletable,
        blobObjectId,
        previewBlobId: finalPreviewBlobId,
        previewStorageId,
        previewSize,
        previewEncodingType,
        previewDeletable,
        previewBlobObjectId,
        mimeType: normalizeAudioMimeType(options.mimeType) ?? undefined,
        previewMimeType: effectivePreviewMimeType,
      };
    },
    [fetchUploadWithRetry],
  );

  /**
   * Batch register blobs and submit to marketplace
   */
  const batchRegisterAndSubmit = useCallback(
    async (
      mainBlob: {
        blobId: string;
        size: number;
        encodingType?: string;
        storageId?: string;
        deletable?: boolean;
      },
      previewBlob: {
        blobId: string;
        size: number;
        encodingType?: string;
        storageId?: string;
        deletable?: boolean;
      },
      submission: {
        sealPolicyId: string;
        durationSeconds: number;
        previewBlobHash?: string;
      },
    ): Promise<string> => {
      if (!currentAccount) {
        throw new Error("Wallet not connected");
      }

      setProgress((prev) => ({
        ...prev,
        stage: "registering",
      }));

      console.log("[Walrus] Building batch registration transaction...");

      // 0.5-10 SUI for submission fee (varies based on quality)
      const SUI_PAYMENT_AMOUNT = 500_000_000n; // Minimum fee

      // We need to find a SUI coin for the submission fee
      // This is a bit tricky since we can't easily "pick" a coin in the frontend without more helpers
      // For now, we'll assume the wallet handles gas, but we need to pass a Coin<SUI> object to the move call.
      // Actually, the buildBatchRegisterAndSubmitTransaction expects a coin ID.
      // We can use the `collectCoinsForAmount` helper again or similar logic.
      // However, to simplify, we might want to let the wallet handle coin selection if possible,
      // but Move calls require specific object IDs for Coin arguments.
      // A common pattern is to use a "SplitCoin" transaction, but we are building the transaction block here.

      // Let's use the buildBatchRegisterAndSubmitTransactionAsync which we can update to handle SUI coin too?
      // Or we can do it here.

      // For now, let's assume we pass the transaction builder a placeholder or handle it inside the builder.
      // Wait, the builder I wrote expects `suiPaymentCoinId`.
      // I should probably update the builder to handle SUI coin selection or use a gas coin split.
      // BUT, `Transaction` block allows `tx.splitCoins(tx.gas, [amount])`.
      // So we should update the builder to use `tx.gas` if possible, or split from gas.

      // Let's update the builder in the next step to support splitting from gas.
      // For now, I will call the async builder.

      // REVISIT: We need to update buildBatchRegisterAndSubmitTransaction to use splitCoins from gas!
      // I will do that in a separate tool call. For now, I'll put a placeholder and fix it immediately.

      const tx = await import("@/lib/walrus/buildRegisterBlobTransaction").then(
        (m) =>
          m.buildBatchRegisterAndSubmitTransactionAsync({
            mainBlob: {
              blobId: mainBlob.blobId,
              size: mainBlob.size,
            },
            previewBlob: {
              blobId: previewBlob.blobId,
              size: previewBlob.size,
            },
            submission: {
              sealPolicyId: submission.sealPolicyId,
              durationSeconds: submission.durationSeconds,
              previewBlobHash: submission.previewBlobHash,
            },
          }),
      );

      console.log("[Walrus] Requesting user signature...");
      const result = await signAndExecute({
        transaction: tx,
      });

      console.log("[Walrus] Batch transaction submitted:", result.digest);

      await suiClient.waitForTransaction({
        digest: result.digest,
      });

      return result.digest;
    },
    [currentAccount, suiClient, signAndExecute],
  );

  /**
   * Main upload function using Walrus SDK
   * This properly registers blobs on-chain via user wallet signatures
   * Creates Sui blockchain objects for each blob uploaded
   */
  const uploadBlob = useCallback(
    async (
      encryptedBlob: Blob,
      seal_policy_id: string,
      metadata: WalrusUploadMetadata,
      options: UploadBlobOptions = {},
    ): Promise<WalrusUploadResult> => {
      // Validate file size (1GB max)
      if (encryptedBlob.size > MAX_UPLOAD_SIZE) {
        throw new Error(
          `File size exceeds 1GB limit. Size: ${(encryptedBlob.size / (1024 * 1024 * 1024)).toFixed(2)}GB`,
        );
      }

      setProgress((prev) => ({
        ...prev,
        stage: "uploading",
        totalFiles: prev.totalFiles || 1,
        currentFile: 0,
        fileProgress: 0,
        totalProgress: 0,
      }));

      // 1. Upload with SDK (registers blobs on-chain via wallet signature)
      const publisherResult = await uploadToPublisher(
        encryptedBlob,
        seal_policy_id,
        metadata,
        options,
      );

      console.log(
        "[Walrus] SDK upload complete - blobs registered on Sui blockchain",
        {
          blobId: publisherResult.blobId,
          blobObjectId: publisherResult.blobObjectId,
          previewBlobId: publisherResult.previewBlobId,
          previewBlobObjectId: publisherResult.previewBlobObjectId,
        },
      );

      setProgress((prev) => ({
        ...prev,
        stage: "finalizing",
        fileProgress: 100,
        totalProgress: 100,
      }));

      setProgress((prev) => ({
        ...prev,
        stage: "completed",
      }));

      return {
        blobId: publisherResult.blobId,
        previewBlobId: publisherResult.previewBlobId,
        seal_policy_id,
        strategy: "blockberry",
        mimeType: publisherResult.mimeType,
        previewMimeType: publisherResult.previewMimeType,
        // No txDigest - blockchain submission happens in PublishStep
      };
    },
    [uploadToPublisher],
  );

  /**
   * Upload multiple files in parallel
   */
  const uploadMultipleBlobs = useCallback(
    async (
      files: Array<{
        encryptedBlob: Blob;
        seal_policy_id: string;
        metadata: WalrusUploadMetadata;
        previewBlob?: Blob;
        mimeType?: string;
        previewMimeType?: string;
        fileName?: string;
        previewFileName?: string;
      }>,
    ): Promise<WalrusUploadResult[]> => {
      setProgress({
        totalFiles: files.length,
        completedFiles: 0,
        currentFile: 0,
        fileProgress: 0,
        totalProgress: 0,
        stage: "uploading",
      });

      const results: WalrusUploadResult[] = [];

      // Sequential execution to avoid multiple wallet popups at once
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        setProgress((prev) => ({
          ...prev,
          currentFile: i,
          fileProgress: 0,
        }));

        const result = await uploadBlob(
          file.encryptedBlob,
          file.seal_policy_id,
          file.metadata,
          {
            previewBlob: file.previewBlob,
            previewMimeType:
              file.previewMimeType ??
              normalizeAudioMimeType(file.previewBlob?.type),
            mimeType: file.mimeType,
            fileName: file.fileName,
            previewFileName: file.previewFileName,
          },
        );

        results.push(result);

        setProgress((prev) => ({
          ...prev,
          completedFiles: i + 1,
          totalProgress: ((i + 1) / files.length) * 100,
        }));
      }

      setProgress((prev) => ({
        ...prev,
        stage: "completed",
        totalProgress: 100,
      }));

      return results;
    },
    [uploadBlob],
  );

  return {
    // Upload functions
    uploadBlob,
    uploadMultipleBlobs,

    // Progress tracking
    progress,

    // Utilities
    getUploadStrategy: () => "blockberry" as const,
  };
}
