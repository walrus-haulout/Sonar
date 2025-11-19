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
import { useChunkedWalrusUpload } from './useChunkedWalrusUpload';
import { useSubWalletOrchestrator } from './useSubWalletOrchestrator'; // Kept for type compatibility if needed, but unused for logic

const CHUNKED_UPLOAD_THRESHOLD = 100 * 1024 * 1024; // 100MB

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

export interface WalrusUploadResult {
  blobId: string;
  previewBlobId?: string;
  seal_policy_id: string;
  strategy: 'user-paid';
  mimeType?: string;
  previewMimeType?: string;
  txDigest?: string;
  // Kept for compatibility with existing types if strictly checked, though we only use user-paid now
  prototypeMetadata?: {
    walletCount: number;
    chunkCount: number;
    estimatedChunkSize: number;
  };
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
  const chunkedUpload = useChunkedWalrusUpload();
  // We keep orchestrator just to satisfy any external dependencies if they exist, 
  // but we won't use it for the main flow.
  const orchestrator = useSubWalletOrchestrator();

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

        // Non-200 response, retry if not the last attempt
        if (attempt < maxRetries) {
          const delayMs = attempt * 2000; // Progressive: 2s, 4s, 6s...
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
    mimeType?: string;
    previewMimeType?: string;
  }> => {
    const formData = new FormData();
    formData.append('file', encryptedBlob, options.fileName ?? 'encrypted-audio.bin');
    formData.append('seal_policy_id', seal_policy_id);
    if (metadata) {
      formData.append('metadata', JSON.stringify(metadata));
    }

    const { response, attempt } = await fetchUploadWithRetry(formData, 10);

    if (!response.ok) {
      throw new Error(`Publisher upload failed on attempt ${attempt}: ${response.statusText}`);
    }

    const result = await response.json();

    // Upload preview blob if provided
    let finalPreviewBlobId = result.previewBlobId as string | undefined;
    let effectivePreviewMimeType = normalizeAudioMimeType(options.previewMimeType) ?? normalizeAudioMimeType(options.previewBlob?.type);

    if (options.previewBlob) {
      try {
        const previewFormData = new FormData();
        const previewBlob = ensureBlobMimeType(options.previewBlob, options.previewMimeType) ?? options.previewBlob;
        effectivePreviewMimeType = normalizeAudioMimeType(previewBlob.type) ?? effectivePreviewMimeType;
        const previewFileName = inferFileName(options.previewFileName ?? 'preview', effectivePreviewMimeType);
        previewFormData.append('file', previewBlob, previewFileName);

        const previewResponse = await fetch('/api/edge/walrus/preview', {
          method: 'POST',
          body: previewFormData,
        });

        if (previewResponse.ok) {
          const previewResult = await previewResponse.json();
          finalPreviewBlobId = previewResult.previewBlobId || previewResult.blobId;
        } else {
          console.warn('Preview upload failed, continuing without preview');
        }
      } catch (error) {
        console.warn('Preview upload error:', error);
      }
    }

    return {
      blobId: result.blobId,
      size: result.size,
      encodingType: result.encodingType,
      storageId: result.storageId,
      deletable: result.deletable,
      previewBlobId: finalPreviewBlobId,
      mimeType: normalizeAudioMimeType(options.mimeType) ?? undefined,
      previewMimeType: effectivePreviewMimeType,
    };
  }, [fetchUploadWithRetry]);

  /**
   * Register blob on-chain
   */
  const registerBlobOnChain = useCallback(async (
    blobId: string,
    size: number,
    encodingType?: string,
    storageId?: string,
    deletable: boolean = true
  ): Promise<string> => {
    if (!currentAccount) {
      throw new Error('Wallet not connected');
    }

    setProgress((prev) => ({
      ...prev,
      stage: 'registering',
    }));

    console.log('[Walrus] Building registration transaction...');
    const tx = await buildRegisterBlobTransactionAsync({
      blobId,
      size,
      encodingType,
      storageId,
      deletable,
      sponsorAddress: currentAccount.address,
      suiClient,
    });

    console.log('[Walrus] Requesting user signature...');
    const result = await signAndExecute({
      transaction: tx,
    });

    console.log('[Walrus] Registration transaction submitted:', result.digest);

    // Wait for transaction confirmation
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
    // Route large files (≥100MB) to dedicated chunked upload service
    if (encryptedBlob.size >= CHUNKED_UPLOAD_THRESHOLD) {
      try {
        const chunkedResult = await chunkedUpload.uploadBlob(
          encryptedBlob,
          seal_policy_id,
          metadata
        );
        return {
          blobId: chunkedResult.blobIds[0],
          seal_policy_id,
          strategy: 'user-paid',
        };
      } catch (error) {
        console.warn('Chunked upload failed, falling back to standard:', error);
      }
    }

    setProgress((prev) => ({
      ...prev,
      stage: 'uploading',
      totalFiles: prev.totalFiles || 1,
      currentFile: 0,
      fileProgress: 0,
      totalProgress: 0,
    }));

    // 1. Upload to Publisher
    const publisherResult = await uploadToPublisher(
      encryptedBlob,
      seal_policy_id,
      metadata,
      options
    );

    // 2. Register on-chain
    const txDigest = await registerBlobOnChain(
      publisherResult.blobId,
      publisherResult.size,
      publisherResult.encodingType,
      publisherResult.storageId,
      publisherResult.deletable
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
      strategy: 'user-paid',
      mimeType: publisherResult.mimeType,
      previewMimeType: publisherResult.previewMimeType,
      txDigest,
    };
  }, [uploadToPublisher, registerBlobOnChain, chunkedUpload]);

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

    // Orchestrator access (kept for compatibility)
    orchestrator,

    // Utilities (mocked for compatibility)
    getUploadStrategy: () => 'user-paid' as const,
  };
}
