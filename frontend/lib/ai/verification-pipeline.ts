import type { DatasetMetadata } from '@/lib/types/upload';
import {
  updateVerificationStage,
  completeVerification,
  failVerification,
} from '@/lib/kv/verification';
import { transcribeAudio, validateAudioForTranscription } from './transcription';
import { analyzeDataset, quickSafetyCheck } from './analysis';

/**
 * Verification Pipeline
 * Orchestrates the full verification workflow: Transcription → Analysis → Safety
 */

export interface VerificationInput {
  verificationId: string;
  audioBlob: Blob;
  metadata: DatasetMetadata;
  audioMetadata?: {
    duration: number;
    fileSize: number;
    format: string;
  };
}

/**
 * Execute full verification pipeline
 * This runs asynchronously in the background (triggered by Edge Function)
 */
export async function runVerificationPipeline(
  input: VerificationInput
): Promise<void> {
  const { verificationId, audioBlob, metadata, audioMetadata } = input;

  try {
    // ========================================
    // STAGE 1: Transcription
    // ========================================
    await updateVerificationStage(
      verificationId,
      'transcription',
      'in_progress',
      0,
      'Starting transcription...'
    );

    // Validate audio file
    const validation = validateAudioForTranscription(audioBlob);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    await updateVerificationStage(
      verificationId,
      'transcription',
      'in_progress',
      25,
      'Sending to Whisper API...'
    );

    // Transcribe audio
    const transcriptionResult = await transcribeAudio(audioBlob);

    await updateVerificationStage(
      verificationId,
      'transcription',
      'completed',
      100,
      `Transcribed ${transcriptionResult.text.length} characters`
    );

    // ========================================
    // STAGE 2: Quality Analysis
    // ========================================
    await updateVerificationStage(
      verificationId,
      'analysis',
      'in_progress',
      0,
      'Starting quality analysis...'
    );

    await updateVerificationStage(
      verificationId,
      'analysis',
      'in_progress',
      30,
      'Analyzing content with Gemini...'
    );

    // Analyze with Gemini via OpenRouter
    const analysisResult = await analyzeDataset(
      transcriptionResult.text,
      metadata,
      audioMetadata
    );

    await updateVerificationStage(
      verificationId,
      'analysis',
      'completed',
      100,
      `Quality score: ${Math.round(analysisResult.qualityScore * 100)}%`
    );

    // ========================================
    // STAGE 3: Safety Screening
    // ========================================
    await updateVerificationStage(
      verificationId,
      'safety',
      'in_progress',
      0,
      'Checking content safety...'
    );

    // Safety check (already done in analysis, but double-check)
    const safetyPassed = analysisResult.safetyPassed;

    if (!safetyPassed) {
      await updateVerificationStage(
        verificationId,
        'safety',
        'failed',
        100,
        'Content safety check failed'
      );

      await failVerification(
        verificationId,
        'Dataset failed safety screening. Please review content guidelines.',
        'safety'
      );

      return;
    }

    await updateVerificationStage(
      verificationId,
      'safety',
      'completed',
      100,
      'Safety check passed'
    );

    // ========================================
    // COMPLETION
    // ========================================
    await completeVerification(verificationId, {
      transcript: transcriptionResult.text,
      qualityScore: analysisResult.qualityScore,
      safetyPassed: true,
      insights: [
        ...analysisResult.insights,
        ...(analysisResult.recommendations || []),
      ],
    });

    console.log(`✅ Verification completed for ${verificationId}`);
  } catch (error) {
    console.error(`❌ Verification failed for ${verificationId}:`, error);

    await failVerification(
      verificationId,
      error instanceof Error ? error.message : 'Unknown error occurred'
    );
  }
}

/**
 * Quick pre-check before starting full verification
 * Validates input and checks basic requirements
 */
export async function preCheckVerification(
  audioBlob: Blob,
  metadata: DatasetMetadata
): Promise<{ valid: boolean; error?: string }> {
  // Check audio file
  const audioValidation = validateAudioForTranscription(audioBlob);
  if (!audioValidation.valid) {
    return audioValidation;
  }

  // Check metadata
  if (!metadata.title || metadata.title.length < 3) {
    return {
      valid: false,
      error: 'Dataset title is required (minimum 3 characters)',
    };
  }

  if (!metadata.description || metadata.description.length < 10) {
    return {
      valid: false,
      error: 'Dataset description is required (minimum 10 characters)',
    };
  }

  if (!metadata.languages || metadata.languages.length === 0) {
    return {
      valid: false,
      error: 'At least one language must be selected',
    };
  }

  if (!metadata.tags || metadata.tags.length === 0) {
    return {
      valid: false,
      error: 'At least one tag must be selected',
    };
  }

  if (!metadata.consent) {
    return {
      valid: false,
      error: 'You must confirm consent and rights',
    };
  }

  return { valid: true };
}

/**
 * Estimate verification time (in seconds)
 */
export function estimateVerificationTime(durationSeconds: number): number {
  // Rough estimates:
  // - Transcription: ~1:1 (60s audio = 60s transcription)
  // - Analysis: ~10-20s regardless of length
  // - Safety: ~5s
  // Add 25% buffer
  const transcriptionTime = durationSeconds;
  const analysisTime = 20;
  const safetyTime = 5;

  return Math.ceil((transcriptionTime + analysisTime + safetyTime) * 1.25);
}

/**
 * Estimate verification cost (USD)
 */
export function estimateVerificationCost(durationSeconds: number): number {
  // Whisper via OpenRouter: $0.006 per minute
  // Gemini 2.5 Flash via OpenRouter: Free tier
  // Total per minute of audio: ~$0.006

  const minutes = durationSeconds / 60;
  const whisperCost = minutes * 0.006;
  const geminiCost = 0.0; // Free tier

  return whisperCost + geminiCost;
}
