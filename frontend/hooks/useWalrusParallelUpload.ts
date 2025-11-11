/**
 * useWalrusParallelUpload
 *
 * Handles parallel Walrus uploads with two strategies:
 * 1. Blockberry HTTP API (for files < 1GB) - WORKING
 * 2. Sponsored sub-wallet transactions (for files ≥ 1GB) - PLANNED
 *
 * The sponsored transaction approach is blocked by Sui SDK limitations
 * for client-side sponsored transactions. See useSubWalletOrchestrator.ts
 * for detailed architecture notes.
 */

import { useState, useCallback } from 'react';
import type { EncryptionMetadata } from '@sonar/seal';
import { useSubWalletOrchestrator, getUploadStrategy, distributeFileAcrossWallets } from './useSubWalletOrchestrator';

export interface WalrusUploadProgress {
  totalFiles: number;
  completedFiles: number;
  currentFile: number;
  fileProgress: number; // 0-100
  totalProgress: number; // 0-100
  stage: 'encrypting' | 'uploading' | 'finalizing' | 'completed';
}

export interface WalrusUploadResult {
  blobId: string;
  previewBlobId?: string;
  seal_policy_id: string;
  strategy: 'blockberry' | 'sponsored-parallel';
  prototypeMetadata?: {
    walletCount: number;
    chunkCount: number;
    estimatedChunkSize: number;
  };
}

type WalrusUploadMetadata = EncryptionMetadata | Record<string, unknown> | undefined;

export function useWalrusParallelUpload() {
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
   * Upload encrypted blob to Walrus using Blockberry HTTP API
   */
  const uploadViaBlockberry = useCallback(async (
    encryptedBlob: Blob,
    seal_policy_id: string,
    metadata: WalrusUploadMetadata,
    previewBlob?: Blob
  ): Promise<{ blobId: string; previewBlobId?: string }> => {
    // Call existing Blockberry upload endpoint
    const formData = new FormData();
    formData.append('file', encryptedBlob);
    formData.append('seal_policy_id', seal_policy_id);
    if (metadata) {
      formData.append('metadata', JSON.stringify(metadata));
    }

    const response = await fetch('/api/edge/walrus/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Blockberry upload failed: ${response.statusText}`);
    }

    const result = await response.json();

    // Upload preview blob if provided and not already handled by API
    let finalPreviewBlobId = result.previewBlobId as string | undefined;
    if (previewBlob) {
      try {
        const previewFormData = new FormData();
        previewFormData.append('file', previewBlob, 'preview.mp3');

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
    };
  }, []);

  /**
   * Sponsored parallel upload prototype
   * Simulates chunk orchestration with ephemeral wallets, then falls back to Blockberry upload.
   */
  const uploadViaSponsoredPrototype = useCallback(async (
    encryptedBlob: Blob,
    seal_policy_id: string,
    metadata: WalrusUploadMetadata,
    previewBlob?: Blob
  ): Promise<WalrusUploadResult> => {
    const minWallets = 1;

    if (!orchestrator.isReady) {
      throw new Error('Sponsored uploads require a connected wallet session for orchestration.');
    }

    const totalSize = encryptedBlob.size;
    const walletCount = Math.max(minWallets, orchestrator.calculateWalletCount(totalSize));
    const wallets = orchestrator.createWallets(walletCount);
    const chunkPlan = distributeFileAcrossWallets(totalSize, walletCount);

    console.log('[WalrusSponsoredPrototype] Created wallets for upload', {
      walletCount: wallets.length,
      totalSize,
      chunkPlan,
    });

    // Simulate per-chunk processing to surface progress updates
    let processedBytes = 0;
    for (let i = 0; i < chunkPlan.length; i++) {
      const chunk = chunkPlan[i];

      // Yield to the event loop to allow UI updates between chunks
      await new Promise((resolve) => setTimeout(resolve, 0));

      processedBytes += chunk.size;
      const percent = totalSize === 0 ? 0 : Math.min(90, Math.round((processedBytes / totalSize) * 90));

      setProgress((prev) => ({
        ...prev,
        stage: 'uploading',
        currentFile: 0,
        fileProgress: percent,
        totalProgress: percent,
        totalFiles: 1,
      }));
    }

    try {
      const blockberryResult = await uploadViaBlockberry(
        encryptedBlob,
        seal_policy_id,
        metadata,
        previewBlob
      );

      return {
        ...blockberryResult,
        seal_policy_id,
        strategy: 'sponsored-parallel',
        prototypeMetadata: {
          walletCount,
          chunkCount: chunkPlan.length,
          estimatedChunkSize: chunkPlan.length > 0 ? Math.ceil(totalSize / chunkPlan.length) : totalSize,
        },
      };
    } finally {
      orchestrator.discardAllWallets();
    }
  }, [orchestrator, uploadViaBlockberry]);

  /**
   * Upload encrypted blob to Walrus (auto-selects strategy)
   */
  const uploadBlob = useCallback(async (
    encryptedBlob: Blob,
    seal_policy_id: string,
    metadata: WalrusUploadMetadata,
    previewBlob?: Blob
  ): Promise<WalrusUploadResult> => {
    const rawStrategy = getUploadStrategy(encryptedBlob.size);

    // Allow prototype to be exercised for smaller inputs by lowering threshold via env var
    const prototypeMinSize = Number(process.env.NEXT_PUBLIC_SPONSORED_PROTOTYPE_MIN_SIZE ?? NaN);
    const prototypeEnabled = Number.isFinite(prototypeMinSize);
    const strategy =
      prototypeEnabled && encryptedBlob.size >= 0 && encryptedBlob.size >= prototypeMinSize
        ? 'sponsored-parallel'
        : rawStrategy;

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
        previewBlob
      );

      result = {
        ...blockberryResult,
        seal_policy_id,
        strategy: 'blockberry',
      };
    } else {
      result = await uploadViaSponsoredPrototype(
        encryptedBlob,
        seal_policy_id,
        metadata,
        previewBlob
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
        file.previewBlob
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
