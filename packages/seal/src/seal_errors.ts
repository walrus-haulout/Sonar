/**
 * @sonar/seal - Structured Error Codes for seal_approve Flow
 * Matches Move contract error codes for consistent error handling
 */

/**
 * Seal policy approval error codes
 * These correspond to Move contract error codes in the Seal ecosystem
 */
export enum SealErrorCode {
  // Authorization/Policy errors (400-499)
  POLICY_DENIED = 'SEAL_POLICY_DENIED',
  UNAUTHORIZED = 'SEAL_UNAUTHORIZED',
  NOT_ALLOWED = 'SEAL_NOT_ALLOWED',
  INSUFFICIENT_PERMISSIONS = 'SEAL_INSUFFICIENT_PERMISSIONS',

  // Session/Authentication errors (500-599)
  INVALID_SESSION = 'SEAL_INVALID_SESSION',
  SESSION_EXPIRED = 'SEAL_SESSION_EXPIRED',
  SIGNATURE_VERIFICATION_FAILED = 'SEAL_SIGNATURE_VERIFICATION_FAILED',
  INVALID_PERSONAL_MESSAGE = 'SEAL_INVALID_PERSONAL_MESSAGE',

  // Transaction/Network errors (600-699)
  TRANSACTION_FAILED = 'SEAL_TRANSACTION_FAILED',
  TRANSACTION_TIMEOUT = 'SEAL_TRANSACTION_TIMEOUT',
  NETWORK_ERROR = 'SEAL_NETWORK_ERROR',
  INVALID_NETWORK = 'SEAL_INVALID_NETWORK',

  // Cryptography errors (700-799)
  DECRYPTION_FAILED = 'SEAL_DECRYPTION_FAILED',
  INVALID_CIPHERTEXT = 'SEAL_INVALID_CIPHERTEXT',
  KEY_DERIVATION_FAILED = 'SEAL_KEY_DERIVATION_FAILED',
  INVALID_ARRAY_LENGTH = 'SEAL_INVALID_ARRAY_LENGTH',

  // Data/Format errors (800-899)
  INVALID_BLOB_FORMAT = 'SEAL_INVALID_BLOB_FORMAT',
  ENVELOPE_DETECTION_FAILED = 'SEAL_ENVELOPE_DETECTION_FAILED',
  INVALID_METADATA = 'SEAL_INVALID_METADATA',
  INVALID_POLICY_ID = 'SEAL_INVALID_POLICY_ID',

  // Server/Key Server errors (900-999)
  KEY_SERVER_ERROR = 'SEAL_KEY_SERVER_ERROR',
  INSUFFICIENT_KEY_SHARES = 'SEAL_INSUFFICIENT_KEY_SHARES',
  KEY_SHARE_MISSING = 'SEAL_KEY_SHARE_MISSING',
  KEY_SERVER_UNAVAILABLE = 'SEAL_KEY_SERVER_UNAVAILABLE',

  // Unknown/Generic errors
  UNKNOWN = 'SEAL_UNKNOWN_ERROR',
}

/**
 * Structured Seal error with code and context
 */
export interface SealErrorContext {
  code: SealErrorCode;
  message: string;
  originalError?: Error;
  context?: Record<string, unknown>;
  isRetryable: boolean;
  suggestedAction?: string;
}

/**
 * Map error messages to structured error codes
 */
