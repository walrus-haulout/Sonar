'use client';

import { useState, useCallback } from 'react';
import type { Dataset } from '@/types/blockchain';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { toastError, toastSuccess } from '@/lib/toast';
import { SonarButton } from '@/components/ui/SonarButton';
import { DownloadProgress } from '@/components/ui/DownloadProgress';
import { formatNumber } from '@/lib/utils';
import { usePurchaseVerification } from '@/hooks/usePurchaseVerification';

interface DownloadButtonProps {
  dataset: Dataset;
  onDownloadStart?: () => void;
  onDownloadComplete?: (filepath: string) => void;
}

/**
 * DownloadButton Component
 * Handles authenticated download of purchased audio datasets
 * Shows progress, handles errors, and manages file downloads
 */
export function DownloadButton({
  dataset,
  onDownloadStart,
  onDownloadComplete,
}: DownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);

  const account = useCurrentAccount();
  const { verifyOwnership, isConnected } = usePurchaseVerification();

  // Estimate file size based on duration and bitrate (assume 128kbps for mp3)
  const estimatedFileSize = Math.ceil((dataset.duration_seconds * 128 * 1024) / 8);
  const estimatedFileSizeMB = (estimatedFileSize / (1024 * 1024)).toFixed(1);

  const handleDownload = useCallback(async () => {
    if (!isConnected) {
      toastError('Wallet Required', 'Please connect your wallet to download audio');
      return;
    }

    setIsDownloading(true);
    onDownloadStart?.();

    try {
      // Step 1: Verify purchase on blockchain
      const ownsDataset = await verifyOwnership(dataset.id);
      if (!ownsDataset) {
        throw new Error('Purchase required. Please purchase this dataset first.');
      }

      // Step 2: Get blob_id from dataset metadata
      const blobId = (dataset as any).blob_id || (dataset as any).walrus_blob_id;
      if (!blobId) {
        throw new Error('Dataset metadata incomplete. Missing blob_id.');
      }

      // Step 3: Download the audio file via edge proxy
      const proxyUrl = `/api/edge/walrus/proxy/${blobId}`;
      let response: Response;
      try {
        response = await fetch(proxyUrl);
      } catch (error) {
        if (error instanceof Error && error.message.includes('Failed to fetch')) {
          throw new Error('Unable to download audio from Walrus. Please check your connection.');
        }
        throw error;
      }

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      // Get total file size from Content-Length header
      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : estimatedFileSize;
      setTotalBytes(total);

      // Stream the response and track progress
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Unable to read response stream');
      }

      const chunks: Uint8Array[] = [];
      let receivedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        receivedBytes += value.length;
        setDownloadedBytes(receivedBytes);
        setProgress((receivedBytes / total) * 100);
      }

      // Create blob from chunks
      const blob = new Blob(chunks as BlobPart[], { type: 'audio/mpeg' });

      // Step 4: Trigger browser download
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${dataset.id}-${dataset.title.replace(/\s+/g, '-')}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toastSuccess('Download Complete', `${dataset.title} has been downloaded`);
      onDownloadComplete?.(link.download);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toastError('Download Failed', message);
      console.error('Download error:', error);
    } finally {
      setIsDownloading(false);
      setProgress(0);
      setDownloadedBytes(0);
    }
  }, [dataset, isConnected, onDownloadStart, onDownloadComplete, estimatedFileSize, verifyOwnership]);

  if (isDownloading) {
    return (
      <div className="space-y-2">
        <DownloadProgress
          progress={progress}
          totalBytes={totalBytes || estimatedFileSize}
          bytesDownloaded={downloadedBytes}
          filename={`${dataset.id}-${dataset.title.replace(/\s+/g, '-')}.mp3`}
        />
      </div>
    );
  }

  const canDownload = isConnected;

  return (
    <div className="space-y-3">
      <SonarButton
        variant={canDownload ? 'primary' : 'secondary'}
        onClick={handleDownload}
        disabled={!canDownload || isDownloading}
        className="w-full"
      >
        {canDownload ? (
          <>
            <svg className="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
            Download ({estimatedFileSizeMB} MB)
          </>
        ) : (
          <>
            <svg className="w-4 h-4 mr-2 inline" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1C5.925 1 1 5.925 1 12s4.925 11 11 11 11-4.925 11-11S18.075 1 12 1m-1 16h2v2h-2v-2m0-10h2v10h-2V7z" />
            </svg>
            Connect Wallet to Download
          </>
        )}
      </SonarButton>

      {/* File info */}
      <div className="text-xs text-sonar-highlight-bright/60 space-y-1 p-3 bg-sonar-abyss/30 rounded-sonar border border-sonar-signal/10">
        <div className="flex justify-between">
          <span>Estimated Size:</span>
          <span className="font-mono text-sonar-signal">{estimatedFileSizeMB} MB</span>
        </div>
        <div className="flex justify-between">
          <span>Duration:</span>
          <span className="font-mono text-sonar-highlight">{formatNumber(dataset.duration_seconds)}s</span>
        </div>
        <div className="flex justify-between">
          <span>Format:</span>
          <span className="font-mono uppercase">{dataset.formats[0] || 'mp3'}</span>
        </div>
        {canDownload && (
          <div className="pt-2 border-t border-sonar-signal/10 text-sonar-signal">
            ✓ Ready to download
          </div>
        )}
      </div>
    </div>
  );
}
