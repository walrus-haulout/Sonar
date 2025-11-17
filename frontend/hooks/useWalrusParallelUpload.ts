/**
 * useWalrusParallelUpload
 *
 * Handles Walrus uploads with two strategies:
 * 1. Blockberry HTTP API (for files < 1GB)
 * 2. Sponsored transactions (for files ≥ 1GB) - Edge route upload + on-chain registration
 *
 * Both strategies use the edge route for blob upload (with 10-retry logic).
 * Sponsored strategy adds on-chain ownership registration via dual-signature transactions.
 */

import type { EncryptionMetadata } from '@sonar/seal';
import { useState, useCallback } from 'react';
import { normalizeAudioMimeType, getExtensionForMime } from '@/lib/audio/mime';
import { useSubWalletOrchestrator, getUploadStrategy, distributeFileAcrossWallets } from './useSubWalletOrchestrator';
import { useBrowserWalletSponsorship } from './useBrowserWalletSponsorship';
import { buildSponsoredRegisterBlob } from '@/lib/walrus/uploadWithSponsorship';

export interface WalrusUploadProgress {
  totalFiles: number;
  completedFiles: number;
  currentFile: number;
  fileProgress: number; // 0-100
  totalProgress: number; // 0-100
  stage: 'encrypting' | 'uploading' | 'finalizing' | 'completed';
  currentRetry?: number; // Current retry attempt (1-10)
  maxRetries?: number; // Max retry attempts
}

export interface WalrusUploadResult {
  blobId: string;
  previewBlobId?: string;
  seal_policy_id: string;
  strategy: 'blockberry' | 'sponsored-parallel';
  mimeType?: string;
  previewMimeType?: string;
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
  const orchestrator = useSubWalletOrchestrator();
  const { sponsorTransactions } = useBrowserWalletSponsorship();

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
   * Upload encrypted blob to Walrus using Blockberry HTTP API
   */
  const uploadViaBlockberry = useCallback(async (
    encryptedBlob: Blob,
    seal_policy_id: string,
    metadata: WalrusUploadMetadata,
    options: UploadBlobOptions = {}
  ): Promise<{ blobId: string; previewBlobId?: string; mimeType?: string; previewMimeType?: string }> => {
    // Call existing Blockberry upload endpoint with retries
    const formData = new FormData();
    formData.append('file', encryptedBlob, options.fileName ?? 'encrypted-audio.bin');
    formData.append('seal_policy_id', seal_policy_id);
    if (metadata) {
      formData.append('metadata', JSON.stringify(metadata));
    }

    const { response, attempt } = await fetchUploadWithRetry(formData, 10);

    if (!response.ok) {
      throw new Error(`Blockberry upload failed on attempt ${attempt}: ${response.statusText}`);
    }

    const result = await response.json();

    // Upload preview blob if provided and not already handled by API
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
      previewBlobId: finalPreviewBlobId,
      mimeType: normalizeAudioMimeType(options.mimeType) ?? undefined,
      previewMimeType: effectivePreviewMimeType,
    };
  }, [fetchUploadWithRetry]);

  /**
   * Sponsored upload with on-chain registration
   * Uses edge route (with retries) for encoding/storage, then registers ownership via sponsored transaction
   */
  const uploadViaSponsoredPrototype = useCallback(async (
    encryptedBlob: Blob,
    seal_policy_id: string,
    metadata: WalrusUploadMetadata,
    options: UploadBlobOptions = {}
  ): Promise<WalrusUploadResult> => {
    if (!orchestrator.isReady) {
      throw new Error('Sponsored uploads require a connected wallet session for orchestration.');
    }

    const totalSize = encryptedBlob.size;
    const walletCount = 1; // Single wallet for ownership registration
    const wallets = orchestrator.createWallets(walletCount);

    console.log('[WalrusSponsored] Uploading blob via edge route with retries', {
      size: totalSize,
      walletAddress: wallets[0].address,
    });

    try {
      // Step 1: Upload blob via edge route (has 10-retry logic)
      const uploadResult = await uploadViaBlockberry(
        encryptedBlob,
        seal_policy_id,
        metadata,
        options
      );

      console.log('[WalrusSponsored] Blob uploaded with retries, blobId:', uploadResult.blobId);

      setProgress((prev) => ({
        ...prev,
        fileProgress: 50,
        totalProgress: 50,
      }));

      // Step 2: Register on-chain ownership via sponsored transaction
      console.log('[WalrusSponsored] Registering on-chain ownership with sponsorship');

      await sponsorTransactions(
        (subWallet) => Promise.resolve(buildSponsoredRegisterBlob(
          subWallet,
          uploadResult.blobId,
          totalSize,
          26
        )),
        wallets
      );

      console.log('[WalrusSponsored] On-chain registration complete');

      setProgress((prev) => ({
        ...prev,
        stage: 'finalizing',
        fileProgress: 90,
        totalProgress: 90,
      }));

      setProgress((prev) => ({
        ...prev,
        stage: 'completed',
        fileProgress: 100,
        totalProgress: 100,
        completedFiles: 1,
      }));

      return {
        blobId: uploadResult.blobId,
        previewBlobId: uploadResult.previewBlobId,
        seal_policy_id,
        strategy: 'sponsored-parallel',
        mimeType: uploadResult.mimeType,
        previewMimeType: uploadResult.previewMimeType,
        prototypeMetadata: {
          walletCount,
          chunkCount: 1,
          estimatedChunkSize: totalSize,
        },
      };
    } finally {
      orchestrator.discardAllWallets();
    }
  }, [orchestrator, sponsorTransactions, uploadViaBlockberry, setProgress]);

  /**
   * Upload encrypted blob to Walrus (auto-selects strategy)
   */
  const uploadBlob = useCallback(async (
    encryptedBlob: Blob,
    seal_policy_id: string,
    metadata: WalrusUploadMetadata,
    options: UploadBlobOptions = {}
  ): Promise<WalrusUploadResult> => {
    const strategy = getUploadStrategy(encryptedBlob.size);

    setProgress((prev) => ({
      ...prev,
      stage: 'uploading',
      totalFiles: prev.totalFiles || 1,
      currentFile: 0,
      fileProgress: 0,
      totalProgress: 0,
    }));

    let result: WalrusUploadResult;

    if (strategy === 'blockberry') {
      const blockberryResult = await uploadViaBlockberry(
        encryptedBlob,
        seal_policy_id,
        metadata,
        options
      );

      result = {
        ...blockberryResult,
        seal_policy_id,
        strategy: 'blockberry',
        mimeType: blockberryResult.mimeType ?? normalizeAudioMimeType(options.mimeType) ?? undefined,
        previewMimeType: blockberryResult.previewMimeType ?? normalizeAudioMimeType(options.previewMimeType),
      };
    } else {
      result = await uploadViaSponsoredPrototype(
        encryptedBlob,
        seal_policy_id,
        metadata,
        options
      );
    }

    setProgress((prev) => ({
      ...prev,
      stage: 'finalizing',
      fileProgress: Math.max(prev.fileProgress, 95),
      totalProgress: Math.max(prev.totalProgress, 95),
    }));

    setProgress((prev) => ({
      ...prev,
      stage: 'completed',
      fileProgress: 100,
      totalProgress: 100,
    }));

    return result;
  }, [uploadViaBlockberry, uploadViaSponsoredPrototype]);

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

    // Upload files sequentially for now (parallel coming with sponsor support)
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

    // Orchestrator access
    orchestrator,

    // Utilities
    getUploadStrategy,
  };
}
