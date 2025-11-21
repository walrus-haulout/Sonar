/**
 * Tests for useWalrusParallelUpload hook
 * Verifies upload strategy selection, parallel uploads, and error handling
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, mock } from 'bun:test';
import { act, renderHook, waitFor } from '@testing-library/react';

// Mock fetch globally
const mockFetch = mock<(...args: any[]) => Promise<any>>(() =>
  Promise.resolve({
  ok: true,
  json: async () => ({
    blobId: 'test-blob-id',
    certifiedEpoch: 100,
    fileSize: 1024,
    seal_policy_id: 'test-policy-id',
    strategy: 'blockberry',
  }),
  })
);

global.fetch = mockFetch as any;

mock.module('@mysten/dapp-kit', () => ({
  useCurrentAccount: () => ({ address: '0xdeadbeef' }),
  useSuiClient: () => ({}),
}));

let useWalrusParallelUpload: typeof import('../useWalrusParallelUpload').useWalrusParallelUpload;

beforeAll(async () => {
  ({ useWalrusParallelUpload } = await import('../useWalrusParallelUpload'));
});

describe('useWalrusParallelUpload', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SPONSORED_PROTOTYPE_MIN_SIZE;
  });

  describe('Strategy Selection', () => {
    it('should select blockberry strategy for all files', async () => {
      const { result } = renderHook(() => useWalrusParallelUpload());

      const fileSize = 500 * 1024 * 1024; // 500 MB
      const strategy = result.current.getUploadStrategy(fileSize);

      expect(strategy).toBe('blockberry');
    });

    it('should reject files larger than 1GB', async () => {
      const { result } = renderHook(() => useWalrusParallelUpload());

      const encryptedBlob = new Blob(['test data'], { type: 'application/octet-stream' });
      // Mock a blob larger than 1GB
      Object.defineProperty(encryptedBlob, 'size', { value: 1.5 * 1024 * 1024 * 1024 });

      await expect(async () => {
        await act(async () => {
          await result.current.uploadBlob(encryptedBlob, 'test-policy-id', {});
        });
      }).rejects.toThrow('File size exceeds 1GB limit');
    });
  });

  describe('Single File Upload', () => {
    it('should upload a single file via Blockberry', async () => {
      delete process.env.NEXT_PUBLIC_SPONSORED_PROTOTYPE_MIN_SIZE;
      const { result } = renderHook(() => useWalrusParallelUpload());

      const encryptedBlob = new Blob(['test data'], { type: 'application/octet-stream' });
      const seal_policy_id = 'test-policy-id';
      const metadata = { threshold: 2, accessPolicy: 'purchase' };

      let uploadResult: any;
      await act(async () => {
        uploadResult = await result.current.uploadBlob(
          encryptedBlob,
          seal_policy_id,
          metadata
        );
      });

      expect(uploadResult).toBeDefined();
      expect(uploadResult.blobId).toBe('test-blob-id');
      expect(uploadResult.seal_policy_id).toBe('test-policy-id');
      expect(uploadResult.strategy).toBe('blockberry');
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should include preview blob if provided', async () => {
      const { result } = renderHook(() => useWalrusParallelUpload());

      const encryptedBlob = new Blob(['test data'], { type: 'application/octet-stream' });
      const previewBlob = new Blob(['preview data'], { type: 'audio/mp3' });
      const seal_policy_id = 'test-policy-id';
      const metadata = { threshold: 2, accessPolicy: 'purchase' };

      // Mock preview upload
      mockFetch
        .mockImplementationOnce(() =>
          Promise.resolve({
        ok: true,
        json: async () => ({
          blobId: 'test-blob-id',
              certifiedEpoch: 100,
              fileSize: encryptedBlob.size,
          seal_policy_id: 'test-policy-id',
          strategy: 'blockberry',
        }),
          })
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
        ok: true,
        json: async () => ({
          previewBlobId: 'preview-blob-id',
              certifiedEpoch: 100,
              fileSize: previewBlob.size,
              seal_policy_id: 'test-policy-id',
              strategy: 'blockberry',
        }),
          })
        );

      let uploadResult: any;
      await act(async () => {
        uploadResult = await result.current.uploadBlob(
          encryptedBlob,
          seal_policy_id,
          metadata,
          {
            previewBlob,
            previewMimeType: previewBlob.type,
            mimeType: 'audio/mp3',
          }
        );
      });

      expect(uploadResult.previewBlobId).toBe('preview-blob-id');
      expect(mockFetch).toHaveBeenCalledTimes(2); // Main + preview
    });
  });

  describe('Error Handling', () => {
    it('should handle upload failure gracefully', async () => {
      delete process.env.NEXT_PUBLIC_SPONSORED_PROTOTYPE_MIN_SIZE;
      const { result } = renderHook(() => useWalrusParallelUpload());

      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
        ok: false,
        statusText: 'Internal Server Error',
          json: async () => ({}),
        })
      );

      const encryptedBlob = new Blob(['test data']);
      const seal_policy_id = 'test-policy-id';
      const metadata = { threshold: 2, accessPolicy: 'purchase' };

      await act(async () => {
        await expect(
          result.current.uploadBlob(encryptedBlob, seal_policy_id, metadata)
        ).rejects.toThrow('Blockberry upload failed');
      });
    });
  });

  describe('Progress Tracking', () => {
    it('should track upload progress', async () => {
      delete process.env.NEXT_PUBLIC_SPONSORED_PROTOTYPE_MIN_SIZE;
      const { result } = renderHook(() => useWalrusParallelUpload());

      expect(result.current.progress.stage).toBe('encrypting');
      expect(result.current.progress.totalProgress).toBe(0);

      const encryptedBlob = new Blob(['test data']);
      const seal_policy_id = 'test-policy-id';
      const metadata = { threshold: 2, accessPolicy: 'purchase' };

      await act(async () => {
        await result.current.uploadBlob(
          encryptedBlob,
          seal_policy_id,
          metadata
        );
      });

      await waitFor(() => {
        expect(result.current.progress.stage).toBe('completed');
      });

      expect(result.current.progress.totalProgress).toBe(100);
    });
  });

  describe('Orchestrator Integration', () => {
    it('should expose orchestrator for wallet management', () => {
      const { result } = renderHook(() => useWalrusParallelUpload());

      expect(result.current.orchestrator).toBeDefined();
      expect(result.current.orchestrator.calculateWalletCount).toBeDefined();
      expect(result.current.orchestrator.createWallets).toBeDefined();
    });

    it('should calculate optimal wallet count based on file size', () => {
      const { result } = renderHook(() => useWalrusParallelUpload());

      const fileSize1GB = 1 * 1024 * 1024 * 1024;
      const walletCount = result.current.orchestrator.calculateWalletCount(fileSize1GB);

      expect(walletCount).toBeGreaterThan(0);
      expect(walletCount).toBeLessThanOrEqual(100); // Capped at 100
    });

    it('should execute sponsored prototype flow when threshold lowered', async () => {
      process.env.NEXT_PUBLIC_SPONSORED_PROTOTYPE_MIN_SIZE = '0';

      const { result } = renderHook(() => useWalrusParallelUpload());

      const encryptedBlob = new Blob(['prototype data'], { type: 'application/octet-stream' });
      const seal_policy_id = 'prototype-policy-id';
      const metadata = { threshold: 2, accessPolicy: 'purchase' };

      let uploadResult: any;
      await act(async () => {
        uploadResult = await result.current.uploadBlob(
          encryptedBlob,
          seal_policy_id,
          metadata
        );
      });

      expect(uploadResult.strategy).toBe('sponsored-parallel');
      expect(uploadResult.prototypeMetadata).toBeDefined();
      expect(uploadResult.prototypeMetadata?.chunkCount).toBeGreaterThan(0);
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
