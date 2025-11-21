'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Upload, Shield, CheckCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AudioFile, EncryptionResult, FileUploadResult } from '@/lib/types/upload';
import { GlassCard } from '@/components/ui/GlassCard';
import { useSealEncryption } from '@/hooks/useSeal';
import { useWalrusParallelUpload } from '@/hooks/useWalrusParallelUpload';
import { CHAIN_CONFIG } from '@/lib/sui/client';
import { bytesToHex } from '@sonar/seal';

/**
 * Generate preview blob from audio file
 * Extracts first 30 seconds at lower quality
 */
async function generatePreviewBlob(audioFile: AudioFile): Promise<Blob> {
  // TODO: Implement actual preview generation using Web Audio API
  // For now, just return a small portion of the original file
  const chunkSize = Math.min(audioFile.file.size, 1024 * 1024); // 1MB max
  const snippet = audioFile.file.slice(0, chunkSize);
  const resolvedType = audioFile.mimeType || audioFile.file.type || 'application/octet-stream';
  return new Blob([snippet], {
    type: resolvedType,
  });
}

interface EncryptionStepProps {
  audioFile: AudioFile; // Backwards compatibility (single file)
  audioFiles?: AudioFile[]; // Multi-file support
  onEncrypted: (result: EncryptionResult & {
    walrusBlobId: string;
    previewBlobId?: string;
    files?: FileUploadResult[]; // Per-file results for multi-file
    bundleDiscountBps?: number;
  }) => void;
  onError: (error: string) => void;
}

type EncryptionStage = 'encrypting' | 'generating-preview' | 'uploading-walrus' | 'registering' | 'finalizing' | 'completed';

/**
 * EncryptionStep Component
 * Handles client-side Seal encryption and Walrus upload
 */
