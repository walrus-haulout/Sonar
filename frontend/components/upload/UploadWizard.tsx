'use client';

import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SonarBackground } from '@/components/animations/SonarBackground';
import {
  UploadStep,
  UploadWizardState,
  WalrusUploadResult,
  VerificationResult,
} from '@/lib/types/upload';
import { SonarButton } from '@/components/ui/SonarButton';
import { FileUploadStep } from './FileUploadStep';
import { MetadataStep } from './MetadataStep';
import { EncryptionStep } from './EncryptionStep';
import { VerificationStep } from './VerificationStep';
import { PublishStep } from './PublishStep';
import { SuccessStep } from './SuccessStep';

interface UploadWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fullscreen?: boolean;
}

const STEPS: UploadStep[] = [
  'file-upload',
  'metadata',
  'encryption', // Encrypt first, then verify encrypted blob
  'verification',
  'publish',
  'success',
];

const STEP_TITLES: Record<UploadStep, string> = {
  'file-upload': 'Upload Audio',
  'metadata': 'Dataset Details',
  'encryption': 'Encrypting',
  'verification': 'AI Verification', // Verifies encrypted audio
  'publish': 'Publish to Blockchain',
  'success': 'Success!',
};

const INITIAL_STATE: UploadWizardState = {
  step: 'file-upload',
  audioFile: null,
  audioFiles: [],
  metadata: null,
  encryption: null,
  walrusUpload: null,
  verification: null,
  publish: null,
  error: null,
};

const STORAGE_KEY = 'sonar-upload-wizard-state';

/**
 * UploadWizard Component
 * Multi-step wizard for dataset upload with Walrus & Sui integration
 */