export function classifySealError(error: unknown): SealErrorContext {
  const errorMessage = extractErrorMessage(error);
  const lowerMessage = errorMessage.toLowerCase();

  // Authorization errors
  if (
    lowerMessage.includes('denied') ||
    lowerMessage.includes('not authorized') ||
    lowerMessage.includes('access denied')
  ) {
    return {
      code: SealErrorCode.POLICY_DENIED,
      message: 'Access denied by policy',
      originalError: error instanceof Error ? error : undefined,
      isRetryable: false,
      suggestedAction: 'Verify you meet the policy requirements and try again',
    };
  }

  if (lowerMessage.includes('unauthorized') || lowerMessage.includes('not allowed')) {
    return {
      code: SealErrorCode.UNAUTHORIZED,
      message: 'Unauthorized access attempt',
      originalError: error instanceof Error ? error : undefined,
      isRetryable: false,
      suggestedAction: 'Check your credentials and permissions',
    };
  }

  // Session errors
  if (lowerMessage.includes('personal message signature is not set')) {
    return {
      code: SealErrorCode.INVALID_PERSONAL_MESSAGE,
      message: 'Session signature not set. Please authorize access.',
      originalError: error instanceof Error ? error : undefined,
      isRetryable: true,
      suggestedAction: 'Sign the authorization message and try again',
    };
  }

  if (lowerMessage.includes('session') && lowerMessage.includes('expired')) {
    return {
      code: SealErrorCode.SESSION_EXPIRED,
      message: 'Session has expired',
      originalError: error instanceof Error ? error : undefined,
      isRetryable: true,
      suggestedAction: 'Create a new session and try again',
    };
  }

  if (lowerMessage.includes('session')) {
    return {
      code: SealErrorCode.INVALID_SESSION,
      message: 'Invalid or missing session',
      originalError: error instanceof Error ? error : undefined,
      isRetryable: true,
      suggestedAction: 'Create a new session and try again',
    };
  }

  // Cryptography errors
  if (lowerMessage.includes('decryption') && lowerMessage.includes('failed')) {
    return {
      code: SealErrorCode.DECRYPTION_FAILED,
      message: 'Failed to decrypt blob',
      originalError: error instanceof Error ? error : undefined,
      isRetryable: false,
      suggestedAction: 'Verify the blob and policy ID are correct',
    };
  }

  if (lowerMessage.includes('invalid array length')) {
    return {
      code: SealErrorCode.INVALID_ARRAY_LENGTH,
      message: 'Invalid envelope format detected',
      originalError: error instanceof Error ? error : undefined,
      isRetryable: false,
      suggestedAction: 'The blob may be corrupted. Re-upload required.',
    };
  }

  if (lowerMessage.includes('range error')) {
    return {
      code: SealErrorCode.INVALID_BLOB_FORMAT,
      message: 'Blob format error. Possible envelope mismatch.',
      originalError: error instanceof Error ? error : undefined,
      isRetryable: false,
      suggestedAction: 'Verify blob integrity and re-upload if needed',
    };
  }

  // Network/Transaction errors
  if (
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('timed out')
  ) {
    return {
      code: SealErrorCode.TRANSACTION_TIMEOUT,
      message: 'Transaction timed out',
      originalError: error instanceof Error ? error : undefined,
      isRetryable: true,
      suggestedAction: 'Try again. The network may be congested.',
    };
  }

  if (
    lowerMessage.includes('failed to fetch') ||
    lowerMessage.includes('network error') ||
    lowerMessage.includes('fetch failed')
  ) {
    return {
      code: SealErrorCode.NETWORK_ERROR,
      message: 'Network error',
      originalError: error instanceof Error ? error : undefined,
      isRetryable: true,
      suggestedAction: 'Check your connection and try again',
    };
  }

  if (
    lowerMessage.includes('transaction') &&
    (lowerMessage.includes('failed') || lowerMessage.includes('error'))
  ) {
    return {
      code: SealErrorCode.TRANSACTION_FAILED,
      message: 'Transaction failed',
      originalError: error instanceof Error ? error : undefined,
      isRetryable: true,
      suggestedAction: 'Check gas budget and try again',
    };
  }

  // Key server errors
  if (lowerMessage.includes('key server')) {
    return {
      code: SealErrorCode.KEY_SERVER_ERROR,
      message: 'Key server error',
      originalError: error instanceof Error ? error : undefined,
      isRetryable: true,
      suggestedAction: 'Try again. The key server may be temporarily unavailable.',
    };
  }

  if (lowerMessage.includes('key share')) {
    return {
      code: SealErrorCode.INSUFFICIENT_KEY_SHARES,
      message: 'Insufficient key shares received',
      originalError: error instanceof Error ? error : undefined,
      isRetryable: true,
      suggestedAction: 'Not enough key servers responded. Try again.',
    };
  }

  // Default unknown error
  return {
    code: SealErrorCode.UNKNOWN,
    message: `Unknown error: ${errorMessage}`,
    originalError: error instanceof Error ? error : undefined,
    isRetryable: true,
    suggestedAction: 'Check the error details and try again',
  };
}

/**
 * Extract error message from various error types
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

/**
 * Format error context for display to users
 */
export function formatSealErrorForUser(context: SealErrorContext): string {
  const parts: string[] = [];

  parts.push(`Error: ${context.message}`);

  if (context.suggestedAction) {
    parts.push(`\nSuggestion: ${context.suggestedAction}`);
  }

  if (context.isRetryable) {
    parts.push('(This error may be retryable)');
  }

  return parts.join(' ');
}

/**
 * Check if error should trigger retry logic
 */
export function shouldRetryError(context: SealErrorContext): boolean {
  // Don't retry authorization errors
  if (
    context.code === SealErrorCode.POLICY_DENIED ||
    context.code === SealErrorCode.UNAUTHORIZED
  ) {
    return false;
  }

  // Retry transient errors
  return context.isRetryable;
}
