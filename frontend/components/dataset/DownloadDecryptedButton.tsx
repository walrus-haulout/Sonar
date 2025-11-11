'use client';

import { useState, useCallback } from 'react';
import { useSignPersonalMessage, useCurrentAccount } from '@mysten/dapp-kit';
import type { Dataset } from '@/types/blockchain';
import { useAuth } from '@/hooks/useAuth';
import { requestAccessGrant } from '@/lib/api/client';
import { useSealDecryption, type DecryptionProgress } from '@/hooks/useSeal';
import { usePurchase } from '@/hooks/usePurchase';
import { SonarButton } from '@/components/ui/SonarButton';
import { formatNumber } from '@/lib/utils';

interface DownloadDecryptedButtonProps {
  dataset: Dataset;
  className?: string;
}

/**
 * DownloadDecryptedButton Component
 * Complete flow: Verify purchase (or prompt to buy) → Decrypt → Download
 *
 * Flow:
 * 1. Check if user has purchased dataset
 * 2. If not purchased, show purchase requirement
 * 3. If purchased, fetch encrypted blob from Walrus
 * 4. Decrypt using Seal in browser
 * 5. Download decrypted file to device
 */
export function DownloadDecryptedButton({ dataset, className = '' }: DownloadDecryptedButtonProps) {
  const [downloadProgress, setDownloadProgress] = useState<DecryptionProgress | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const { token, isAuthenticated, isTokenValid } = useAuth();
  const currentAccount = useCurrentAccount();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const { purchaseDataset, state: purchaseState } = usePurchase();

  const {
    hasSession,
    isDecrypting,
    decryptAudio,
    createSession,
  } = useSealDecryption();

  // Estimate file size based on duration and bitrate (assume 128kbps for mp3)
  const estimatedFileSize = Math.ceil((dataset.duration_seconds * 128 * 1024) / 8);
  const estimatedFileSizeMB = (estimatedFileSize / (1024 * 1024)).toFixed(1);

  /**
   * Main download flow: decrypt and download
   */
  const handleDownload = useCallback(async () => {
    if (!isAuthenticated || !isTokenValid() || !token) {
      console.error('[DownloadDecrypted] User not authenticated');
      setDownloadProgress({
        stage: 'error',
        progress: 0,
        message: 'Authentication required',
        error: 'Please log in to download audio',
      });
      return;
    }

    console.log('[DownloadDecrypted] Starting download flow', {
      datasetId: dataset.id,
      hasSession,
    });

    setIsDownloading(true);

    try {
      // Step 1: Create Seal session if needed
      if (!hasSession) {
        console.log('[DownloadDecrypted] Creating new Seal session');
        setDownloadProgress({
          stage: 'fetching',
          progress: 5,
          message: 'Creating secure session...',
        });

        try {
          await createSession({
            signMessage: async (message: Uint8Array) => {
              const result = await signPersonalMessage({ message });
              return { signature: result.signature };
            },
          });
          console.log('[DownloadDecrypted] Seal session created successfully');
        } catch (sessionError) {
          console.error('[DownloadDecrypted] Failed to create Seal session:', sessionError);
          throw new Error(
            sessionError instanceof Error && sessionError.message.includes('User rejected')
              ? 'Wallet signature required to create secure session'
              : 'Failed to create secure session. Please try again.'
          );
        }
      }

      // Step 2: Request access grant (verifies purchase)
      console.log('[DownloadDecrypted] Requesting access grant');
      setDownloadProgress({
        stage: 'fetching',
        progress: 10,
        message: 'Verifying purchase and requesting access...',
      });

      let grant;
      try {
        grant = await requestAccessGrant(dataset.id, token);
        console.log('[DownloadDecrypted] Access grant received', {
          blobId: grant.blob_id,
          policyId: grant.seal_policy_id,
        });
      } catch (accessError) {
        console.error('[DownloadDecrypted] Access grant denied:', accessError);
        throw new Error(
          accessError instanceof Error && accessError.message.includes('purchase')
            ? 'Purchase required to download audio'
            : 'Access denied. Please verify your purchase.'
        );
      }

      // Step 3: Decrypt the audio
      console.log('[DownloadDecrypted] Starting decryption', {
        policyModule: 'purchase_policy',
        policyId: grant.seal_policy_id,
      });

      const decryptedData = await decryptAudio({
        blobId: grant.blob_id,
        sealPolicyId: grant.seal_policy_id,
        policyModule: 'purchase_policy',
        onProgress: (progress) => {
          setDownloadProgress(progress);
          console.log('[DownloadDecrypted] Decryption progress:', progress);
        },
      });

      console.log('[DownloadDecrypted] Decryption successful', {
        decryptedSize: decryptedData.length,
        decryptedSizeMB: (decryptedData.length / 1024 / 1024).toFixed(2),
      });

      // Step 4: Trigger download
      setDownloadProgress({
        stage: 'complete',
        progress: 95,
        message: 'Preparing download...',
      });

      const audioBlob = new Blob([decryptedData as unknown as BlobPart], { type: 'audio/mpeg' });
      const blobUrl = URL.createObjectURL(audioBlob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${dataset.id}-${dataset.title.replace(/\s+/g, '-')}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up Blob URL after download
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

      console.log('[DownloadDecrypted] Download triggered', { filename: link.download });

      setDownloadProgress({
        stage: 'complete',
        progress: 100,
        message: 'Download complete!',
      });

      // Reset progress after 3 seconds
      setTimeout(() => {
        setDownloadProgress(null);
        setIsDownloading(false);
      }, 3000);
    } catch (error) {
      console.error('[DownloadDecrypted] Download flow failed:', error);

      // Provide user-friendly error messages
      let userMessage = 'Failed to download audio';
      let technicalError = error instanceof Error ? error.message : 'Unknown error';

      if (technicalError.includes('purchase')) {
        userMessage = 'Purchase required';
        technicalError = 'You must purchase this dataset before downloading.';
      } else if (technicalError.includes('policy')) {
        userMessage = 'Access policy verification failed';
        technicalError = 'The on-chain policy denied access. Please verify your purchase.';
      } else if (technicalError.includes('key share') || technicalError.includes('key server')) {
        userMessage = 'Key server unavailable';
        technicalError = 'Could not retrieve decryption keys. Please check your network and try again.';
      } else if (technicalError.includes('blob') || technicalError.includes('Walrus')) {
        userMessage = 'Failed to fetch encrypted audio';
        technicalError = 'Could not download encrypted data from Walrus. Please try again.';
      }

      setDownloadProgress({
        stage: 'error',
        progress: 0,
        message: userMessage,
        error: technicalError,
      });

      setIsDownloading(false);
    }
  }, [
    isAuthenticated,
    isTokenValid,
    token,
    hasSession,
    createSession,
    signPersonalMessage,
    dataset.id,
    dataset.title,
    decryptAudio,
  ]);

  /**
   * Handle purchase if not owned
   */
  const handlePurchase = useCallback(async () => {
    if (!currentAccount) {
      alert('Please connect your wallet first');
      return;
    }

    await purchaseDataset(dataset);
  }, [currentAccount, purchaseDataset, dataset]);

  const canDownload = isAuthenticated && isTokenValid();

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Download Button */}
      <SonarButton
        variant={canDownload ? 'primary' : 'secondary'}
        onClick={handleDownload}
        disabled={!canDownload || isDownloading || isDecrypting}
        className="w-full"
      >
        {isDownloading || isDecrypting ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {downloadProgress?.message || 'Processing...'}
          </>
        ) : canDownload ? (
          <>
            <svg className="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
            Download Decrypted Audio ({estimatedFileSizeMB} MB)
          </>
        ) : (
          <>
            <svg className="w-4 h-4 mr-2 inline" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 1C5.925 1 1 5.925 1 12s4.925 11 11 11 11-4.925 11-11S18.075 1 12 1m-1 16h2v2h-2v-2m0-10h2v10h-2V7z" />
            </svg>
            Authenticate to Download
          </>
        )}
      </SonarButton>

      {/* Download Progress */}
      {downloadProgress && (
        <div className={`p-3 rounded-sonar border ${
          downloadProgress.stage === 'error'
            ? 'border-sonar-coral/20 bg-sonar-coral/5'
            : 'border-sonar-signal/20 bg-sonar-signal/5'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-sonar-highlight">
              {downloadProgress.message}
            </span>
            <span className="text-xs font-mono text-sonar-signal">
              {downloadProgress.progress}%
            </span>
          </div>
          {downloadProgress.stage !== 'error' && downloadProgress.stage !== 'complete' && (
            <div className="w-full bg-sonar-abyss/50 rounded-full h-1.5">
              <div
                className="bg-sonar-signal h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${downloadProgress.progress}%` }}
              />
            </div>
          )}
          {downloadProgress.error && (
            <p className="text-xs text-sonar-coral mt-2">{downloadProgress.error}</p>
          )}
        </div>
      )}

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
        <div className="pt-2 border-t border-sonar-signal/10">
          <p className="text-sonar-highlight-bright/70">
            <span className="font-mono text-sonar-signal">🔒 Privacy:</span> Audio decrypted in your browser using Mysten Seal. No server access to decrypted data.
          </p>
        </div>
      </div>
    </div>
  );
}