export function UploadWizard({ open, onOpenChange, fullscreen = false }: UploadWizardProps) {
  const [state, setState] = useState<UploadWizardState>(INITIAL_STATE);
  const [persistenceDisabled, setPersistenceDisabled] = useState(false);

  const sanitizeWalrusUpload = (walrusUpload: WalrusUploadResult | null) => {
    if (!walrusUpload) return null;
    return {
      blobId: walrusUpload.blobId,
      previewBlobId: walrusUpload.previewBlobId,
      seal_policy_id: walrusUpload.seal_policy_id,
      encryptedObjectBcsHex: walrusUpload.encryptedObjectBcsHex,
      bundleDiscountBps: walrusUpload.bundleDiscountBps,
      mimeType: walrusUpload.mimeType,
      previewMimeType: walrusUpload.previewMimeType,
      files: walrusUpload.files,
    };
  };

  const sanitizeVerification = (verification: VerificationResult | null) => {
    if (!verification) return null;
    return {
      id: verification.id,
      state: verification.state,
      currentStage: verification.currentStage,
      qualityScore: verification.qualityScore,
      safetyPassed: verification.safetyPassed,
      insights: verification.insights ? verification.insights.slice(0, 5) : undefined,
      updatedAt: verification.updatedAt,
    };
  };

  // Serialize state for localStorage (exclude large binary data)
  const serializeState = (state: UploadWizardState) => {
    return {
      ...state,
      // Remove large File objects
      audioFile: state.audioFile
        ? {
          duration: state.audioFile.duration,
          id: state.audioFile.id,
          // Skip 'file', 'waveform', 'preview' - these are large
        }
        : null,
      audioFiles: Array.isArray(state.audioFiles)
        ? state.audioFiles.map((f) => ({
          duration: f.duration,
          id: f.id,
        }))
        : [],
      // Remove large binary data from encryption result
      encryption: state.encryption
        ? {
          seal_policy_id: state.encryption.seal_policy_id,
          metadata: state.encryption.metadata,
          // Skip 'encryptedBlob', 'previewBlob', 'backupKey' - these are large or sensitive
        }
        : null,
      walrusUpload: sanitizeWalrusUpload(state.walrusUpload),
      verification: sanitizeVerification(state.verification),
    };
  };

  const clearStoredWizardState = () => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error('Failed to clear wizard state:', e);
    }
    setPersistenceDisabled(false);
  };

  const resetWizardState = () => {
    setState(() => ({ ...INITIAL_STATE }));
  };

  const closeWizard = (options?: { clearDraft?: boolean }) => {
    // In fullscreen mode, don't call parent onOpenChange (page handles navigation)
    if (!fullscreen) {
      onOpenChange(false);
    }
    if (options?.clearDraft) {
      clearStoredWizardState();
      resetWizardState();
    }
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      closeWizard({ clearDraft: state.step === 'success' });
    } else {
      onOpenChange(true);
    }
  };

  const handleDiscardDraft = () => {
    if (state.step === 'success') {
      handleDialogOpenChange(false);
      return;
    }

    const confirmed = typeof window === 'undefined' ? true : window.confirm('Discard current draft? This cannot be undone.');
    if (!confirmed) {
      return;
    }

    clearStoredWizardState();
    resetWizardState();
    setPersistenceDisabled(false);
    onOpenChange(false); // Close wizard after discarding draft
  };

  // Persist wizard state to localStorage for recovery
  useEffect(() => {
    if (!open || typeof window === 'undefined') {
      return;
    }

    const savedState = localStorage.getItem(STORAGE_KEY);
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        // Only restore verification and publish steps (long-running processes)
        // File-upload and metadata steps always start fresh (file data can't be restored from localStorage)
        // Note: We can't restore full file data, user will need to re-upload
        if (parsed.step === 'verification' || parsed.step === 'publish') {
          // Validate metadata structure - clean up invalid optional fields
          if (parsed.metadata) {
            // Ensure speakers is either undefined or has proper structure
            if (parsed.metadata.speakers !== undefined && !parsed.metadata.speakers?.speakers) {
              parsed.metadata.speakers = undefined;
            }
            // Ensure audioQuality is either undefined or has proper structure
            if (parsed.metadata.audioQuality !== undefined && !parsed.metadata.audioQuality?.codec) {
              parsed.metadata.audioQuality = undefined;
            }
          }

          setState((prev) => ({
            ...prev,
            ...parsed,
            audioFiles: Array.isArray(parsed.audioFiles) ? parsed.audioFiles : [],
          }));
        }
      } catch (e) {
        console.error('Failed to restore wizard state:', e);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [open]);

  useEffect(() => {
    if (
      !open ||
      state.step === 'success' ||
      typeof window === 'undefined' ||
      persistenceDisabled
    ) {
      return;
    }

    try {
      const serialized = serializeState(state);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
    } catch (e) {
      console.error('Failed to save wizard state:', e);
      // If still quota exceeded, clear localStorage
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        localStorage.removeItem(STORAGE_KEY);
        setPersistenceDisabled(true);
      }
    }
  }, [state, open, persistenceDisabled]);

  const currentStepIndex = STEPS.indexOf(state.step);
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  const goToNextStep = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setState((prev) => ({ ...prev, step: STEPS[nextIndex], error: null }));
    }
  };

  const goToPreviousStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setState((prev) => ({ ...prev, step: STEPS[prevIndex], error: null }));
    }
  };

  // Reusable wizard content
  const content = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-mono font-bold text-sonar-highlight-bright">
            {STEP_TITLES[state.step]}
          </h2>
          <p className="text-sonar-highlight/70 mt-1">
            Step {currentStepIndex + 1} of {STEPS.length}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {state.step !== 'success' && (
            <button
              type="button"
              onClick={handleDiscardDraft}
              className={cn(
                'text-xs uppercase tracking-wide font-mono',
                'text-sonar-coral hover:text-sonar-coral/80',
                'border border-sonar-coral/40 rounded-sonar px-3 py-1.5',
                'transition-colors focus:outline-none focus:ring-2 focus:ring-sonar-coral/60'
              )}
            >
              Discard Draft
            </button>
          )}
          {!fullscreen && (
            <Dialog.Close asChild>
              <button
                type="button"
                className={cn(
                  'text-sonar-highlight hover:text-sonar-signal',
                  'transition-colors p-2 rounded-sonar',
                  'focus:outline-none focus:ring-2 focus:ring-sonar-signal'
                )}
                aria-label="Close upload wizard"
              >
                <X className="w-6 h-6" />
              </button>
            </Dialog.Close>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="h-1 bg-sonar-blue/20 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-sonar-signal to-sonar-blue"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {persistenceDisabled && (
        <div
          className={cn(
            'mb-6 p-3 rounded-sonar text-sm font-mono',
            'bg-sonar-coral/15 border border-sonar-coral/60 text-sonar-coral'
          )}
        >
          Browser storage is full. Autosave is temporarily disabled, but your current session
          will continue. Close the wizard only after publishing or discarding the draft.
        </div>
      )}

      {/* Step Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={state.step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {state.step === 'file-upload' && (
            <FileUploadStep
              audioFile={state.audioFile}
              audioFiles={state.audioFiles}
              onFileSelected={(audioFile) => {
                setState((prev) => ({ ...prev, audioFile }));
                goToNextStep();
              }}
              onFilesSelected={(audioFiles) => {
                setState((prev) => ({ ...prev, audioFiles }));
              }}
              onContinue={goToNextStep}
              error={state.error}
              multiFile={true}
            />
          )}

          {state.step === 'metadata' && (
            <MetadataStep
              metadata={state.metadata}
              audioFiles={state.audioFiles}
              onSubmit={(metadata) => {
                setState((prev) => ({ ...prev, metadata }));
                goToNextStep();
              }}
              onBack={goToPreviousStep}
              error={state.error}
            />
          )}

          {state.step === 'verification' && (
            <VerificationStep
              audioFile={state.audioFile || undefined}
              audioFiles={state.audioFiles}
              metadata={state.metadata!}
              walrusUpload={state.walrusUpload!}
              onVerificationComplete={(verification) => {
                setState((prev) => ({ ...prev, verification }));
                goToNextStep();
              }}
              onError={(error) => setState((prev) => ({ ...prev, error }))}
            />
          )}

          {state.step === 'encryption' && (
            <EncryptionStep
              audioFile={state.audioFile!}
              audioFiles={state.audioFiles}
              onEncrypted={(result) => {
                console.log('[UploadWizard] Encryption completed, creating walrusUpload', {
                  walrusBlobId: result.walrusBlobId,
                  seal_policy_id: result.seal_policy_id?.slice(0, 20),
                  encryptedObjectBcsHex: result.encryptedObjectBcsHex ? 'present' : 'missing',
                  hasFiles: !!result.files,
                  filesToProcess: result.files?.length ?? 'N/A',
                });

                // Extract walrusUpload info from encryption result
                const walrusUpload: WalrusUploadResult = {
                  blobId: result.walrusBlobId,
                  previewBlobId: result.previewBlobId,
                  seal_policy_id: result.seal_policy_id,
                  encryptedObjectBcsHex: result.encryptedObjectBcsHex,
                  files: result.files,
                  bundleDiscountBps: result.bundleDiscountBps,
                  mimeType: result.mimeType,
                  previewMimeType: result.previewMimeType,
                };

                console.log('[UploadWizard] WalrusUploadResult created', {
                  blobId: walrusUpload.blobId,
                  encryptedObjectBcsHex: walrusUpload.encryptedObjectBcsHex ? 'present' : 'missing',
                  encryptedObjectBcsHexLength: walrusUpload.encryptedObjectBcsHex?.length ?? 0,
                });

                setState((prev) => {
                  const nextState = {
                    ...prev,
                    encryption: result,
                    walrusUpload,
                  };
                  console.log('[UploadWizard] State updated with walrusUpload', {
                    walrusUploadPresent: !!nextState.walrusUpload,
                    encryptedObjectBcsHexPresent: !!nextState.walrusUpload?.encryptedObjectBcsHex,
                  });
                  return nextState;
                });
                goToNextStep();
              }}
              onError={(error) => setState((prev) => ({ ...prev, error }))}
            />
          )}

          {state.step === 'publish' && (
            <PublishStep
              walrusUpload={state.walrusUpload!}
              metadata={state.metadata!}
              verification={state.verification!}
              onPublished={(publish) => {
                setState((prev) => ({ ...prev, publish }));
                goToNextStep();
              }}
              onError={(error) => setState((prev) => ({ ...prev, error }))}
            />
          )}

          {state.step === 'success' && (
            <SuccessStep
              publish={state.publish!}
              metadata={state.metadata!}
              onClose={() => closeWizard({ clearDraft: true })}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Error Display */}
      {state.error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'mt-6 p-4 rounded-sonar',
            'bg-sonar-coral/10 border border-sonar-coral',
            'text-sonar-coral'
          )}
        >
          <p className="font-mono text-sm">{state.error}</p>
        </motion.div>
      )}
    </>
  );

  // Return based on fullscreen mode
  if (fullscreen) {
    return (
      <main className="relative min-h-screen">
        <SonarBackground opacity={0.2} intensity={0.5} />
        <div className="relative z-10 container mx-auto px-6 py-12">
          <div className="max-w-4xl mx-auto glass-panel rounded-sonar p-8">
            {content}
          </div>
        </div>
      </main>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleDialogOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-sonar-abyss/90 backdrop-blur-sm z-50" />
        <Dialog.Content
          className={cn(
            'fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]',
            'w-[95vw] max-w-4xl max-h-[90vh] z-50',
            'glass-panel rounded-sonar p-8',
            'focus:outline-none overflow-y-auto'
          )}
        >
          {content}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
