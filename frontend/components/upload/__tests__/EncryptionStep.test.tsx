/**
 * Tests for EncryptionStep component
 * Verifies integration with parallel upload flow, orchestrator, and error handling
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { render, screen, waitFor } from '@testing-library/react';
import { EncryptionStep } from '../EncryptionStep';
import type { AudioFile } from '@/lib/types/upload';

// Mock hooks
const mockEncrypt = mock(() => Promise.resolve({
  encryptedData: new ArrayBuffer(1024),
  identity: 'test-seal-policy-id',
  metadata: {
    threshold: 2,
    accessPolicy: 'purchase',
    demType: 'browser',
    timestamp: Date.now(),
    originalSize: 1024,
    encryptedSize: 1024,
    isEnvelope: false,
  },
}));

const mockUploadBlob = mock(() => Promise.resolve({
  blobId: 'test-blob-id',
  previewBlobId: 'preview-blob-id',
  seal_policy_id: 'test-seal-policy-id',
  strategy: 'blockberry' as const,
  mimeType: 'audio/mp3',
  previewMimeType: 'audio/mp3',
}));

// Mock the hooks
mock.module('@/hooks/useSeal', () => ({
  useSealEncryption: () => ({
    isReady: true,
    encrypt: mockEncrypt,
    error: null,
  }),
}));

mock.module('@/hooks/useWalrusParallelUpload', () => ({
  useWalrusParallelUpload: () => ({
    uploadBlob: mockUploadBlob,
    progress: {
      totalFiles: 0,
      completedFiles: 0,
      currentFile: 0,
      fileProgress: 0,
      totalProgress: 0,
      stage: 'encrypting' as const,
    },
    orchestrator: {
      isReady: true,
      wallets: [],
      walletCount: 0,
      calculateWalletCount: (size: number) => 4,
      createWallets: (count: number) => [],
      discardAllWallets: () => {},
    },
    getUploadStrategy: (size: number) => 'blockberry' as const,
  }),
}));

describe('EncryptionStep', () => {
  const mockAudioFile: AudioFile = {
    file: new File(['test'], 'test.mp3', { type: 'audio/mp3' }),
    duration: 180,
    id: 'test-file-id',
    mimeType: 'audio/mp3',
  };

  const mockOnEncrypted = mock(() => {});
  const mockOnError = mock(() => {});

  beforeEach(() => {
    mockEncrypt.mockClear();
    mockUploadBlob.mockClear();
    mockOnEncrypted.mockClear();
    mockOnError.mockClear();
  });

  describe('Single File Upload', () => {
    it('should render progress circle and stages', async () => {
      render(
        <EncryptionStep
          audioFile={mockAudioFile}
          onEncrypted={mockOnEncrypted}
          onError={mockOnError}
        />
      );

      // Should show progress UI
      expect(screen.getByText(/Encrypting with Mysten Seal/i)).toBeDefined();
    });

    it('should complete encryption and upload flow', async () => {
      render(
        <EncryptionStep
          audioFile={mockAudioFile}
          onEncrypted={mockOnEncrypted}
          onError={mockOnError}
        />
      );

      await waitFor(() => {
        expect(mockEncrypt).toHaveBeenCalled();
        expect(mockUploadBlob).toHaveBeenCalled();
      }, { timeout: 5000 });

      await waitFor(() => {
        expect(mockOnEncrypted).toHaveBeenCalled();
      }, { timeout: 5000 });

      const [firstCall] = mockOnEncrypted.mock.calls as any[];
      expect(firstCall).toBeDefined();
      const result = firstCall?.[0];
      expect(result).toBeDefined();
      expect(result.seal_policy_id).toBe('test-seal-policy-id');
      expect(result.walrusBlobId).toBe('test-blob-id');
    });
  });

  describe('Multi-File Upload', () => {
    it('should process multiple files in parallel', async () => {
      const audioFiles: AudioFile[] = [
        { ...mockAudioFile, id: 'file-1' },
        { ...mockAudioFile, id: 'file-2' },
        { ...mockAudioFile, id: 'file-3' },
      ];

      render(
        <EncryptionStep
          audioFile={mockAudioFile}
          audioFiles={audioFiles}
          onEncrypted={mockOnEncrypted}
          onError={mockOnError}
        />
      );

      await waitFor(() => {
        expect(mockEncrypt).toHaveBeenCalledTimes(3);
        expect(mockUploadBlob).toHaveBeenCalledTimes(3);
      }, { timeout: 5000 });

      await waitFor(() => {
        expect(mockOnEncrypted).toHaveBeenCalled();
      }, { timeout: 5000 });

      const [firstCall] = mockOnEncrypted.mock.calls as any[];
      expect(firstCall).toBeDefined();
      const result = firstCall?.[0];
      expect(result).toBeDefined();
      expect(result.files).toBeDefined();
      expect(result.files?.length).toBe(3);
      expect(result.bundleDiscountBps).toBeGreaterThan(0); // Should have bundle discount
    });
  });

  describe('Error Handling', () => {
    it('should handle encryption errors', async () => {
      mockEncrypt.mockRejectedValueOnce(new Error('Encryption failed'));

      render(
        <EncryptionStep
          audioFile={mockAudioFile}
          onEncrypted={mockOnEncrypted}
          onError={mockOnError}
        />
      );

      await waitFor(() => {
        expect(mockOnError).toHaveBeenCalledWith('Encryption failed');
      }, { timeout: 5000 });
    });

    it('should handle upload errors', async () => {
      mockUploadBlob.mockRejectedValueOnce(new Error('Upload failed'));

      render(
        <EncryptionStep
          audioFile={mockAudioFile}
          onEncrypted={mockOnEncrypted}
          onError={mockOnError}
        />
      );

      await waitFor(() => {
        expect(mockOnError).toHaveBeenCalledWith('Upload failed');
      }, { timeout: 5000 });
    });
  });

  describe('Orchestrator Integration', () => {
    it('should log orchestration steps', async () => {
      const consoleSpy = mock((message: string) => {});
      const originalLog = console.log;
      console.log = consoleSpy as any;

      render(
        <EncryptionStep
          audioFile={mockAudioFile}
          onEncrypted={mockOnEncrypted}
          onError={mockOnError}
        />
      );

      await waitFor(() => {
        expect(consoleSpy.mock.calls.some((call: any[]) =>
          call[1]?.includes('Initializing upload orchestrator')
        )).toBe(true);
      }, { timeout: 5000 });

      console.log = originalLog;
    });
  });

  describe('Bundle Discounts', () => {
    it('should apply 10% discount for 2-5 files', async () => {
      const audioFiles: AudioFile[] = [
        { ...mockAudioFile, id: 'file-1' },
        { ...mockAudioFile, id: 'file-2' },
      ];

      render(
        <EncryptionStep
          audioFile={mockAudioFile}
          audioFiles={audioFiles}
          onEncrypted={mockOnEncrypted}
          onError={mockOnError}
        />
      );

      await waitFor(() => {
        expect(mockOnEncrypted).toHaveBeenCalled();
      }, { timeout: 5000 });

      const [firstCall] = mockOnEncrypted.mock.calls as any[];
      expect(firstCall).toBeDefined();
      const result = firstCall?.[0];
      expect(result).toBeDefined();
      expect(result.bundleDiscountBps).toBe(1000); // 10%
    });

    it('should apply 20% discount for 6+ files', async () => {
      const audioFiles: AudioFile[] = Array.from({ length: 6 }, (_, i) => ({
        ...mockAudioFile,
        id: `file-${i}`,
      }));

      render(
        <EncryptionStep
          audioFile={mockAudioFile}
          audioFiles={audioFiles}
          onEncrypted={mockOnEncrypted}
          onError={mockOnError}
        />
      );

      await waitFor(() => {
        expect(mockOnEncrypted).toHaveBeenCalled();
      }, { timeout: 5000 });

      const [firstCall] = mockOnEncrypted.mock.calls as any[];
      expect(firstCall).toBeDefined();
      const result = firstCall?.[0];
      expect(result).toBeDefined();
      expect(result.bundleDiscountBps).toBe(2000); // 20%
    });
  });
});
