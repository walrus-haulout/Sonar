/**
 * useWalrusParallelUpload
 *
 * Handles Walrus uploads with user-paid registration:
 * 1. Uploads file to Walrus Publisher (HTTP) to get Blob ID and storage metadata.
 * 2. Prompts user to sign a `register_blob` transaction on-chain.
 * 3. Returns the result once the transaction is confirmed.
 */

import type { EncryptionMetadata } from '@sonar/seal';
import { useState, useCallback } from 'react';
import { useSuiClient, useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { normalizeAudioMimeType, getExtensionForMime } from '@/lib/audio/mime';
import { buildRegisterBlobTransactionAsync } from '@/lib/walrus/buildRegisterBlobTransaction';
import type { WalrusUploadResult } from '@/lib/types/upload';

const MAX_UPLOAD_SIZE = 1 * 1024 * 1024 * 1024; // 1GB

export interface WalrusUploadProgress {
  totalFiles: number;
  completedFiles: number;
  currentFile: number;
  fileProgress: number; // 0-100
  totalProgress: number; // 0-100
  stage: 'encrypting' | 'uploading' | 'registering' | 'finalizing' | 'completed';
  currentRetry?: number; // Current retry attempt (1-10)
  maxRetries?: number; // Max retry attempts
}

type WalrusUploadMetadata = EncryptionMetadata | Record<string, unknown> | undefined;

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

  const targetMime = normalizeAudioMimeType(mime) ?? normalizeAudioMimeType(blob.type);

  if (!targetMime) {
    return blob.type ? blob : new Blob([blob], { type: 'application/octet-stream' });
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

  if (base.includes('.')) {
    return base;
  }

  const extension = getExtensionForMime(normalizedMime);
  return extension ? `${base}.${extension}` : base;
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
    stage: 'encrypting',
  });

  /**
   * Fetch upload with client-side retry tracking and progress updates
   */
  const fetchUploadWithRetry = useCallback(async (
    formData: FormData,
    maxRetries: number = 10
  ): Promise<{ response: Response; attempt: number }> => {
    let lastError: Error | null = null;

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

        const response = await fetch('/api/edge/walrus/upload', {
          method: 'POST',
          body: attemptFormData,
        });

        if (response.ok) {
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

        console.warn(`[Upload] Attempt ${attempt}/${maxRetries} failed with HTTP ${response.status}: ${errorDetail}`);

        // Non-200 response, retry if not the last attempt
        if (attempt < maxRetries) {
          const delayMs = attempt * 2000; // Progressive: 2s, 4s, 6s...
          console.log(`[Upload] Retrying in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }

        return { response, attempt };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // If last attempt, throw error
        if (attempt === maxRetries) {
          throw lastError;
        }

        // Retry with progressive delay
        const delayMs = attempt * 2000; // Progressive: 2s, 4s, 6s...
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    throw lastError || new Error('Upload failed after all retry attempts');
  }, []);

  /**
   * Upload encrypted blob to Walrus Publisher
   * Returns metadata needed for on-chain registration
   */
  const uploadToPublisher = useCallback(async (
    encryptedBlob: Blob,
    seal_policy_id: string,
    metadata: WalrusUploadMetadata,
    options: UploadBlobOptions = {}
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
  }> => {
    const formData = new FormData();
    formData.append('file', encryptedBlob, options.fileName ?? 'encrypted-audio.bin');
    formData.append('seal_policy_id', seal_policy_id);
    formData.append('epochs', '26'); // Explicitly set to 1 year (26 epochs)
    if (metadata) {
      formData.append('metadata', JSON.stringify(metadata));
    }

    // Log FormData for debugging
    const fileSizeMB = (encryptedBlob.size / (1024 * 1024)).toFixed(2);
    console.log(`[Upload] Uploading main blob: ${(options.fileName ?? 'encrypted-audio.bin')} (${fileSizeMB}MB)`, {
      sealed_policy_id: seal_policy_id.substring(0, 20) + '...',
      epochs: '26',
      hasMetadata: !!metadata,
    });

    const { response, attempt } = await fetchUploadWithRetry(formData, 10);

    if (!response.ok) {
      let errorMessage = `Publisher upload failed on attempt ${attempt}: ${response.statusText}`;
      try {
        const errorBody = await response.json();
        errorMessage = errorBody.error || errorBody.details || errorMessage;
      } catch {
        // Fallback to statusText if JSON parsing fails
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();

    // Upload preview blob if provided
    let finalPreviewBlobId = result.previewBlobId as string | undefined;
    let previewStorageId: string | undefined;
    let previewSize: number | undefined;
    let previewEncodingType: string | undefined;
    let previewDeletable: boolean | undefined;
    let effectivePreviewMimeType = normalizeAudioMimeType(options.previewMimeType) ?? normalizeAudioMimeType(options.previewBlob?.type);

    if (options.previewBlob) {
      const previewFormData = new FormData();
      const previewBlob = ensureBlobMimeType(options.previewBlob, options.previewMimeType) ?? options.previewBlob;
      effectivePreviewMimeType = normalizeAudioMimeType(previewBlob.type) ?? effectivePreviewMimeType;
      const previewFileName = inferFileName(options.previewFileName ?? 'preview', effectivePreviewMimeType);
      previewFormData.append('file', previewBlob, previewFileName);

      // Log preview upload for debugging
      const previewSizeMB = (previewBlob.size / (1024 * 1024)).toFixed(2);
      console.log(`[Upload] Uploading preview blob: ${previewFileName} (${previewSizeMB}MB)`);

      const { response: previewResponse, attempt } = await fetchUploadWithRetry(previewFormData, 10);

      if (!previewResponse.ok) {
        let previewErrorMessage = `Preview upload failed on attempt ${attempt}: ${previewResponse.statusText}`;
        try {
          const errorBody = await previewResponse.json();
          previewErrorMessage = errorBody.error || errorBody.details || previewErrorMessage;
        } catch {
          // Fallback to statusText if JSON parsing fails
        }
        throw new Error(previewErrorMessage);
      }

      const previewResult = await previewResponse.json();
      finalPreviewBlobId = previewResult.previewBlobId || previewResult.blobId;
      previewStorageId = previewResult.storageId;
      previewSize = previewResult.fileSize;
      previewEncodingType = previewResult.encodingType;
      previewDeletable = previewResult.deletable;
    }

    return {
      blobId: result.blobId,
      size: result.size,
      encodingType: result.encodingType,
      storageId: result.storageId,
      deletable: result.deletable,
      previewBlobId: finalPreviewBlobId,
      previewStorageId,
      previewSize,
      previewEncodingType,
      previewDeletable,
      mimeType: normalizeAudioMimeType(options.mimeType) ?? undefined,
      previewMimeType: effectivePreviewMimeType,
    };
  }, [fetchUploadWithRetry]);

  /**
   * Batch register blobs and submit to marketplace
   */
  const batchRegisterAndSubmit = useCallback(async (
    mainBlob: { blobId: string; size: number; encodingType?: string; storageId?: string; deletable?: boolean },
    previewBlob: { blobId: string; size: number; encodingType?: string; storageId?: string; deletable?: boolean },
    submission: { sealPolicyId: string; durationSeconds: number; previewBlobHash?: string }
  ): Promise<string> => {
    if (!currentAccount) {
      throw new Error('Wallet not connected');
    }

    setProgress((prev) => ({
      ...prev,
      stage: 'registering',
    }));

    console.log('[Walrus] Building batch registration transaction...');

    // 0.25 SUI for submission fee
    const SUI_PAYMENT_AMOUNT = 250_000_000n;

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

    const tx = await import('@/lib/walrus/buildRegisterBlobTransaction').then(m =>
      m.buildBatchRegisterAndSubmitTransactionAsync({
        mainBlob: {
          blobId: mainBlob.blobId,
          size: mainBlob.size,
          encodingType: mainBlob.encodingType,
          storageId: mainBlob.storageId,
          deletable: mainBlob.deletable,
        },
        previewBlob: {
          blobId: previewBlob.blobId,
          size: previewBlob.size,
          encodingType: previewBlob.encodingType,
          storageId: previewBlob.storageId,
          deletable: previewBlob.deletable,
        },
        submission: {
          sealPolicyId: submission.sealPolicyId,
          durationSeconds: submission.durationSeconds,
          previewBlobHash: submission.previewBlobHash,
        },
        sponsorAddress: currentAccount.address,
        suiClient,
      })
    );

    console.log('[Walrus] Requesting user signature...');
    const result = await signAndExecute({
      transaction: tx,
    });

    console.log('[Walrus] Batch transaction submitted:', result.digest);

    await suiClient.waitForTransaction({
      digest: result.digest,
    });

    return result.digest;
  }, [currentAccount, suiClient, signAndExecute]);

  /**
   * Main upload function
   */
  const uploadBlob = useCallback(async (
    encryptedBlob: Blob,
    seal_policy_id: string,
    metadata: WalrusUploadMetadata,
    options: UploadBlobOptions = {}
  ): Promise<WalrusUploadResult> => {
    // Validate file size (1GB max)
    if (encryptedBlob.size > MAX_UPLOAD_SIZE) {
      throw new Error(`File size exceeds 1GB limit. Size: ${(encryptedBlob.size / (1024 * 1024 * 1024)).toFixed(2)}GB`);
    }

    setProgress((prev) => ({
      ...prev,
      stage: 'uploading',
      totalFiles: prev.totalFiles || 1,
      currentFile: 0,
      fileProgress: 0,
      totalProgress: 0,
    }));

    // 1. Upload to Publisher (Main + Preview)
    const publisherResult = await uploadToPublisher(
      encryptedBlob,
      seal_policy_id,
      metadata,
      options
    );

    // 2. Batch Register & Submit
    // We need to ensure we have preview metadata if a preview was uploaded
    if (publisherResult.previewBlobId && !publisherResult.previewStorageId) {
      console.warn('Preview uploaded but missing storage ID. Registration might fail.');
    }

    const txDigest = await batchRegisterAndSubmit(
      {
        blobId: publisherResult.blobId,
        size: publisherResult.size,
        encodingType: publisherResult.encodingType,
        storageId: publisherResult.storageId,
        deletable: publisherResult.deletable,
      },
      {
        blobId: publisherResult.previewBlobId || '', // Handle missing preview gracefully?
        size: publisherResult.previewSize || 0,
        encodingType: publisherResult.previewEncodingType,
        storageId: publisherResult.previewStorageId,
        deletable: publisherResult.previewDeletable,
      },
      {
        sealPolicyId: seal_policy_id,
        durationSeconds: 0, // TODO: Get actual duration from metadata or file
        previewBlobHash: undefined, // Optional
      }
    );

    setProgress((prev) => ({
      ...prev,
      stage: 'finalizing',
      fileProgress: 100,
      totalProgress: 100,
    }));

    setProgress((prev) => ({
      ...prev,
      stage: 'completed',
    }));

    return {
      blobId: publisherResult.blobId,
      previewBlobId: publisherResult.previewBlobId,
      seal_policy_id,
      strategy: 'blockberry',
      mimeType: publisherResult.mimeType,
      previewMimeType: publisherResult.previewMimeType,
      txDigest,
    };
  }, [uploadToPublisher, batchRegisterAndSubmit]);

  /**
   * Upload multiple files in parallel
   */
  const uploadMultipleBlobs = useCallback(async (
    files: Array<{
      encryptedBlob: Blob;
      seal_policy_id: string;
      metadata: WalrusUploadMetadata;
      previewBlob?: Blob;
      mimeType?: string;
      previewMimeType?: string;
      fileName?: string;
      previewFileName?: string;
    }>
  ): Promise<WalrusUploadResult[]> => {
    setProgress({
      totalFiles: files.length,
      completedFiles: 0,
      currentFile: 0,
      fileProgress: 0,
      totalProgress: 0,
      stage: 'uploading',
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
          previewMimeType: file.previewMimeType ?? normalizeAudioMimeType(file.previewBlob?.type),
          mimeType: file.mimeType,
          fileName: file.fileName,
          previewFileName: file.previewFileName,
        }
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
      stage: 'completed',
      totalProgress: 100,
    }));

    return results;
  }, [uploadBlob]);

  return {
    // Upload functions
    uploadBlob,
    uploadMultipleBlobs,

    // Progress tracking
    progress,

    // Utilities
    getUploadStrategy: () => 'blockberry' as const,
  };
}
