'use client';

import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Brain, Shield, FileText, CheckCircle, AlertCircle, Clock, Music, Copyright } from 'lucide-react';
import { useSignPersonalMessage } from '@mysten/dapp-kit';
import { cn } from '@/lib/utils';
import { useSeal } from '@/hooks/useSeal';
import {
  DatasetMetadata,
  VerificationResult,
  VerificationStage,
  AudioFile,
  WalrusUploadResult,
} from '@/lib/types/upload';
import { SonarButton } from '@/components/ui/SonarButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { RadarScanTarget } from '@/components/animations/RadarScanTarget';
import { DataAccessNotice } from '@/components/upload/DataAccessNotice';

interface VerificationStepProps {
  audioFile?: AudioFile; // Optional - for backwards compatibility
  audioFiles?: AudioFile[]; // Optional - for backwards compatibility
  metadata: DatasetMetadata;
  // New: encrypted blob info from encryption step
  walrusBlobId?: string;
  sealIdentity?: string;
  encryptedObjectBcsHex?: string;
  walrusUpload?: WalrusUploadResult; // Alternative: pass full upload result
  onVerificationComplete: (result: VerificationResult) => void;
  onError: (error: string) => void;
}

interface StageInfo {
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number;
}

/**
 * VerificationStep Component
 * Mandatory AI verification before encryption using audio-verifier service
 */
