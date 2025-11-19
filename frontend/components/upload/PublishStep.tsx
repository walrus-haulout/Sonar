'use client';

import { useState } from 'react';
import { Coins, Wallet, Loader2 } from 'lucide-react';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import type {
  WalrusUploadResult,
  DatasetMetadata,
  VerificationResult,
  PublishResult,
} from '@/lib/types/upload';
import { extractObjectId, isSuiCreatedObject, type SuiEventParsedJson } from '@/lib/types/sui';
import { SonarButton } from '@/components/ui/SonarButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { CHAIN_CONFIG } from '@/lib/sui/client';
import { useAtomicBlobRegistration } from '@/hooks/useAtomicBlobRegistration';

/**
 * Convert Uint8Array to base64 string (browser-safe)
 */
function _uint8ArrayToBase64(bytes: Uint8Array): string {
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
const MIST_PER_SUI = 1_000_000_000;

function formatMistToSui(mist: number) {
  const value = mist / MIST_PER_SUI;
  return Number(value.toFixed(9)).toString();
}

const UPLOAD_FEE_LABEL = `${formatMistToSui(UPLOAD_FEE_MIST)} SUI`;

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
  const { submitWithAtomicRegistration, isSubmitting: isAtomicSubmitting } =
    useAtomicBlobRegistration();
  const [publishState, setPublishState] = useState<'idle' | 'signing' | 'broadcasting' | 'confirming'>('idle');
  const publishDisabled =
    isPending || isAtomicSubmitting || publishState !== 'idle';

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
      tx.setGasBudget(50_000_000); // 0.05 SUI

      const marketplaceSharedRef = tx.object(CHAIN_CONFIG.marketplaceId);

      // Check if multi-file dataset
      const isMultiFile = walrusUpload.files && walrusUpload.files.length > 0;

      if (isMultiFile) {
        // Multi-file dataset: Call submit_audio_dataset
        const files = walrusUpload.files;
        if (!files || files.length === 0) {
          onError('No files found in multi-file upload result');
          setPublishState('idle');
          return;
        }

        const blobIds = files.map(f => f.blobId);
        const previewBlobIds = files.map(f => f.previewBlobId || '');
        const sealPolicyIds = files.map(f => f.seal_policy_id);
        const durations = files.map(f => Math.max(1, Math.floor(f.duration))); // Convert to u64

        const uploadFeeCoin = tx.splitCoins(tx.gas, [UPLOAD_FEE_MIST])[0];

        tx.moveCall({
          target: `${CHAIN_CONFIG.packageId}::marketplace::submit_audio_dataset`,
          arguments: [
            marketplaceSharedRef,
            uploadFeeCoin,
            tx.pure.vector('string', blobIds),
            tx.pure.vector('string', previewBlobIds),
            tx.pure.vector('string', sealPolicyIds),
            tx.pure.vector('u64', durations),
            tx.pure.u64(walrusUpload.bundleDiscountBps || 0), // bundle_discount_bps
          ],
        });
      } else {
        // Single file: Use atomic blob registration for true atomicity
        // This replaces the old submit_audio call with a two-phase atomic transaction:
        // Phase 1: register_blob_intent() creates BlobRegistration on-chain
        // Phase 2: finalize_submission_with_blob() atomically creates AudioSubmission
        setPublishState('signing');

        try {
          console.log('[PublishStep] Starting atomic blob registration flow');
          const result = await submitWithAtomicRegistration(
            walrusUpload.blobId,
            walrusUpload.previewBlobId || '',
            walrusUpload.seal_policy_id,
            3600 // duration_seconds (placeholder - should come from audioFile)
          );

          console.log('[PublishStep] Atomic registration successful:', result);
          setPublishState('confirming');

          // Proceed with object change detection
          onPublished({
            txDigest: '',
            datasetId: result.submissionId,
            confirmed: true,
          });

          return;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Atomic registration failed';
          console.error('[PublishStep] Atomic registration failed:', errorMsg);
          onError(errorMsg);
          setPublishState('idle');
          return;
        }
      }

      setPublishState('broadcasting');

      // Sign and execute (for multi-file datasets using old flow)
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
                  showEvents: true,
                },
              });

              // Extract dataset ID from objectChanges
              // Check for both AudioSubmission (single-file) and DatasetSubmission (multi-file)
              if (txDetails.objectChanges) {
                // Debug: log all object changes to understand structure
                console.log('Transaction objectChanges (full):', JSON.stringify(txDetails.objectChanges, null, 2));
                
                for (const change of txDetails.objectChanges) {
                  // Skip published modules - they don't have objectType/objectId
                  if (change.type === 'published') {
                    continue;
                  }

                  // Log every change for debugging
                  console.log('Checking object change:', {
                    type: change.type,
                    objectType: change.objectType,
                    objectId: change.objectId,
                    fullChange: change,
                    allKeys: Object.keys(change),
                  });

                  // Extract objectType and objectId (safe after type guard)
                  const objectType = change.objectType;
                  const objectId = change.objectId || extractObjectId(change);
                  
                  // Check if this object matches our submission types
                  // The objectType might be the full package path like "0x...::marketplace::AudioSubmission"
                  if (objectType &&
                      (objectType.includes('::marketplace::AudioSubmission') ||
                       objectType.includes('::marketplace::DatasetSubmission'))) {
                    if (objectId) {
                      datasetId = objectId;
                      console.log(`Found dataset ID from ${change.type} object:`, datasetId, 'type:', objectType);
                      break;
                    }
                  }
                  
                  // Also check objectType without the package prefix (just the module::type part)
                  if (objectType && objectId && !datasetId) {
                    const typeParts = objectType.split('::');
                    if (typeParts.length >= 3) {
                      const moduleType = typeParts.slice(-2).join('::'); // e.g., "marketplace::AudioSubmission"
                      if (moduleType === 'marketplace::AudioSubmission' || moduleType === 'marketplace::DatasetSubmission') {
                        datasetId = objectId;
                        console.log(`Found dataset ID by module type from ${change.type} object:`, datasetId);
                        break;
                      }
                    }
                  }
                }
              }

              // Fallback 1: Extract from events if objectChanges didn't work
              // The contract emits SubmissionCreated or DatasetSubmissionCreated events with submission_id
              if (!datasetId && txDetails.events && CHAIN_CONFIG.packageId) {
                console.log('Trying to extract dataset ID from events (full):', JSON.stringify(txDetails.events, null, 2));
                
                for (const event of txDetails.events) {
                  const eventType = event.type;
                  const parsedJson = event.parsedJson as SuiEventParsedJson | undefined;

                  console.log('Checking event:', { eventType, parsedJson });

                  // Check for SubmissionCreated or DatasetSubmissionCreated events
                  if (eventType &&
                      (eventType.includes('::marketplace::SubmissionCreated') ||
                       eventType.includes('::marketplace::DatasetSubmissionCreated')) &&
                      parsedJson?.submission_id) {
                    datasetId = parsedJson.submission_id;
                    console.log('Found dataset ID from events:', datasetId);
                    break;
                  }
                }
              }
              
              // Fallback 2: Check effects.created and fetch objects to verify their types
              // This handles cases where objectChanges doesn't show created objects
              if (!datasetId && txDetails.effects?.created) {
                console.log('Checking effects.created:', JSON.stringify(txDetails.effects.created, null, 2));
                
                // Fetch each created object to check its type
                for (const createdRef of txDetails.effects.created) {
                  try {
                    const objectId = extractObjectId(createdRef);
                    if (!objectId) continue;
                    
                    console.log('Fetching created object to check type:', objectId);
                    const obj = await suiClient.getObject({
                      id: objectId,
                      options: { showType: true, showContent: false },
                    });
                    
                    const objectType = obj.data?.type;
                    console.log('Created object type:', objectType);
                    
                    if (objectType &&
                        (objectType.includes('::marketplace::AudioSubmission') ||
                         objectType.includes('::marketplace::DatasetSubmission'))) {
                      datasetId = objectId;
                      console.log('Found dataset ID from effects.created:', datasetId);
                      break;
                    }
                  } catch (err) {
                    console.warn('Failed to fetch created object:', err);
                    // Continue to next object
                  }
                }
              }
              
              // Fallback 3: Check effects.mutated for objects that might be our submission
              // Sometimes objects are created and immediately mutated in the same transaction
              if (!datasetId && txDetails.effects?.mutated) {
                console.log('Checking effects.mutated:', JSON.stringify(txDetails.effects.mutated, null, 2));
                
                for (const mutatedRef of txDetails.effects.mutated) {
                  try {
                    const objectId = extractObjectId(mutatedRef);
                    if (!objectId) continue;
                    
                    // Skip marketplace and coin objects we already saw
                    if (objectId === CHAIN_CONFIG.marketplaceId) continue;
                    
                    console.log('Fetching mutated object to check type:', objectId);
                    const obj = await suiClient.getObject({
                      id: objectId,
                      options: { showType: true, showContent: false },
                    });
                    
                    const objectType = obj.data?.type;
                    console.log('Mutated object type:', objectType);
                    
                    if (objectType &&
                        (objectType.includes('::marketplace::AudioSubmission') ||
                         objectType.includes('::marketplace::DatasetSubmission'))) {
                      datasetId = objectId;
                      console.log('Found dataset ID from effects.mutated:', datasetId);
                      break;
                    }
                  } catch (err) {
                    console.warn('Failed to fetch mutated object:', err);
                    // Continue to next object
                  }
                }
              }

              if (!datasetId) {
                console.error('Failed to extract dataset ID from transaction', {
                  objectChanges: txDetails.objectChanges,
                  events: txDetails.events,
                  effects: txDetails.effects,
                });
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
                    // backup_key: _uint8ArrayToBase64(file.backupKey), // TODO: Add backupKey to FileUploadResult type
                    blob_id: file.blobId,
                    preview_blob_id: file.previewBlobId ?? null,
                    duration_seconds: Math.max(1, Math.floor(file.duration)),
                    mime_type: file.mimeType || walrusUpload.mimeType || 'audio/mpeg',
                    preview_mime_type: file.previewMimeType ?? walrusUpload.previewMimeType ?? null,
                  }))
                : [{
                    file_index: 0,
                    seal_policy_id: walrusUpload.seal_policy_id,
                    // backup_key: _uint8ArrayToBase64(walrusUpload.backupKey), // TODO: Add backupKey to WalrusUploadResult type
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

              // Include comprehensive dataset metadata
              const datasetMetadata = {
                title: metadata.title,
                description: metadata.description,
                languages: metadata.languages,
                tags: metadata.tags,
                per_file_metadata: metadata.perFileMetadata,
                audio_quality: metadata.audioQuality || null, // Optional - null if not provided
                speakers: metadata.speakers || null, // Optional - null if not provided
                categorization: metadata.categorization,
              };

              const metadataResponse = await fetch(`/api/datasets/${datasetId}/seal-metadata`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  files,
                  verification: verificationMetadata,
                  metadata: datasetMetadata,
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
                  {(metadata.languages || []).join(', ') || 'Not specified'}
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
                  A fixed upload fee of <span className="text-sonar-signal font-mono">{UPLOAD_FEE_LABEL}</span> is required to publish your dataset on mainnet. This helps prevent spam uploads while tokenomics launch is pending.
                </p>
                <div className="p-3 rounded-sonar bg-sonar-abyss/30">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-sonar-highlight/70">
                      Estimated Fee:
                    </span>
                    <span className="font-mono font-bold text-sonar-signal">
                      {UPLOAD_FEE_LABEL}
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
