import {
  createOpenRouterClient,
  OPENROUTER_MODELS,
  estimateOpenRouterCost,
} from './openrouter-client';

/**
 * Whisper Transcription Service (via OpenRouter)
 * Converts audio to text using Whisper API
 */

export interface TranscriptionResult {
  text: string;
  duration: number;
  language?: string;
}

/**
 * Transcribe audio using OpenAI Whisper
 * @param audioBlob - Audio file to transcribe
 * @returns Transcription result with text and metadata
 */
export async function transcribeAudio(
  audioBlob: Blob
): Promise<TranscriptionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const openai = createOpenRouterClient(apiKey);

  // Convert Blob to File (Whisper requires File object)
  const file = new File([audioBlob], 'audio.mp3', { type: audioBlob.type });

  try {
    const startTime = Date.now();

    // Call Whisper API via OpenRouter
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: OPENROUTER_MODELS.WHISPER,
      language: 'en', // Auto-detect if not specified
      response_format: 'verbose_json', // Get detailed metadata
    });

    const duration = Date.now() - startTime;

    return {
      text: transcription.text,
      duration,
      language: (transcription as any).language || undefined,
    };
  } catch (error) {
    console.error('Whisper transcription failed:', error);
    throw new Error(
      `Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Estimate transcription cost via OpenRouter
 * Whisper charges $0.006 per minute
 */
export function estimateTranscriptionCost(durationSeconds: number): number {
  const minutes = durationSeconds / 60;
  return estimateOpenRouterCost(OPENROUTER_MODELS.WHISPER, minutes);
}

/**
 * Check if audio file is suitable for transcription
 */
export function validateAudioForTranscription(
  audioBlob: Blob,
  maxSizeBytes: number = 25 * 1024 * 1024 // 25MB default limit
): { valid: boolean; error?: string } {
  // Check file size
  if (audioBlob.size > maxSizeBytes) {
    return {
      valid: false,
      error: `Audio file too large. Maximum size is ${maxSizeBytes / (1024 * 1024)}MB`,
    };
  }

  // Check file type
  const validTypes = [
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/wav',
    'audio/x-wav',
    'audio/webm',
    'audio/flac',
  ];

  if (!validTypes.includes(audioBlob.type)) {
    return {
      valid: false,
      error: `Unsupported audio format: ${audioBlob.type}`,
    };
  }

  return { valid: true };
}
