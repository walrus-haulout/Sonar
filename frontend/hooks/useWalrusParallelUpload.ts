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
import { useSubWalletOrchestrator, getUploadStrategy } from './useSubWalletOrchestrator';

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
  backupKey: Uint8Array;
  strategy: 'blockberry' | 'sponsored-parallel';
}

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
    backupKey: Uint8Array,
    metadata: any
  ): Promise<{ blobId: string; previewBlobId?: string }> => {
    // Call existing Blockberry upload endpoint
    const formData = new FormData();
    formData.append('file', encryptedBlob);
    formData.append('seal_policy_id', seal_policy_id);
    formData.append('backupKey', Array.from(backupKey).join(','));
    formData.append('metadata', JSON.stringify(metadata));

    const response = await fetch('/api/edge/walrus/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Blockberry upload failed: ${response.statusText}`);
    }

    const result = await response.json();
    return {
      blobId: result.blobId,
      previewBlobId: result.previewBlobId,
    };
  }, []);

  /**
   * Upload encrypted blob to Walrus (auto-selects strategy)
   */
  const uploadBlob = useCallback(async (
    encryptedBlob: Blob,
    seal_policy_id: string,
    backupKey: Uint8Array,
    metadata: any,
    previewBlob?: Blob
  ): Promise<WalrusUploadResult> => {
    const strategy = getUploadStrategy(encryptedBlob.size);

    setProgress(prev => ({
      ...prev,
      stage: 'uploading',
      fileProgress: 0,
    }));

    if (strategy === 'blockberry') {
      // Use Blockberry HTTP API (current working approach)
      const { blobId, previewBlobId } = await uploadViaBlockberry(
        encryptedBlob,
        seal_policy_id,
        backupKey,
        metadata
      );

      return {
        blobId,
        previewBlobId,
        seal_policy_id,
        backupKey,
        strategy: 'blockberry',
      };
    } else {
      // Sponsored parallel upload (future implementation)
      // This would use the sub-wallet orchestrator for parallel chunks
      throw new Error(
        'Sponsored parallel uploads not yet implemented. ' +
        'Files ≥1GB require server-side transaction orchestration. ' +
        'Please use Blockberry API or wait for SDK support.'
      );
    }
  }, [uploadViaBlockberry]);

  /**
   * Upload multiple files in parallel
   */
  const uploadMultipleBlobs = useCallback(async (
    files: Array<{
      encryptedBlob: Blob;
      seal_policy_id: string;
      backupKey: Uint8Array;
      metadata: any;
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

      setProgress(prev => ({
        ...prev,
        currentFile: i,
        fileProgress: 0,
      }));

      const result = await uploadBlob(
        file.encryptedBlob,
        file.seal_policy_id,
        file.backupKey,
        file.metadata,
        file.previewBlob
      );

      results.push(result);

      setProgress(prev => ({
        ...prev,
        completedFiles: i + 1,
        totalProgress: ((i + 1) / files.length) * 100,
      }));
    }

    setProgress(prev => ({
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