export function VerificationStep({
  audioFile,
  audioFiles,
  metadata,
  walrusBlobId,
  sealIdentity,
  encryptedObjectBcsHex,
  walrusUpload,
  onVerificationComplete,
  onError,
}: VerificationStepProps) {
  // Hooks for wallet interaction
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const { createSession, sessionKey, decrypt } = useSeal();

  // State
  const [verificationState, setVerificationState] = useState<'idle' | 'waiting-auth' | 'running' | 'completed' | 'failed'>('idle');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [dataAccessAcknowledged, setDataAccessAcknowledged] = useState(false);
  const [stages, setStages] = useState<StageInfo[]>([
    { name: 'decryption', status: 'pending', progress: 0 },
    { name: 'quality', status: 'pending', progress: 0 },
    { name: 'copyright', status: 'pending', progress: 0 },
    { name: 'transcription', status: 'pending', progress: 0 },
    { name: 'analysis', status: 'pending', progress: 0 },
  ]);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<any>(null);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasStartedRef = useRef(false); // Guard against React 18 Strict Mode double-mount

  // Auto-start verification when component mounts
  useEffect(() => {
    // Log props received
    console.log('[VerificationStep] Props received:', {
      hasWalrusUpload: !!walrusUpload,
      walrusUploadBlobId: walrusUpload?.blobId,
      walrusUploadSealPolicyId: walrusUpload?.seal_policy_id?.slice(0, 20),
      walrusUploadEncryptedHex: walrusUpload?.encryptedObjectBcsHex ? 'present' : 'missing',
      encryptedObjectBcsHexLength: walrusUpload?.encryptedObjectBcsHex?.length ?? 0,
      hasLegacyProps: !!(walrusBlobId || sealIdentity || encryptedObjectBcsHex),
    });

    // Prevent duplicate requests in React 18 Strict Mode
    if (hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;
    // Move to waiting-auth state - user needs to authorize first
    setVerificationState('waiting-auth');

    // Cleanup polling on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Request user authorization for verification
   * Creates a SessionKey with wallet signature
   */
  const handleAuthorizeVerification = async () => {
    console.log('[VerificationStep] Requesting user authorization...');
    setIsCreatingSession(true);
    setErrorMessage(null);

    try {
      // Create session with wallet signature
      const session = await createSession({
        signMessage: async (message: Uint8Array) => {
          const result = await signPersonalMessage({ message });
          return { signature: result.signature };
        },
      });

      console.log('[VerificationStep] Session created and cached in IndexedDB');
      setVerificationState('running');
      setIsCreatingSession(false);

      // Now start the actual verification with session key
      startVerification();
    } catch (error: any) {
      console.error('[VerificationStep] Failed to create session:', error);
      setErrorMessage(error.message || 'Failed to create authorization session');
      setIsCreatingSession(false);
    }
  };

  const startVerification = async () => {
    console.log('[VerificationStep] Starting verification...');
    setErrorMessage(null);
    setErrorDetails(null);

    // Determine if we're using encrypted blob flow or legacy file flow
    const useEncryptedFlow = !!(walrusUpload || (walrusBlobId && sealIdentity && encryptedObjectBcsHex));
    console.log('[VerificationStep] Using encrypted flow:', useEncryptedFlow, {
      hasWalrusUpload: !!walrusUpload,
      walrusUploadBlobId: walrusUpload?.blobId,
      walrusUploadEncryptedHex: !!walrusUpload?.encryptedObjectBcsHex,
      hasLegacyWalrusBlobId: !!walrusBlobId,
      hasSealIdentity: !!sealIdentity,
      hasLegacyEncryptedHex: !!encryptedObjectBcsHex,
    });

    if (useEncryptedFlow) {
      // New encrypted blob flow
      const blobId = walrusUpload?.blobId || walrusBlobId!;
      const identity = walrusUpload?.seal_policy_id || sealIdentity!;
      const encryptedObjectHex = walrusUpload?.encryptedObjectBcsHex || encryptedObjectBcsHex;

      console.log('[VerificationStep] Extracted values from walrusUpload:', {
        blobId,
        identityPrefix: identity?.slice(0, 20),
        encryptedObjectHexPresent: !!encryptedObjectHex,
        encryptedObjectHexLength: encryptedObjectHex?.length ?? 0,
      });

      // Validate that encryptedObjectBcsHex is present and not empty
      if (!encryptedObjectHex || encryptedObjectHex.trim().length === 0) {
        const errorMsg = 'Missing encrypted object data. Please try encrypting again.';
        console.error('[VerificationStep] Validation failed:', errorMsg);
        console.error('[VerificationStep] Missing data:', {
          blobId,
          identity: identity?.slice(0, 20),
          encryptedObjectHex: encryptedObjectHex ? 'present' : 'missing',
          walrusUploadPresent: !!walrusUpload,
          walrusUploadEncryptedHexPresent: !!walrusUpload?.encryptedObjectBcsHex,
        });
        setErrorMessage(errorMsg);
        setVerificationState('failed');
        onError(errorMsg);
        return;
      }

      console.log('[VerificationStep] Validation passed. Starting encrypted blob verification...');

      setTotalFiles(1);
      setCurrentFileIndex(0);

      await verifyEncryptedBlob(blobId, identity, encryptedObjectHex);
    } else {
      // Legacy file upload flow (for backwards compatibility)
      if (!audioFile && (!audioFiles || audioFiles.length === 0)) {
        setErrorMessage('No audio file or encrypted blob provided');
        setVerificationState('failed');
        onError('No audio file or encrypted blob provided');
        return;
      }

      const filesToVerify = audioFiles && audioFiles.length > 0 ? audioFiles : [audioFile!];
      setTotalFiles(filesToVerify.length);
      setCurrentFileIndex(0);

      // Verify files sequentially
      await verifyNextFile(filesToVerify, 0);
    }
  };

  const verifyNextFile = async (files: AudioFile[], fileIndex: number) => {
    if (fileIndex >= files.length) {
      // All files verified successfully
      const finalResult: VerificationResult = {
        id: verificationId || 'multi-file-verification',
        state: 'completed',
        currentStage: 'completed',
        stages: [
          { name: 'decryption', status: 'completed', progress: 100 },
          { name: 'quality', status: 'completed', progress: 100 },
          { name: 'copyright', status: 'completed', progress: 100 },
          { name: 'transcription', status: 'completed', progress: 100 },
          { name: 'analysis', status: 'completed', progress: 100 },
        ],
        qualityScore: 1.0, // Overall pass
        safetyPassed: true,
        insights: [`Successfully verified ${files.length} file(s)`],
        updatedAt: Date.now(),
      };
      setResult(finalResult);
      setVerificationState('completed');
      onVerificationComplete(finalResult);
      return;
    }

    setCurrentFileIndex(fileIndex);

    // Reset stages for current file
    setStages([
      { name: 'decryption', status: 'completed', progress: 100 }, // N/A for legacy file flow
      { name: 'quality', status: 'pending', progress: 0 },
      { name: 'copyright', status: 'pending', progress: 0 },
      { name: 'transcription', status: 'pending', progress: 0 },
      { name: 'analysis', status: 'pending', progress: 0 },
    ]);

    try {
      // Prepare form data with raw audio file (BEFORE encryption!)
      const formData = new FormData();
      formData.append('file', files[fileIndex].file);
      formData.append('metadata', JSON.stringify(metadata));

      // Call server-side API (proxies to audio-verifier with secure token)
      const response = await fetch('/api/verify', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const { verificationId: id } = data;

      setVerificationId(id);

      // Start polling for verification status
      startPolling(id, files, fileIndex);

    } catch (error: any) {
      console.error('Failed to start verification:', error);
      setErrorMessage(error.message || 'Failed to start verification');
      setVerificationState('failed');
      onError(error.message || 'Verification failed to start');
    }
  };

  const verifyEncryptedBlob = async (
    walrusBlobId: string,
    sealIdentity: string,
    encryptedObjectBcsHex: string
  ) => {
    try {
      if (!sessionKey) {
        throw new Error('No active session. Please authorize verification first.');
      }

      console.log('[VerificationStep] Fetching encrypted blob from Walrus:', walrusBlobId);

      // Stage 1: Fetch encrypted blob from Walrus (via proxy endpoint)
      setStages((prev) =>
        prev.map((stage) =>
          stage.name === 'decryption'
            ? { ...stage, status: 'in_progress', progress: 10 }
            : stage
        )
      );

      const blobResponse = await fetch(`/api/edge/walrus/proxy/${walrusBlobId}`);

      if (!blobResponse.ok) {
        throw new Error(
          `Failed to fetch encrypted blob from Walrus: ${blobResponse.statusText}`
        );
      }

      const encryptedArrayBuffer = await blobResponse.arrayBuffer();
      const encryptedBlob = new Uint8Array(encryptedArrayBuffer);

      console.log(
        '[VerificationStep] Encrypted blob fetched, size:',
        encryptedBlob.length,
        'bytes'
      );

      // Stage 2: Decrypt using sessionKey
      setStages((prev) =>
        prev.map((stage) =>
          stage.name === 'decryption'
            ? { ...stage, status: 'in_progress', progress: 30 }
            : stage
        )
      );

      console.log('[VerificationStep] Decrypting blob with sessionKey...');

      const decryptionResult = await decrypt(
        encryptedBlob,
        sealIdentity,
        undefined, // Use default options
        (progress) => {
          // Update progress: progress is 0-1, map to 30-80% for decryption stage
          const progressPercent = 30 + Math.floor(progress * 50);
          setStages((prev) =>
            prev.map((stage) =>
              stage.name === 'decryption'
                ? { ...stage, progress: progressPercent }
                : stage
            )
          );
        }
      );

      console.log(
        '[VerificationStep] Blob decrypted successfully, size:',
        decryptionResult.data.length,
        'bytes'
      );

      // Mark decryption as complete
      setStages((prev) =>
        prev.map((stage) =>
          stage.name === 'decryption'
            ? { ...stage, status: 'completed', progress: 100 }
            : stage
        )
      );

      // Stage 3: Send decrypted audio to backend for verification
      console.log('[VerificationStep] Sending decrypted audio to backend for verification');

      const decryptedBlob = new Blob([new Uint8Array(decryptionResult.data)], {
        type: 'audio/mpeg',
      });

      const formData = new FormData();
      formData.append('file', decryptedBlob, 'decrypted-audio.mp3');
      formData.append('metadata', JSON.stringify(metadata));

      const response = await fetch('/api/verify', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.detail ||
            errorData.error ||
            `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const data = await response.json();
      const { verificationId: id } = data;

      setVerificationId(id);

      // Start polling for verification status
      startPollingEncrypted(id);
    } catch (error: any) {
      console.error('[VerificationStep] Failed to decrypt and verify:', error);
      setErrorMessage(error.message || 'Failed to decrypt and verify audio');
      setVerificationState('failed');
      onError(error.message || 'Decryption or verification failed');
    }
  };

  const startPollingEncrypted = (sessionObjectId: string) => {
    // Poll every 2 seconds
    const interval = setInterval(async () => {
      try {
        // Call server-side API (proxies to audio-verifier with secure token)
        const response = await fetch(`/api/verify/${sessionObjectId}`);

        if (!response.ok) {
          throw new Error(`Failed to poll verification: ${response.status}`);
        }

        const session = await response.json();

        // Parse response based on new API contract
        const currentStage = session.currentStage || session.stage || 'quality';
        const progress = session.progress || 0;
        const approved = session.approved ?? false;
        const qualityScore = session.qualityScore ?? 0;
        const safetyPassed = session.safetyPassed ?? false;
        const analysis = session.analysis || {};
        const errors = session.errors || [];

        // Update stages based on current stage
        updateStagesFromSession({
          stage: currentStage,
          progress,
        });

        // Check if completed or failed
        if (session.state === 'completed' || session.approved !== undefined) {
          clearInterval(interval);
          pollingIntervalRef.current = null;

          // Check if approved
          if (!approved) {
            // Verification failed validation
            setVerificationState('failed');
            setErrorMessage(errors[0] || 'Verification failed quality, copyright, or safety checks');
            setErrorDetails({ ...session, errors });
            onError(errors[0] || 'Verification checks failed');
            return;
          }

          // Verification passed
          const finalResult: VerificationResult = {
            id: sessionObjectId,
            state: 'completed',
            currentStage: 'completed',
            stages: [
              { name: 'decryption', status: 'completed', progress: 100 },
              { name: 'quality', status: 'completed', progress: 100 },
              { name: 'copyright', status: 'completed', progress: 100 },
              { name: 'transcription', status: 'completed', progress: 100 },
              { name: 'analysis', status: 'completed', progress: 100 },
            ],
            qualityScore: qualityScore / 100, // Convert 0-100 to 0-1
            safetyPassed,
            insights: analysis.insights || [],
            updatedAt: Date.now(),
          };

          setResult(finalResult);
          setVerificationState('completed');
          onVerificationComplete(finalResult);

        } else if (session.state === 'failed') {
          clearInterval(interval);
          pollingIntervalRef.current = null;

          setVerificationState('failed');
          setErrorMessage(errors[0] || 'Verification failed');
          setErrorDetails({ ...session, errors });
          onError(errors[0] || 'Verification failed');
        }

      } catch (error: any) {
        console.error('Polling error:', error);
        // Don't fail immediately on polling errors, keep trying
      }
    }, 2000);

    pollingIntervalRef.current = interval;
  };

  const startPolling = (id: string, files: AudioFile[], fileIndex: number) => {
    // Poll every 2 seconds
    const interval = setInterval(async () => {
      try {
        // Call server-side API (proxies to audio-verifier with secure token)
        const response = await fetch(`/api/verify/${id}`);

        if (!response.ok) {
          throw new Error(`Failed to poll verification: ${response.status}`);
        }

        const session = await response.json();

        // Update stages based on current stage
        updateStagesFromSession(session);

        // Check if completed or failed
        if (session.state === 'completed') {
          clearInterval(interval);
          pollingIntervalRef.current = null;

          // Check if approved
          if (!session.approved) {
            // Verification failed validation
            setVerificationState('failed');
            setErrorMessage('Verification failed quality, copyright, or safety checks');
            setErrorDetails(session);
            onError('Verification checks failed');
            return;
          }

          // This file passed, move to next file
          await verifyNextFile(files, fileIndex + 1);

        } else if (session.state === 'failed') {
          clearInterval(interval);
          pollingIntervalRef.current = null;

          setVerificationState('failed');
          setErrorMessage(session.errors?.[0] || 'Verification failed');
          setErrorDetails(session);
          onError(session.errors?.[0] || 'Verification failed');
        }

      } catch (error: any) {
        console.error('Polling error:', error);
        // Don't fail immediately on polling errors, keep trying
      }
    }, 2000);

    pollingIntervalRef.current = interval;
  };

  const updateStagesFromSession = (session: any) => {
    const currentStage = session.stage;
    const progress = session.progress || 0;

    const stageOrder = ['decryption', 'quality', 'copyright', 'transcription', 'analysis'];
    const currentIndex = stageOrder.indexOf(currentStage);

    setStages((prev) =>
      prev.map((stage, idx) => {
        if (idx < currentIndex) {
          return { ...stage, status: 'completed', progress: 100 };
        } else if (stage.name === currentStage) {
          return { ...stage, status: 'in_progress', progress: Math.round(progress * 100) };
        } else {
          return { ...stage, status: 'pending', progress: 0 };
        }
      })
    );
  };

  const stageConfig = {
    decryption: {
      icon: <Shield className="w-5 h-5" />,
      label: 'Decryption',
      description: 'Decrypting audio using your session key',
    },
    quality: {
      icon: <Music className="w-5 h-5" />,
      label: 'Quality Check',
      description: 'Analyzing audio quality, sample rate, and volume levels',
    },
    copyright: {
      icon: <Copyright className="w-5 h-5" />,
      label: 'Copyright Detection',
      description: 'Checking for copyrighted content using fingerprinting',
    },
    transcription: {
      icon: <FileText className="w-5 h-5" />,
      label: 'Transcription',
      description: 'Converting audio to text using Gemini AI',
    },
    analysis: {
      icon: <Brain className="w-5 h-5" />,
      label: 'AI Analysis',
      description: 'Analyzing quality, safety, and content value',
    },
  };

  return (
    <div className="space-y-6">
      {/* Waiting for User Authorization */}
      {verificationState === 'waiting-auth' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          {/* Data Access Notice */}
          <DataAccessNotice
            onAcknowledge={setDataAccessAcknowledged}
            disabled={isCreatingSession}
          />

          <GlassCard className="text-center py-8">
            <div className="flex justify-center mb-4">
              <div className="p-6 rounded-full bg-sonar-signal/10">
                <Shield className="w-12 h-12 text-sonar-signal" />
              </div>
            </div>
            <h3 className="text-2xl font-mono font-bold text-sonar-highlight-bright mb-2">
              Authorize Verification
            </h3>
            <p className="text-sonar-highlight/70 max-w-2xl mx-auto mb-6">
              Sign with your Sui wallet to authorize Sonar to verify your encrypted audio with secure key server authentication.
            </p>
            <p className="text-sm text-sonar-highlight/50 mb-8">
              Your signature proves you own this audio and authorizes temporary key access for verification.
            </p>
            <SonarButton
              onClick={handleAuthorizeVerification}
              disabled={isCreatingSession || !dataAccessAcknowledged}
              className="w-full"
            >
              {isCreatingSession ? 'Signing...' : 'Sign & Authorize'}
            </SonarButton>
            {errorMessage && (
              <div className="mt-4 p-3 rounded-sonar bg-sonar-coral/10 border border-sonar-coral/20">
                <p className="text-sm text-sonar-coral">{errorMessage}</p>
              </div>
            )}
          </GlassCard>
        </motion.div>
      )}

      {/* Verification Running */}
      {(verificationState === 'running') && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          {/* Header */}
          <GlassCard className="text-center py-6">
            <div className="flex justify-center mb-4">
              <div className="p-6 rounded-full bg-sonar-signal/10">
                <Brain className="w-12 h-12 text-sonar-signal" />
              </div>
            </div>
            <h3 className="text-2xl font-mono font-bold text-sonar-highlight-bright mb-2">
              Verifying Audio Quality
            </h3>
            <p className="text-sonar-highlight/70 max-w-2xl mx-auto">
              Running comprehensive checks on your audio before encryption
            </p>
            {totalFiles > 1 && (
              <p className="text-sm text-sonar-signal mt-2 font-mono">
                File {currentFileIndex + 1} of {totalFiles}
              </p>
            )}
          </GlassCard>

          {/* Radar Animation */}
          <div className="flex justify-center py-6">
            <div className="relative w-48 h-48">
              <RadarScanTarget
                src="/images/walrus-icon.png"
                alt="Verification in Progress"
                size={192}
              />
            </div>
          </div>

          {/* Stage Progress */}
          <div className="space-y-3">
            {stages.map((stage) => {
              const config = stageConfig[stage.name as keyof typeof stageConfig];
              const isCompleted = stage.status === 'completed';
              const isActive = stage.status === 'in_progress';
              const isPending = stage.status === 'pending';

              return (
                <GlassCard
                  key={stage.name}
                  className={cn(
                    'transition-all duration-300',
                    isActive && 'bg-sonar-signal/10 border border-sonar-signal'
                  )}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div
                          className={cn(
                            'p-2 rounded-sonar transition-colors',
                            isCompleted && 'bg-sonar-signal/20 text-sonar-signal',
                            isActive && 'bg-sonar-signal/30 text-sonar-signal',
                            isPending && 'bg-sonar-blue/10 text-sonar-blue/50'
                          )}
                        >
                          {isCompleted ? <CheckCircle className="w-5 h-5" /> : config.icon}
                        </div>

                        <div>
                          <p
                            className={cn(
                              'font-mono font-semibold',
                              isCompleted && 'text-sonar-highlight/70',
                              isActive && 'text-sonar-highlight-bright',
                              isPending && 'text-sonar-highlight/50'
                            )}
                          >
                            {config.label}
                          </p>
                          <p className="text-xs text-sonar-highlight/50">
                            {config.description}
                          </p>
                        </div>
                      </div>

                      {isActive && (
                        <span className="text-sonar-signal font-mono text-sm">
                          {Math.round(stage.progress)}%
                        </span>
                      )}
                    </div>

                    {/* Progress Bar */}
                    {isActive && (
                      <div className="h-1 bg-sonar-blue/20 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-sonar-signal"
                          initial={{ width: 0 }}
                          animate={{ width: `${stage.progress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    )}
                  </div>
                </GlassCard>
              );
            })}
          </div>

          <GlassCard className="bg-sonar-blue/5 text-center">
            <div className="flex items-center justify-center space-x-2 text-sonar-highlight/70">
              <Clock className="w-4 h-4 animate-pulse" />
              <p className="text-sm font-mono">
                This may take 30-60 seconds...
              </p>
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Verification Complete */}
      {verificationState === 'completed' && result && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <GlassCard className="bg-sonar-signal/10 border border-sonar-signal">
            <div className="flex items-center space-x-4 mb-4">
              <CheckCircle className="w-8 h-8 text-sonar-signal" />
              <div>
                <h3 className="text-xl font-mono font-bold text-sonar-highlight-bright">
                  Verification Complete!
                </h3>
                <p className="text-sm text-sonar-highlight/70">
                  Your audio passed all quality and safety checks
                </p>
              </div>
            </div>

            {/* Quality Score */}
            {result.qualityScore !== undefined && (
              <div className="mt-4 p-4 rounded-sonar bg-sonar-abyss/30">
                <p className="text-sm font-mono text-sonar-highlight/70 mb-2">
                  Quality Score
                </p>
                <div className="flex items-center space-x-3">
                  <div className="flex-1 h-2 bg-sonar-blue/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-sonar-signal to-sonar-blue"
                      style={{ width: `${result.qualityScore * 100}%` }}
                    />
                  </div>
                  <span className="text-2xl font-mono font-bold text-sonar-signal">
                    {Math.round(result.qualityScore * 100)}%
                  </span>
                </div>
              </div>
            )}

            {/* Insights */}
            {result.insights && result.insights.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-mono font-semibold text-sonar-highlight-bright">
                  AI Insights:
                </p>
                {result.insights.map((insight, idx) => (
                  <div
                    key={idx}
                    className="flex items-start space-x-2 text-sm text-sonar-highlight/80"
                  >
                    <span className="text-sonar-signal">•</span>
                    <span>{insight}</span>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard className="bg-sonar-blue/5">
            <p className="text-sm text-sonar-highlight/70 text-center">
              ✓ Your audio has been verified and is ready for encryption
            </p>
          </GlassCard>
        </motion.div>
      )}

      {/* Verification Failed */}
      {verificationState === 'failed' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <GlassCard className="bg-sonar-coral/10 border border-sonar-coral">
            <div className="flex items-center space-x-4 mb-4">
              <AlertCircle className="w-8 h-8 text-sonar-coral" />
              <div>
                <h3 className="text-xl font-mono font-bold text-sonar-coral">
                  Verification Failed
                </h3>
                <p className="text-sm text-sonar-highlight/70">
                  {errorMessage || 'Your audio did not pass verification checks'}
                </p>
              </div>
            </div>

            {/* Error Details */}
            {errorDetails && (
              <div className="mt-4 space-y-3">
                {errorDetails.quality && !errorDetails.quality.passed && (
                  <div className="p-3 rounded-sonar bg-sonar-abyss/30">
                    <p className="font-mono font-semibold text-sonar-coral mb-2">
                      Quality Issues:
                    </p>
                    <ul className="text-sm text-sonar-highlight/70 space-y-1">
                      {errorDetails.errors?.map((error: string, idx: number) => (
                        <li key={idx} className="flex items-start space-x-2">
                          <span>•</span>
                          <span>{error}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {errorDetails.copyright?.high_confidence_match && (
                  <div className="p-3 rounded-sonar bg-sonar-abyss/30">
                    <p className="font-mono font-semibold text-sonar-coral mb-2">
                      Copyright Detected:
                    </p>
                    <p className="text-sm text-sonar-highlight/70">
                      {errorDetails.copyright.best_match?.title}
                      {errorDetails.copyright.best_match?.artist &&
                        ` by ${errorDetails.copyright.best_match.artist}`}
                    </p>
                    <p className="text-xs text-sonar-highlight/50 mt-1">
                      Confidence: {(errorDetails.copyright.best_match?.confidence * 100).toFixed(1)}%
                    </p>
                  </div>
                )}

                {errorDetails.analysis && !errorDetails.safetyPassed && (
                  <div className="p-3 rounded-sonar bg-sonar-abyss/30">
                    <p className="font-mono font-semibold text-sonar-coral mb-2">
                      Content Safety Issue
                    </p>
                    <p className="text-sm text-sonar-highlight/70">
                      Audio content was flagged for inappropriate material
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Recovery Actions */}
            <div className="flex flex-col gap-3 mt-6">
              <p className="text-sm text-sonar-highlight/70">
                You can try again with a different file or adjust your audio:
              </p>
              <div className="flex items-center gap-3">
                <SonarButton
                  variant="secondary"
                  onClick={startVerification}
                  className="flex-1"
                >
                  Retry Verification
                </SonarButton>
              </div>
              <p className="text-xs text-sonar-highlight/50 text-center">
                Verification is required to ensure audio quality and safety
              </p>
            </div>
          </GlassCard>
        </motion.div>
      )}
    </div>
  );
}
