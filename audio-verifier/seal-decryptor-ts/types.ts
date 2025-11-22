import { z } from 'zod';

/**
 * Zod schemas for Seal decryption service request/response validation
 */

export const DecryptRequestSchema = z.object({
  encrypted_object_hex: z.string().min(1, "encrypted_object_hex is required"),
  identity: z.string().min(1, "identity is required"),
  session_key_data: z.string().min(1, "session_key_data is required for SessionKey-based decryption"),
  network: z.enum(['mainnet', 'testnet']).optional().default('mainnet'),
});

export type DecryptRequest = z.infer<typeof DecryptRequestSchema>;

export const DecryptResponseSchema = z.object({
  plaintextHex: z.string(),
});

export type DecryptResponse = z.infer<typeof DecryptResponseSchema>;

export const ErrorResponseSchema = z.object({
  error: z.string(),
  errorType: z.enum([
    'validation_failed',
    'authentication_failed',
    'network_error',
    'timeout',
    'decryption_failed',
    'unknown',
  ]),
  details: z.string().optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/**
 * Map error types to HTTP status codes
 */
export const errorTypeToHttpStatus = (errorType: string): number => {
  switch (errorType) {
    case 'validation_failed':
      return 400;
    case 'authentication_failed':
      return 403;
    case 'network_error':
      return 502;
    case 'timeout':
      return 504;
    default:
      return 500;
  }
};
