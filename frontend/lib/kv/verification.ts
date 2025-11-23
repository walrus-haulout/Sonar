import { kv } from '@vercel/kv';
import type { VerificationResult, VerificationStage } from '@/lib/types/upload';

const VERIFICATION_PREFIX = 'verification:';
const TTL_SECONDS = 24 * 60 * 60; // 24 hours

/**
 * Vercel KV helpers for verification status storage
 */

export interface VerificationSession {
  id: string;
  state: 'pending' | 'processing' | 'completed' | 'failed';
  currentStage: VerificationStage['name'];
  stages: VerificationStage[];
  metadata: {
    datasetTitle: string;
    walrusBlobId: string;
    duration?: number;
  };
  results?: {
    transcript?: string;
    qualityScore?: number;
    safetyPassed?: boolean;
    insights?: string[];
    transcriptionDetails?: {
      speakerCount: number;
      annotationCount: number;
      hasUnintelligible: boolean;
      transcriptLength: number;
    };
    categorizationValidation?: {
      concerns: string[];
      hasIssues: boolean;
    };
    qualityBreakdown?: {
      clarity: number | null;
      contentValue: number | null;
      metadataAccuracy: number | null;
      completeness: number | null;
    };
  };
  error?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Create a new verification session
 */
export async function createVerificationSession(
  walrusBlobId: string,
  datasetTitle: string,
  duration?: number
): Promise<string> {
  const verificationId = `verify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const session: VerificationSession = {
    id: verificationId,
    state: 'pending',
    currentStage: 'transcription',
    stages: [
      { name: 'transcription', status: 'pending', progress: 0 },
      { name: 'analysis', status: 'pending', progress: 0 },
      { name: 'safety', status: 'pending', progress: 0 },
    ],
    metadata: {
      datasetTitle,
      walrusBlobId,
      duration,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await kv.set(
    `${VERIFICATION_PREFIX}${verificationId}`,
    JSON.stringify(session),
    { ex: TTL_SECONDS }
  );

  return verificationId;
}

/**
 * Get verification session by ID
 */
export async function getVerificationSession(
  verificationId: string
): Promise<VerificationSession | null> {
  const data = await kv.get(`${VERIFICATION_PREFIX}${verificationId}`);

  if (!data) {
    return null;
  }

  if (typeof data === 'string') {
    return JSON.parse(data);
  }

  return data as VerificationSession;
}

/**
 * Update verification stage progress
 */
export async function updateVerificationStage(
  verificationId: string,
  stageName: VerificationStage['name'],
  status: VerificationStage['status'],
  progress: number,
  message?: string
): Promise<void> {
  const session = await getVerificationSession(verificationId);

  if (!session) {
    throw new Error(`Verification session ${verificationId} not found`);
  }

  // Update stage
  session.stages = session.stages.map((stage) =>
    stage.name === stageName
      ? { ...stage, status, progress, message }
      : stage
  );

  // Update current stage
  session.currentStage = stageName;
  session.state = 'processing';
  session.updatedAt = Date.now();

  await kv.set(
    `${VERIFICATION_PREFIX}${verificationId}`,
    JSON.stringify(session),
    { ex: TTL_SECONDS }
  );
}

/**
 * Complete verification with results
 */
export async function completeVerification(
  verificationId: string,
  results: {
    transcript?: string;
    qualityScore?: number;
    safetyPassed?: boolean;
    insights?: string[];
  }
): Promise<void> {
  const session = await getVerificationSession(verificationId);

  if (!session) {
    throw new Error(`Verification session ${verificationId} not found`);
  }

  session.state = 'completed';
  session.results = results;
  session.updatedAt = Date.now();

  // Mark all stages as completed
  session.stages = session.stages.map((stage) => ({
    ...stage,
    status: 'completed',
    progress: 100,
  }));

  await kv.set(
    `${VERIFICATION_PREFIX}${verificationId}`,
    JSON.stringify(session),
    { ex: TTL_SECONDS }
  );
}

/**
 * Mark verification as failed
 */
export async function failVerification(
  verificationId: string,
  error: string,
  stageName?: VerificationStage['name']
): Promise<void> {
  const session = await getVerificationSession(verificationId);

  if (!session) {
    throw new Error(`Verification session ${verificationId} not found`);
  }

  session.state = 'failed';
  session.error = error;
  session.updatedAt = Date.now();

  // Mark current stage as failed
  if (stageName) {
    session.stages = session.stages.map((stage) =>
      stage.name === stageName
        ? { ...stage, status: 'failed', message: error }
        : stage
    );
  }

  await kv.set(
    `${VERIFICATION_PREFIX}${verificationId}`,
    JSON.stringify(session),
    { ex: TTL_SECONDS }
  );
}

/**
 * Convert VerificationSession to VerificationResult (for frontend)
 */
export function sessionToResult(session: VerificationSession): VerificationResult {
  return {
    id: session.id,
    state: session.state,
    currentStage: session.currentStage,
    stages: session.stages,
    transcript: session.results?.transcript,
    qualityScore: session.results?.qualityScore,
    safetyPassed: session.results?.safetyPassed,
    insights: session.results?.insights,
    error: session.error,
    updatedAt: session.updatedAt,
    transcriptionDetails: session.results?.transcriptionDetails,
    categorizationValidation: session.results?.categorizationValidation,
    qualityBreakdown: session.results?.qualityBreakdown,
  };
}

/**
 * Delete verification session (cleanup)
 */
export async function deleteVerificationSession(
  verificationId: string
): Promise<void> {
  await kv.del(`${VERIFICATION_PREFIX}${verificationId}`);
}
