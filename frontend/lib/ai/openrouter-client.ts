/**
 * OpenRouter Client
 * Unified client for accessing AI models via OpenRouter
 */

import OpenAI from 'openai';

/**
 * Available models on OpenRouter
 */
export const OPENROUTER_MODELS = {
  // Transcription (Whisper via OpenRouter)
  WHISPER: 'openai/whisper-1',

  // Quality Analysis & Safety (Gemini 2.5 Flash)
  GEMINI_FLASH: 'google/gemini-2.0-flash-exp:free',
} as const;

/**
 * Create OpenRouter client instance
 * Uses OpenAI SDK with OpenRouter base URL
 */
export function createOpenRouterClient(apiKey?: string): OpenAI {
  const key = apiKey || process.env.OPENROUTER_API_KEY;

  if (!key) {
    throw new Error('OPENROUTER_API_KEY is required');
  }

  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: key,
    defaultHeaders: {
      'HTTP-Referer': 'https://projectsonar.xyz',
      'X-Title': 'SONAR Audio Marketplace',
    },
  });
}

/**
 * Estimate cost for OpenRouter API calls
 */
export function estimateOpenRouterCost(
  model: string,
  inputTokens: number,
  outputTokens: number = 0
): number {
  // Approximate pricing (as of 2025)
  const pricing: Record<string, { input: number; output: number }> = {
    'openai/whisper-1': { input: 0.006, output: 0 }, // Per minute of audio
    'google/gemini-2.0-flash-exp:free': { input: 0, output: 0 }, // Free tier
  };

  const modelPricing = pricing[model] || { input: 0, output: 0 };

  // Whisper pricing is per minute, others are per 1M tokens
  if (model.includes('whisper')) {
    return inputTokens * modelPricing.input; // inputTokens = minutes
  }

  return (
    (inputTokens / 1_000_000) * modelPricing.input +
    (outputTokens / 1_000_000) * modelPricing.output
  );
}

/**
 * Get model capabilities
 */
export function getModelCapabilities(model: string) {
  const capabilities: Record<string, string[]> = {
    'openai/whisper-1': ['audio-transcription'],
    'google/gemini-2.0-flash-exp:free': [
      'chat',
      'text-generation',
      'multimodal',
      'vision',
      'function-calling',
    ],
  };

  return capabilities[model] || [];
}

/**
 * Check if model supports a capability
 */
export function modelSupports(model: string, capability: string): boolean {
  return getModelCapabilities(model).includes(capability);
}