export function EncryptionStep({
  audioFile,
  audioFiles = [],
  onEncrypted,
  onError,
}: EncryptionStepProps) {
  const filesToProcess = audioFiles.length > 0 ? audioFiles : [audioFile];
  const isMultiFile = audioFiles.length > 0;

  const [stage, setStage] = useState<EncryptionStage>('encrypting');
  const [progress, setProgress] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [completedFiles, setCompletedFiles] = useState<FileUploadResult[]>([]);
  const [logs, setLogs] = useState<string[]>([]);

  const { isReady, encrypt, error: sealError } = useSealEncryption();
  const { uploadBlob, progress: uploadProgress } = useWalrusParallelUpload();

  const addLog = (message: string) => {
    console.log('[EncryptionStep]', message);
    setLogs(prev => [...prev, message]);
  };

  useEffect(() => {
    if (isReady) {
      performEncryptionAndUpload();
    }
  }, [isReady]);

  useEffect(() => {
    if (sealError) {
      onError(sealError);
    }
  }, [sealError]);


  // Prevent tab close/refresh during upload
  useEffect(() => {
    const isUploading = stage !== 'completed' && progress > 0;

    if (!isUploading) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // Chrome requires returnValue to be set
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [stage, progress]);

  // Sync stage with upload progress
  useEffect(() => {
    if (uploadProgress.stage === 'registering') {
      setStage('registering');
    }
  }, [uploadProgress.stage]);

  const performEncryptionAndUpload = async () => {
    try {
      const totalFiles = filesToProcess.length;
      setStage('encrypting');
      setProgress(0);
      setLogs([]);

      addLog(`Starting upload flow for ${totalFiles} file${totalFiles > 1 ? 's' : ''}`);

      // Check for pending uploads (Recovery Flow)
      try {
        const pending = JSON.parse(localStorage.getItem('pending_uploads') || '{}');
        const allFilesUploaded = filesToProcess.every(f =>
          pending[f.id!] && pending[f.id!].status === 'uploaded' && pending[f.id!].walrusBlobId
        );

        if (allFilesUploaded) {
          addLog('Found previously uploaded files. Resuming recovery flow...');

          const results = filesToProcess.map((f, index) => {
            const p = pending[f.id!];
            return {
              file_index: index,
              fileId: f.id!,
              blobId: p.walrusBlobId,
              previewBlobId: p.previewBlobId,
              seal_policy_id: p.sealPolicyId,
              encryptedObjectBcsHex: p.encryptedObjectBcsHex || '',
              duration: p.duration,
              metadata: p.metadata,
              encryptedData: new Uint8Array(0), // Data not needed for verification (fetches from Walrus)
              mimeType: p.metadata.originalMimeType,
              previewMimeType: p.metadata.originalMimeType,
            };
          });

          setCompletedFiles(results);
          setStage('finalizing');
          setProgress(100);

          // Prepare final result immediately
          const result = results[0];
          const bundleDiscountBps = totalFiles >= 6 ? 2000 : totalFiles >= 2 ? 1000 : 0;

          const finalResult = {
            encryptedBlob: new Blob([]), // Empty blob as we don't have data
            seal_policy_id: result.seal_policy_id,
            encryptedObjectBcsHex: result.encryptedObjectBcsHex,
            metadata: result.metadata,
            previewBlob: new Blob([]), // Empty preview
            walrusBlobId: result.blobId,
            previewBlobId: result.previewBlobId,
            files: isMultiFile ? results : undefined,
            bundleDiscountBps: isMultiFile ? bundleDiscountBps : undefined,
            mimeType: result.mimeType,
            previewMimeType: result.previewMimeType,
          };

          addLog('Resumed successfully from local storage');
          setTimeout(() => {
            onEncrypted(finalResult);
          }, 500);
          return;
        }
      } catch (e) {
        console.warn('Failed to check pending uploads:', e);
      }

      // Step 1: Determine file size and strategy
      const totalSize = filesToProcess.reduce((sum, f) => sum + f.file.size, 0);
      addLog(`Total file size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
      addLog('Upload strategy: Blockberry HTTP API');

      // Step 2: Process files in parallel
      const filePromises = filesToProcess.map(async (file, index) => {
        addLog(`[File ${index + 1}/${totalFiles}] Starting encryption: ${file.file.name}`);

        // Track pending upload for recovery
        try {
          const pending = JSON.parse(localStorage.getItem('pending_uploads') || '{}');
          pending[file.id!] = {
            fileName: file.file.name,
            fileSize: file.file.size,
            timestamp: Date.now(),
            status: 'encrypting',
          };
          localStorage.setItem('pending_uploads', JSON.stringify(pending));
        } catch (e) {
          console.error('Failed to save pending upload:', e);
        }

        // Encrypt
        const encryptionResult = await encrypt(
          file.file,
          {
            accessPolicy: 'purchase',
            packageId: CHAIN_CONFIG.packageId ?? undefined,
            useEnvelope: true, // Force envelope encryption for all files to keep encrypted object small
          },
          (progressPercent) => {
            const fileProgress = (index + progressPercent / 100) / totalFiles;
            setProgress(Math.min(fileProgress * 40, 40)); // 0-40% for encryption
            if (progressPercent % 25 === 0) {
              addLog(`[File ${index + 1}/${totalFiles}] Encryption progress: ${progressPercent}%`);
            }
          }
        );

        addLog(`[File ${index + 1}/${totalFiles}] Encryption complete - Policy ID: ${encryptionResult.identity.slice(0, 20)}...`);

        // Extract encrypted object BCS hex for verifier
        // For envelope encryption, extract sealed key from envelope
        // For direct encryption, use encryptedData directly
        if (encryptionResult.metadata.isEnvelope) {
          // Envelope format: [4 bytes key length][sealed key][encrypted file]
          // Sealed key size (~150-800 bytes) is constant and independent of file size
          // It encrypts only the 32-byte AES key, not the file data itself
          // Extract sealed key (BCS-serialized encrypted object)
          // Use byteOffset to handle Uint8Array slices correctly
          const keyLengthView = new DataView(
            encryptionResult.encryptedData.buffer,
            encryptionResult.encryptedData.byteOffset,
            4
          );
          const sealedKeyLength = keyLengthView.getUint32(0, true); // little-endian

          // Validate sealed key length
          // Valid range depends on number of key servers (typically 2-7)
          // Minimum: ~150 bytes (2 servers), Maximum: ~800 bytes (7+ servers)
          if (sealedKeyLength < 150 || sealedKeyLength > 800) {
            addLog(
              `[File ${index + 1}/${totalFiles}] WARNING: Unexpected sealed key length: ${sealedKeyLength} (expected 150-800 for 2-7 key servers)`
            );
          }

          const sealedKey = encryptionResult.encryptedData.slice(4, 4 + sealedKeyLength);
          addLog(
            `[File ${index + 1}/${totalFiles}] Envelope extracted: keyLength=${sealedKeyLength}, totalSize=${encryptionResult.encryptedData.length}`
          );
        }

        // Create BCS-compatible encrypted object
        // For envelope encryption, we only need the sealed key (which is the encrypted object)
        // This is small (~200-800 bytes) and safe to pass around.
        let encryptedObjectBcsHex = '';

        if (encryptionResult.metadata.isEnvelope) {
          const keyLengthView = new DataView(
            encryptionResult.encryptedData.buffer,
            encryptionResult.encryptedData.byteOffset,
            4
          );
          const sealedKeyLength = keyLengthView.getUint32(0, true);
          const sealedKey = encryptionResult.encryptedData.slice(4, 4 + sealedKeyLength);
          encryptedObjectBcsHex = bytesToHex(sealedKey);

          addLog(`[File ${index + 1}/${totalFiles}] Extracted sealed key for verification (${sealedKey.length} bytes)`);
        } else {
          // Fallback for non-envelope (should not happen with current config)
          // We don't want to send the whole file as hex
          console.warn('Non-envelope encryption detected, skipping encryptedObjectBcsHex');
        }

        // Generate preview
        setStage('generating-preview');
        const previewBlob = await generatePreviewBlob(file);
        addLog(`[File ${index + 1}/${totalFiles}] Preview generated (${(previewBlob.size / 1024).toFixed(2)} KB)`);

        const resolvedMimeType = file.mimeType || file.file.type || '';
        const previewMimeType = previewBlob.type || resolvedMimeType || undefined;
        const metadataWithMime = {
          ...encryptionResult.metadata,
          originalMimeType: resolvedMimeType,
          originalFileName: file.file.name,
        };

        // Step 3: Upload to Walrus using parallel upload hook
        setStage('uploading-walrus');
        addLog(`[File ${index + 1}/${totalFiles}] Uploading to Walrus via ${strategy}... (Attempt ${uploadProgress.currentRetry ?? 1}/${uploadProgress.maxRetries ?? 10})`);

        const encryptedBlob = new Blob([new Uint8Array(encryptionResult.encryptedData)]);
        try {
          const walrusResult = await uploadBlob(
            encryptedBlob,
            encryptionResult.identity,
            metadataWithMime,
            {
              previewBlob,
              previewMimeType,
              mimeType: resolvedMimeType,
            }
          );

          addLog(`[File ${index + 1}/${totalFiles}] Upload complete - Blob ID: ${walrusResult.blobId}`);

        // Update pending upload with blob ID
        try {
          const pending = JSON.parse(localStorage.getItem('pending_uploads') || '{}');
          if (pending[file.id!]) {
            pending[file.id!] = {
              ...pending[file.id!],
              status: 'uploaded',
              walrusBlobId: walrusResult.blobId,
              previewBlobId: walrusResult.previewBlobId,
              sealPolicyId: encryptionResult.identity,
              encryptedObjectBcsHex, // Save for verification
              duration: file.duration,
              // Store minimal metadata needed for registration
              metadata: {
                originalMimeType: resolvedMimeType,
                originalFileName: file.file.name,
              }
            };
            localStorage.setItem('pending_uploads', JSON.stringify(pending));
          }
        } catch (e) {
          console.error('Failed to update pending upload:', e);
        }

          const completedProgress = ((index + 1) / totalFiles) * 40; // 40-80% for upload
          setProgress(40 + completedProgress);

          return {
            file_index: index,
            fileId: file.id!,
            blobId: walrusResult.blobId,
            previewBlobId: walrusResult.previewBlobId,
            seal_policy_id: encryptionResult.identity,
            encryptedObjectBcsHex, // BCS-serialized encrypted object for verifier
            duration: file.duration,
            metadata: metadataWithMime,
            encryptedData: encryptionResult.encryptedData,
            mimeType: resolvedMimeType,
            previewMimeType,
          };
        } catch (uploadError) {
          // Re-throw with context for better error messaging
          const isPreviewError = uploadError instanceof Error && uploadError.message.includes('Preview upload failed');
          if (isPreviewError) {
            addLog(`[File ${index + 1}/${totalFiles}] CRITICAL: Preview upload failed - upload cannot proceed. ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`);
          }
          throw uploadError;
        }
      });

      const results = await Promise.all(filePromises);
      setCompletedFiles(results);

      // Step 4: Finalize
      setStage('finalizing');
      setProgress(90);
      addLog('Finalizing upload...');
      await new Promise((resolve) => setTimeout(resolve, 500));
      setProgress(100);

      // Prepare final result
      const result = results[0];
      const bundleDiscountBps = totalFiles >= 6 ? 2000 : totalFiles >= 2 ? 1000 : 0;

      const finalResult = {
        encryptedBlob: new Blob([new Uint8Array(result.encryptedData)]),
        seal_policy_id: result.seal_policy_id,
        encryptedObjectBcsHex: result.encryptedObjectBcsHex, // Include for verifier
        metadata: result.metadata,
        previewBlob: await generatePreviewBlob(filesToProcess[0]),
        walrusBlobId: result.blobId,
        previewBlobId: result.previewBlobId,
        files: isMultiFile ? results : undefined,
        bundleDiscountBps: isMultiFile ? bundleDiscountBps : undefined,
        mimeType: result.mimeType,
        previewMimeType: result.previewMimeType,
      };

      setStage('completed');
      addLog('SUCCESS! Upload flow completed');

      setTimeout(() => {
        onEncrypted(finalResult);
      }, 1000);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Encryption or upload failed';
      console.error('Encryption or upload failed:', error);
      addLog(`ERROR: ${errorMessage}`);
      onError(errorMessage);
    }
  };

  const stages: Array<{ key: EncryptionStage; label: string; icon: React.ReactNode }> = [
    {
      key: 'encrypting',
      label: 'Encrypting with Mysten Seal',
      icon: <Lock className="w-5 h-5" />,
    },
    {
      key: 'generating-preview',
      label: 'Generating Preview',
      icon: <Shield className="w-5 h-5" />,
    },
    {
      key: 'uploading-walrus',
      label: 'Uploading to Walrus',
      icon: <Upload className="w-5 h-5" />,
    },
    {
      key: 'registering',
      label: 'Registering on-chain',
      icon: <Shield className="w-5 h-5" />,
    },
    {
      key: 'finalizing',
      label: 'Finalizing',
      icon: <CheckCircle className="w-5 h-5" />,
    },
  ];

  const currentStageIndex = stages.findIndex((s) => s.key === stage);
  const isUploading = stage !== 'completed' && progress > 0;

  return (
    <div className="space-y-6">
      {/* Warning Banner */}
      {isUploading && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'p-4 rounded-sonar',
            'bg-sonar-coral/10 border-2 border-sonar-coral',
            'flex items-start space-x-3'
          )}
        >
          <AlertTriangle className="w-5 h-5 text-sonar-coral mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-mono font-semibold text-sonar-coral mb-1">
              Do Not Close This Tab
            </p>
            <p className="text-sm text-sonar-highlight/80">
              Your upload is in progress. Closing or refreshing this browser tab will
              interrupt the upload process and you'll need to start over.
            </p>
          </div>
        </motion.div>
      )}

      {/* Progress Circle */}
      <div className="flex flex-col items-center justify-center py-8">
        <div className="relative w-48 h-48">
          {/* Background Circle */}
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="96"
              cy="96"
              r="88"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              className="text-sonar-blue/20"
            />
            {/* Progress Circle */}
            <motion.circle
              cx="96"
              cy="96"
              r="88"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              strokeDasharray={552.92} // 2 * PI * 88
              strokeDashoffset={552.92 * (1 - progress / 100)}
              strokeLinecap="round"
              className="text-sonar-signal"
              initial={{ strokeDashoffset: 552.92 }}
              animate={{ strokeDashoffset: 552.92 * (1 - progress / 100) }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
            />
          </svg>

          {/* Center Content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.div
              key={stage}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-sonar-signal mb-2"
            >
              {stages[currentStageIndex]?.icon}
            </motion.div>
            <motion.div
              key={`progress-${Math.floor(progress)}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl font-mono font-bold text-sonar-highlight-bright"
            >
              {Math.round(progress)}%
            </motion.div>
          </div>
        </div>

        {/* Current Stage Label */}
        <motion.p
          key={stage}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 text-lg font-mono text-sonar-highlight-bright"
        >
          {stages[currentStageIndex]?.label}
          {uploadProgress.currentRetry && uploadProgress.currentRetry > 1 && (
            <span className="text-sm text-sonar-coral ml-2">
              (Retry {uploadProgress.currentRetry}/{uploadProgress.maxRetries})
            </span>
          )}
        </motion.p>

        {/* Multi-file progress indicator */}
        {isMultiFile && (
          <motion.p
            key={`file-${currentFileIndex}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-2 text-sm font-mono text-sonar-highlight/70"
          >
            Processing {filesToProcess.length} files in parallel
          </motion.p>
        )}
      </div>

      {/* Stage List */}
      <div className="space-y-3">
        {stages.map((stageInfo, index) => {
          const isCompleted = index < currentStageIndex;
          const isCurrent = index === currentStageIndex;
          const isPending = index > currentStageIndex;

          return (
            <motion.div
              key={stageInfo.key}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <GlassCard
                className={cn(
                  'transition-all duration-300',
                  isCurrent && 'bg-sonar-signal/10 border border-sonar-signal',
                  isCompleted && 'opacity-70'
                )}
              >
                <div className="flex items-center space-x-4">
                  <div
                    className={cn(
                      'p-3 rounded-sonar transition-colors',
                      isCompleted && 'bg-sonar-signal/20 text-sonar-signal',
                      isCurrent && 'bg-sonar-signal/30 text-sonar-signal animate-pulse',
                      isPending && 'bg-sonar-blue/10 text-sonar-blue/50'
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : (
                      stageInfo.icon
                    )}
                  </div>

                  <div className="flex-1">
                    <p
                      className={cn(
                        'font-mono font-semibold',
                        isCompleted && 'text-sonar-highlight/70',
                        isCurrent && 'text-sonar-highlight-bright',
                        isPending && 'text-sonar-highlight/50'
                      )}
                    >
                      {stageInfo.label}
                    </p>
                  </div>

                  {isCompleted && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="text-sonar-signal"
                    >
                      <CheckCircle className="w-6 h-6" />
                    </motion.div>
                  )}
                </div>
              </GlassCard>
            </motion.div>
          );
        })}
      </div>

      {/* Info Box */}
      <GlassCard className="bg-sonar-blue/5">
        <div className="flex items-start space-x-3">
          <Shield className="w-5 h-5 text-sonar-blue mt-0.5 flex-shrink-0" />
          <div className="text-sm text-sonar-highlight/80 space-y-2">
            <p className="font-mono font-semibold text-sonar-blue">
              Secure Processing
            </p>
            <p>
              Your audio is being encrypted client-side using Mysten Seal. The
              encrypted data is then uploaded to Walrus decentralized storage.
              Only you control the decryption keys.
              {isMultiFile && ' Multiple files are processed in parallel for faster uploads.'}
            </p>
            {uploadProgress.currentRetry && uploadProgress.currentRetry > 1 && (
              <p className="text-sonar-coral">
                Retrying upload (Attempt {uploadProgress.currentRetry}/{uploadProgress.maxRetries})...
              </p>
            )}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
