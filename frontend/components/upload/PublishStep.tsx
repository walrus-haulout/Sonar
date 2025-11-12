'use client';

import { useState } from 'react';
import { Coins, Wallet, Loader2 } from 'lucide-react';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { cn } from '@/lib/utils';
import {
  WalrusUploadResult,
  DatasetMetadata,
  VerificationResult,
  PublishResult,
} from '@/lib/types/upload';
import { SonarButton } from '@/components/ui/SonarButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { CHAIN_CONFIG } from '@/lib/sui/client';

/**
 * Convert Uint8Array to base64 string (browser-safe)
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

interface PublishStepProps {
  walrusUpload: WalrusUploadResult;
  metadata: DatasetMetadata;
  verification: VerificationResult;
  onPublished: (result: PublishResult) => void;
  onError: (error: string) => void;
}

const UPLOAD_FEE_MIST = 250_000_000; // 0.25 SUI expressed in MIST (1 SUI = 1_000_000_000 MIST)

/**
 * PublishStep Component
 * Handles blockchain submission with fixed SUI submission fee
 */
export function PublishStep({
  walrusUpload,
  metadata,
  verification,
  onPublished,
  onError,
}: PublishStepProps) {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();
  const [publishState, setPublishState] = useState<'idle' | 'signing' | 'broadcasting' | 'confirming'>('idle');
  const publishDisabled = isPending || publishState !== 'idle';

  const handlePublish = async () => {
    if (!account) {
      onError('Please connect your wallet first');
      return;
    }

    try {
      setPublishState('signing');

      if (!CHAIN_CONFIG.packageId || !CHAIN_CONFIG.marketplaceId) {
        onError(
          `Blockchain configuration missing required IDs: ${CHAIN_CONFIG.missingKeys.join(', ') || 'PACKAGE_ID / MARKETPLACE_ID'}`
        );
        setPublishState('idle');
        return;
      }

      // Build transaction
      const tx = new Transaction();

      // Check if multi-file dataset
      const isMultiFile = walrusUpload.files && walrusUpload.files.length > 0;

      if (isMultiFile) {
        // Multi-file dataset: Call submit_audio_dataset
        const files = walrusUpload.files!;

        const blobIds = files.map(f => f.blobId);
        const previewBlobIds = files.map(f => f.previewBlobId || '');
        const sealPolicyIds = files.map(f => f.seal_policy_id);
        const durations = files.map(f => Math.max(1, Math.floor(f.duration))); // Convert to u64

        const uploadFeeCoin = tx.splitCoins(tx.gas, [UPLOAD_FEE_MIST])[0];

        tx.moveCall({
          target: `${CHAIN_CONFIG.packageId}::marketplace::submit_audio_dataset`,
          arguments: [
            tx.object(CHAIN_CONFIG.marketplaceId),
            uploadFeeCoin,
            tx.pure.vector('string', blobIds),
            tx.pure.vector('string', previewBlobIds),
            tx.pure.vector('string', sealPolicyIds),
            tx.pure.vector('u64', durations),
            tx.pure.u64(walrusUpload.bundleDiscountBps || 0), // bundle_discount_bps
          ],
        });
      } else {
        // Single file: Call submit_audio (backwards compatibility)
        const uploadFeeCoin = tx.splitCoins(tx.gas, [UPLOAD_FEE_MIST])[0];

        tx.moveCall({
          target: `${CHAIN_CONFIG.packageId}::marketplace::submit_audio`,
          arguments: [
            tx.object(CHAIN_CONFIG.marketplaceId),
            uploadFeeCoin,
            tx.pure.string(walrusUpload.blobId),
            tx.pure.string(walrusUpload.previewBlobId || ''),
            tx.pure.string(walrusUpload.seal_policy_id), // Seal policy ID for decryption
            tx.pure.option('vector<u8>', null), // preview_blob_hash (optional)
            tx.pure.u64(3600), // duration_seconds (placeholder - should come from audioFile)
          ],
        });
      }

      setPublishState('broadcasting');

      // Sign and execute
      signAndExecute(
        {
          transaction: tx,
        },
        {
          onSuccess: async (result) => {
            setPublishState('confirming');

            // Fetch full transaction details to get objectChanges
            let datasetId: string | null = null;

            try {
              const txDetails = await suiClient.getTransactionBlock({
                digest: result.digest,
                options: {
                  showObjectChanges: true,
                  showEffects: true,
                },
              });

              // Extract dataset ID from objectChanges
              if (txDetails.objectChanges) {
                for (const change of txDetails.objectChanges) {
                  if (change.type === 'created' &&
                      change.objectType &&
                      change.objectType.includes('::marketplace::AudioSubmission')) {
                    datasetId = change.objectId;
                    break;
                  }
                }
              }

              if (!datasetId) {
                console.error('Failed to extract dataset ID from transaction', txDetails);
                onError('Failed to extract dataset ID from blockchain transaction. Please try again.');
                setPublishState('idle');
                return;
              }
            } catch (error) {
              console.error('Failed to fetch transaction details:', error);
              onError('Failed to fetch transaction details. Please try again.');
              setPublishState('idle');
              return;
            }

            // Store seal metadata in backend for decryption
            // SECURITY: backup_key storage temporarily disabled pending encryption implementation
            // TODO: Implement backup key encryption with user's public key before persistence
            // This requires:
            // 1. Derive/obtain user's public key from wallet
            // 2. Encrypt backup_key with user's public key
            // 3. Only user can decrypt their backup keys for recovery
            // This maintains the recovery property while keeping keys secure
            try {
              // Prepare file metadata for all files
              const fallbackDuration = Math.max(
                1,
                Math.floor(walrusUpload.files?.[0]?.duration ?? 3600)
              );
              const fallbackPreviewId = walrusUpload.previewBlobId ?? walrusUpload.files?.[0]?.previewBlobId ?? null;
              const fallbackMime = walrusUpload.mimeType || walrusUpload.files?.[0]?.mimeType || 'audio/mpeg';
              const fallbackPreviewMime =
                walrusUpload.previewMimeType ?? walrusUpload.files?.[0]?.previewMimeType ?? null;

              const files = walrusUpload.files && walrusUpload.files.length > 0
                ? walrusUpload.files.map(file => ({
                    file_index: file.file_index || 0,
                    seal_policy_id: file.seal_policy_id,
                    // backup_key: uint8ArrayToBase64(file.backupKey), // TODO: Add backupKey to FileUploadResult type
                    blob_id: file.blobId,
                    preview_blob_id: file.previewBlobId ?? null,
                    duration_seconds: Math.max(1, Math.floor(file.duration)),
                    mime_type: file.mimeType || walrusUpload.mimeType || 'audio/mpeg',
                    preview_mime_type: file.previewMimeType ?? walrusUpload.previewMimeType ?? null,
                  }))
                : [{
                    file_index: 0,
                    seal_policy_id: walrusUpload.seal_policy_id,
                    // backup_key: uint8ArrayToBase64(walrusUpload.backupKey), // TODO: Add backupKey to WalrusUploadResult type
                    blob_id: walrusUpload.blobId,
                    preview_blob_id: fallbackPreviewId,
                    duration_seconds: fallbackDuration,
                    mime_type: fallbackMime,
                    preview_mime_type: fallbackPreviewMime,
                  }];

              // Include verification metadata
              const verificationMetadata = verification ? {
                verification_id: verification.id,
                quality_score: verification.qualityScore,
                safety_passed: verification.safetyPassed,
                verified_at: new Date().toISOString(),
              } : null;

              const metadataResponse = await fetch(`/api/datasets/${datasetId}/seal-metadata`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  files,
                  verification: verificationMetadata,
                }),
              });

              if (!metadataResponse.ok) {
                const error = await metadataResponse.json();
                console.error('Failed to store seal metadata:', error);
                // Don't fail the entire publish - user can still use the dataset
                // but decryption might require manual backup key entry
              }
            } catch (error) {
              console.error('Error storing seal metadata:', error);
              // Continue with publish - metadata storage is non-critical
            }

            const publishResult: PublishResult = {
              txDigest: result.digest,
              datasetId,
              confirmed: true,
            };

            onPublished(publishResult);
          },
          onError: (error) => {
            console.error('Transaction failed:', error);
            setPublishState('idle');
            onError(
              error.message || 'Failed to publish dataset to blockchain'
            );
          },
        }
      );
    } catch (error) {
      console.error('Publish error:', error);
      setPublishState('idle');
      onError(
        error instanceof Error
          ? error.message
          : 'Failed to publish dataset'
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Wallet Connection Check */}
      {!account ? (
        <GlassCard className="bg-sonar-coral/10 border border-sonar-coral">
          <div className="flex items-center space-x-4">
            <Wallet className="w-8 h-8 text-sonar-coral" />
            <div>
              <h3 className="text-lg font-mono font-bold text-sonar-coral">
                Wallet Not Connected
              </h3>
              <p className="text-sm text-sonar-highlight/70 mt-1">
                Please connect your Sui wallet to publish your dataset to the
                blockchain.
              </p>
            </div>
          </div>
        </GlassCard>
      ) : (
        <>
          {/* Transaction Summary */}
          <GlassCard>
            <h3 className="text-lg font-mono font-bold text-sonar-highlight-bright mb-4">
              Publication Summary
            </h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-sonar-highlight/70">Dataset Title:</span>
                <span className="text-sonar-highlight-bright font-mono">
                  {metadata.title}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-sonar-highlight/70">Languages:</span>
                <span className="text-sonar-highlight-bright font-mono">
                  {metadata.languages.join(', ')}
                </span>
              </div>

              {walrusUpload.files && walrusUpload.files.length > 0 ? (
                <>
                  {/* Multi-file dataset */}
                  <div className="flex justify-between">
                    <span className="text-sonar-highlight/70">Files:</span>
                    <span className="text-sonar-signal font-mono">
                      {walrusUpload.files.length} audio files
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-sonar-highlight/70">Total Duration:</span>
                    <span className="text-sonar-signal font-mono">
                      {Math.floor(walrusUpload.files.reduce((sum, f) => sum + f.duration, 0) / 60)} minutes
                    </span>
                  </div>

                  {walrusUpload.bundleDiscountBps && walrusUpload.bundleDiscountBps > 0 && (
                    <div className="flex justify-between">
                      <span className="text-sonar-highlight/70">Bundle Discount:</span>
                      <span className="text-sonar-signal font-mono">
                        {walrusUpload.bundleDiscountBps / 100}%
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Single file dataset */}
                  <div className="flex justify-between">
                    <span className="text-sonar-highlight/70">Walrus Blob ID:</span>
                    <span className="text-sonar-signal font-mono text-xs truncate max-w-xs">
                      {walrusUpload.blobId}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-sonar-highlight/70">Seal Policy ID:</span>
                    <span className="text-sonar-signal font-mono text-xs truncate max-w-xs">
                      {walrusUpload.seal_policy_id}
                    </span>
                  </div>
                </>
              )}

              {verification.qualityScore && (
                <div className="flex justify-between">
                  <span className="text-sonar-highlight/70">Quality Score:</span>
                  <span className="text-sonar-signal font-mono">
                    {Math.round(verification.qualityScore * 100)}%
                  </span>
                </div>
              )}
            </div>
          </GlassCard>

          {/* Upload Fee Info */}
          <GlassCard className="bg-sonar-blue/5">
            <div className="flex items-start space-x-4">
              <Coins className="w-6 h-6 text-sonar-blue mt-0.5" />
              <div className="flex-1">
                <h4 className="font-mono font-semibold text-sonar-blue mb-2">
                  Upload Fee Required
                </h4>
                <p className="text-sm text-sonar-highlight/80 mb-3">
                  A fixed upload fee of <span className="text-sonar-signal font-mono">1&nbsp;SUI</span> is required to publish your dataset on mainnet. This helps prevent spam uploads while tokenomics launch is pending.
                </p>
                <div className="p-3 rounded-sonar bg-sonar-abyss/30">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-sonar-highlight/70">
                      Estimated Fee:
                    </span>
                    <span className="font-mono font-bold text-sonar-signal">
                      1 SUI
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Publish Button */}
          <div className="flex flex-col items-center space-y-4">
            {publishState === 'idle' && (
              <SonarButton
                variant="primary"
                onClick={handlePublish}
                disabled={publishDisabled}
                className="w-full"
              >
                Publish to Blockchain
              </SonarButton>
            )}

            {(publishState === 'signing' || publishState === 'broadcasting' || publishState === 'confirming') && (
              <GlassCard className="w-full bg-sonar-signal/10 border border-sonar-signal">
                <div className="flex items-center space-x-4">
                  <Loader2 className="w-6 h-6 text-sonar-signal animate-spin" />
                  <div className="flex-1">
                    <p className="font-mono font-semibold text-sonar-highlight-bright">
                      {publishState === 'signing' && 'Waiting for wallet signature...'}
                      {publishState === 'broadcasting' && 'Broadcasting transaction...'}
                      {publishState === 'confirming' && 'Confirming on blockchain...'}
                    </p>
                    <p className="text-xs text-sonar-highlight/70 mt-1">
                      Please do not close this window
                    </p>
                  </div>
                </div>
              </GlassCard>
            )}
          </div>

          {/* Info Box */}
          <GlassCard className="bg-sonar-signal/5">
            <div className="text-sm text-sonar-highlight/80 space-y-2">
              <p className="font-mono font-semibold text-sonar-signal">
                What happens next?
              </p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Your dataset will be published to the Sui blockchain</li>
                <li>Buyers can discover and purchase access</li>
                <li>Revenue will be sent directly to your wallet</li>
                <li>You maintain full ownership and control</li>
              </ul>
            </div>
          </GlassCard>
        </>
      )}
    </div>
  );
}
