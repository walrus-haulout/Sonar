'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Upload, Shield, CheckCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AudioFile, EncryptionResult, FileUploadResult } from '@/lib/types/upload';
import { GlassCard } from '@/components/ui/GlassCard';
import { useSealEncryption } from '@/hooks/useSeal';
import { useWalrusUpload, generatePreviewBlob } from '@/hooks/useWalrusUpload';
import { PACKAGE_ID } from '@/lib/sui/client';

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

type EncryptionStage = 'encrypting' | 'generating-preview' | 'uploading-walrus' | 'finalizing' | 'completed';

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

  const { isReady, encrypt, error: sealError } = useSealEncryption();
  const { uploadWithPreview } = useWalrusUpload();

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

  const performEncryptionAndUpload = async () => {
    try {
      const totalFiles = filesToProcess.length;
      setStage('encrypting');
      setProgress(0);

      // Process files in parallel
      const filePromises = filesToProcess.map(async (file, index) => {
        // Encrypt
        const encryptionResult = await encrypt(
          file.file,
          {
            accessPolicy: 'purchase',
            packageId: PACKAGE_ID
          },
          (progressPercent) => {
            const fileProgress = (index + progressPercent / 100) / totalFiles;
            setProgress(Math.min(fileProgress * 60, 60));
          }
        );

        // Generate preview
        const previewBlob = await generatePreviewBlob(file);

        // Upload to Walrus
        const uploadData = {
          encryptedBlob: new Blob([new Uint8Array(encryptionResult.encryptedData)]),
          seal_policy_id: encryptionResult.identity,
          backupKey: encryptionResult.backupKey,
          metadata: encryptionResult.metadata,
        };

        const walrusResult = await uploadWithPreview(uploadData, previewBlob);

        return {
          fileId: file.id!,
          blobId: walrusResult.blobId,
          previewBlobId: walrusResult.previewBlobId,
          seal_policy_id: encryptionResult.identity,
          backupKey: encryptionResult.backupKey,
          duration: file.duration,
          metadata: encryptionResult.metadata,
          encryptedData: encryptionResult.encryptedData,
        };
      });

      setStage('uploading-walrus');
      const results = await Promise.all(filePromises);
      setCompletedFiles(results);
      setProgress(80);

      // Finalize
      setStage('finalizing');
      setProgress(90);
      await new Promise((resolve) => setTimeout(resolve, 500));
      setProgress(100);

      // Prepare final result
      const result = results[0];
      const bundleDiscountBps = totalFiles >= 6 ? 2000 : totalFiles >= 2 ? 1000 : 0;

      const finalResult = {
        encryptedBlob: new Blob([new Uint8Array(result.encryptedData)]),
        seal_policy_id: result.seal_policy_id,
        backupKey: result.backupKey,
        metadata: result.metadata,
        previewBlob: await generatePreviewBlob(filesToProcess[0]),
        walrusBlobId: result.blobId,
        previewBlobId: result.previewBlobId,
        files: isMultiFile ? results : undefined,
        bundleDiscountBps: isMultiFile ? bundleDiscountBps : undefined,
      };

      setStage('completed');
      setTimeout(() => {
        onEncrypted(finalResult);
      }, 1000);

    } catch (error) {
      console.error('Encryption or upload failed:', error);
      onError(error instanceof Error ? error.message : 'Encryption or upload failed');
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
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
