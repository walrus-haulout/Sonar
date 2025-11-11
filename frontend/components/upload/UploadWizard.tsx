'use client';

import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UploadStep, UploadWizardState, WalrusUploadResult } from '@/lib/types/upload';
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
}

const STEPS: UploadStep[] = [
  'file-upload',
  'metadata',
  'encryption',
  'verification',
  'publish',
  'success',
];

const STEP_TITLES: Record<UploadStep, string> = {
  'file-upload': 'Upload Audio',
  'metadata': 'Dataset Details',
  'encryption': 'Encrypting',
  'verification': 'AI Verification',
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

/**
 * UploadWizard Component
 * Multi-step wizard for dataset upload with Walrus & Sui integration
 */
export function UploadWizard({ open, onOpenChange }: UploadWizardProps) {
  const [state, setState] = useState<UploadWizardState>(INITIAL_STATE);

  // Serialize state for localStorage (exclude large binary data)
  const serializeState = (state: UploadWizardState) => {
    return {
      ...state,
      // Remove large File objects
      audioFile: state.audioFile ? {
        duration: state.audioFile.duration,
        id: state.audioFile.id,
        // Skip 'file', 'waveform', 'preview' - these are large
      } : null,
      audioFiles: Array.isArray(state.audioFiles)
        ? state.audioFiles.map((f) => ({
            duration: f.duration,
            id: f.id,
          }))
        : [],
      // Remove large binary data from encryption result
      encryption: state.encryption ? {
        seal_policy_id: state.encryption.seal_policy_id,
        metadata: state.encryption.metadata,
        // Skip 'encryptedBlob', 'previewBlob', 'backupKey' - these are large or sensitive
      } : null,
      // walrusUpload only has IDs and metadata, safe to keep
    };
  };

  // Persist wizard state to localStorage for recovery
  useEffect(() => {
    if (open) {
      const savedState = localStorage.getItem('sonar-upload-wizard-state');
      if (savedState) {
        try {
          const parsed = JSON.parse(savedState);
          // Only restore if we're not on success step
          // Note: We can't restore full file data, user will need to re-upload
          if (parsed.step !== 'success' && parsed.step !== 'encryption') {
            setState((prev) => ({
              ...prev,
              ...parsed,
              audioFiles: Array.isArray(parsed.audioFiles) ? parsed.audioFiles : [],
            }));
          }
        } catch (e) {
          console.error('Failed to restore wizard state:', e);
          localStorage.removeItem('sonar-upload-wizard-state');
        }
      }
    }
  }, [open]);

  useEffect(() => {
    if (open && state.step !== 'success') {
      try {
        const serialized = serializeState(state);
        localStorage.setItem('sonar-upload-wizard-state', JSON.stringify(serialized));
      } catch (e) {
        console.error('Failed to save wizard state:', e);
        // If still quota exceeded, clear localStorage
        if (e instanceof DOMException && e.name === 'QuotaExceededError') {
          localStorage.removeItem('sonar-upload-wizard-state');
        }
      }
    }
  }, [state, open]);

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

  const handleClose = () => {
    // Only allow closing if not in critical steps
    if (
      state.step === 'file-upload' ||
      state.step === 'metadata' ||
      state.step === 'success'
    ) {
      onOpenChange(false);
      // Clear state after closing success step
      if (state.step === 'success') {
        localStorage.removeItem('sonar-upload-wizard-state');
        setState(() => ({ ...INITIAL_STATE }));
      }
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
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
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <Dialog.Title className="text-2xl font-mono font-bold text-sonar-highlight-bright">
                {STEP_TITLES[state.step]}
              </Dialog.Title>
              <Dialog.Description className="text-sonar-highlight/70 mt-1">
                Step {currentStepIndex + 1} of {STEPS.length}
              </Dialog.Description>
            </div>
            {(state.step === 'file-upload' ||
              state.step === 'metadata' ||
              state.step === 'success') && (
              <Dialog.Close asChild>
                <button
                  className={cn(
                    'text-sonar-highlight hover:text-sonar-signal',
                    'transition-colors p-2 rounded-sonar',
                    'focus:outline-none focus:ring-2 focus:ring-sonar-signal'
                  )}
                  aria-label="Close"
                >
                  <X className="w-6 h-6" />
                </button>
              </Dialog.Close>
            )}
          </div>

          {/* Progress Bar */}
          <div className="mb-8">
            <div className="h-1 bg-sonar-blue/20 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-sonar-signal to-sonar-blue"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>

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

              {state.step === 'encryption' && (
                <EncryptionStep
                  audioFile={state.audioFile!}
                  audioFiles={state.audioFiles}
                  onEncrypted={(result) => {
                    // Extract walrusUpload info from encryption result
                    const walrusUpload: WalrusUploadResult = {
                      blobId: result.walrusBlobId,
                      previewBlobId: result.previewBlobId,
                      seal_policy_id: result.seal_policy_id,
                      // backupKey: result.backupKey, // TODO: Add to WalrusUploadResult type when backup key encryption is implemented
                      files: result.files, // Multi-file results
                      bundleDiscountBps: result.bundleDiscountBps,
                    };

                    // Store both encryption metadata and walrus upload info
                    setState((prev) => ({
                      ...prev,
                      encryption: result,
                      walrusUpload,
                    }));
                    goToNextStep();
                  }}
                  onError={(error) => setState((prev) => ({ ...prev, error }))}
                />
              )}

              {state.step === 'verification' && (
                <VerificationStep
                  walrusUpload={state.walrusUpload!}
                  metadata={state.metadata!}
                  onVerificationComplete={(verification) => {
                    setState((prev) => ({ ...prev, verification }));
                  }}
                  onSkip={() => {
                    setState((prev) => ({
                      ...prev,
                      verification: {
                        id: 'skipped',
                        state: 'completed',
                        currentStage: 'safety',
                        stages: [],
                        safetyPassed: true,
                        updatedAt: Date.now(),
                      },
                    }));
                    goToNextStep();
                  }}
                  onContinue={goToNextStep}
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
                  onClose={handleClose}
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
