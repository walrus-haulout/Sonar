'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Shield, FileText, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  WalrusUploadResult,
  DatasetMetadata,
  VerificationResult,
  VerificationStage,
} from '@/lib/types/upload';
import { SonarButton } from '@/components/ui/SonarButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { RadarScanTarget } from '@/components/animations/RadarScanTarget';

interface VerificationStepProps {
  walrusUpload: WalrusUploadResult;
  metadata: DatasetMetadata;
  onVerificationComplete: (result: VerificationResult) => void;
  onSkip: () => void;
  onContinue: () => void;
}

/**
 * VerificationStep Component
 * Shows AI verification progress with option to skip
 */
export function VerificationStep({
  walrusUpload,
  metadata,
  onVerificationComplete,
  onSkip,
  onContinue,
}: VerificationStepProps) {
  const [verificationState, setVerificationState] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [stages, setStages] = useState<VerificationStage[]>([
    { name: 'transcription', status: 'pending', progress: 0 },
    { name: 'analysis', status: 'pending', progress: 0 },
    { name: 'safety', status: 'pending', progress: 0 },
  ]);
  const [result, setResult] = useState<VerificationResult | null>(null);

  const startVerification = async () => {
    setVerificationState('running');

    try {
      // TODO: Call Edge Function to start verification
      // const response = await fetch('/api/edge/verify', {
      //   method: 'POST',
      //   body: JSON.stringify({ walrusBlobId: walrusUpload.blobId, metadata }),
      // });
      // const { verificationId } = await response.json();

      // Simulate verification process
      await simulateVerification();

    } catch (error) {
      console.error('Verification failed:', error);
      setVerificationState('failed');
    }
  };

  const simulateVerification = async () => {
    // Stage 1: Transcription
    updateStage('transcription', 'in_progress');
    await simulateStageProgress('transcription', 5000);
    updateStage('transcription', 'completed', 100);

    // Stage 2: Analysis
    updateStage('analysis', 'in_progress');
    await simulateStageProgress('analysis', 4000);
    updateStage('analysis', 'completed', 100);

    // Stage 3: Safety
    updateStage('safety', 'in_progress');
    await simulateStageProgress('safety', 3000);
    updateStage('safety', 'completed', 100);

    // Complete
    const mockResult: VerificationResult = {
      id: `verify_${Date.now()}`,
      state: 'completed',
      currentStage: 'safety',
      stages,
      transcript: 'This is a sample transcript of the audio content...',
      qualityScore: 0.87,
      safetyPassed: true,
      insights: [
        'Clear audio with minimal background noise',
        'Natural conversational tone detected',
        'Appropriate for general audiences',
      ],
      updatedAt: Date.now(),
    };

    setResult(mockResult);
    setVerificationState('completed');
    onVerificationComplete(mockResult);
  };

  const updateStage = (
    stageName: VerificationStage['name'],
    status: VerificationStage['status'],
    progress: number = 0
  ) => {
    setStages((prev) =>
      prev.map((stage) =>
        stage.name === stageName ? { ...stage, status, progress } : stage
      )
    );
  };

  const simulateStageProgress = async (
    stageName: VerificationStage['name'],
    duration: number
  ) => {
    const steps = 20;
    const stepDuration = duration / steps;

    for (let i = 0; i <= steps; i++) {
      await new Promise((resolve) => setTimeout(resolve, stepDuration));
      const progress = (i / steps) * 100;
      updateStage(stageName, 'in_progress', progress);
    }
  };

  const stageConfig = {
    transcription: {
      icon: <FileText className="w-5 h-5" />,
      label: 'Transcription',
      description: 'Converting audio to text using Whisper AI',
    },
    analysis: {
      icon: <Brain className="w-5 h-5" />,
      label: 'Quality Analysis',
      description: 'Analyzing audio quality and content with Claude',
    },
    safety: {
      icon: <Shield className="w-5 h-5" />,
      label: 'Safety Screening',
      description: 'Checking for inappropriate or harmful content',
    },
  };

  return (
    <div className="space-y-6">
      {/* Verification Choice (Idle State) */}
      {verificationState === 'idle' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <GlassCard className="text-center py-8">
            <div className="flex justify-center mb-4">
              <div className="p-6 rounded-full bg-sonar-signal/10">
                <Brain className="w-12 h-12 text-sonar-signal" />
              </div>
            </div>

            <h3 className="text-2xl font-mono font-bold text-sonar-highlight-bright mb-3">
              AI Verification (Optional)
            </h3>
            <p className="text-sonar-highlight/70 max-w-2xl mx-auto mb-6">
              Our AI will analyze your dataset for quality, transcription, and safety.
              This helps buyers trust your dataset and can increase its value.
            </p>

            <div className="flex items-center justify-center gap-4">
              <SonarButton variant="secondary" onClick={onSkip}>
                Skip Verification
              </SonarButton>
              <SonarButton variant="primary" onClick={startVerification}>
                Start Verification
              </SonarButton>
            </div>
          </GlassCard>

          <GlassCard className="bg-sonar-blue/5">
            <div className="text-sm text-sonar-highlight/80 space-y-3">
              <p className="font-mono font-semibold text-sonar-blue">
                Why verify your dataset?
              </p>
              <ul className="space-y-2 list-disc list-inside">
                <li>Builds trust with potential buyers</li>
                <li>Provides quality metrics and insights</li>
                <li>Ensures content safety compliance</li>
                <li>Generates automatic transcription</li>
              </ul>
              <p className="text-xs text-sonar-highlight/50 pt-2">
                Verification typically takes 1-2 minutes depending on audio length
              </p>
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Verification in Progress */}
      {verificationState === 'running' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          {/* Radar Animation */}
          <div className="flex justify-center py-8">
            <div className="relative w-64 h-64">
              <RadarScanTarget
                src="/images/walrus-icon.png"
                alt="Verification in Progress"
                size={256}
              />
            </div>
          </div>

          {/* Stage Progress */}
          <div className="space-y-3">
            {stages.map((stage) => {
              const config = stageConfig[stage.name];
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
              <Clock className="w-4 h-4" />
              <p className="text-sm font-mono">
                This may take 1-2 minutes...
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
                  Your dataset has been successfully analyzed
                </p>
              </div>
            </div>

            {/* Quality Score */}
            {result.qualityScore && (
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

          <div className="flex justify-end">
            <SonarButton variant="primary" onClick={onContinue}>
              Continue to Publish →
            </SonarButton>
          </div>
        </motion.div>
      )}

      {/* Verification Failed */}
      {verificationState === 'failed' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <GlassCard className="bg-sonar-coral/10 border border-sonar-coral">
            <div className="flex items-center space-x-4 mb-4">
              <AlertCircle className="w-8 h-8 text-sonar-coral" />
              <div>
                <h3 className="text-xl font-mono font-bold text-sonar-coral">
                  Verification Failed
                </h3>
                <p className="text-sm text-sonar-highlight/70">
                  Unable to complete AI verification
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 mt-6">
              <SonarButton variant="secondary" onClick={startVerification}>
                Retry Verification
              </SonarButton>
              <SonarButton variant="primary" onClick={onSkip}>
                Continue Without Verification
              </SonarButton>
            </div>
          </GlassCard>
        </motion.div>
      )}
    </div>
  );
}
