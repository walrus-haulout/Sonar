/**
 * Unit Tests for Structured Error Handling
 * Tests error classification and user-friendly messages
 */

import { describe, it, expect } from 'vitest';
import {
  SealErrorCode,
  classifySealError,
  shouldRetryError,
  formatSealErrorForUser,
} from '../seal_errors';

describe('Seal Error Handling', () => {
  describe('classifySealError', () => {
    it('should classify policy denial errors', () => {
      const error = new Error('Access denied by policy');
      const classified = classifySealError(error);

      expect(classified.code).toBe(SealErrorCode.POLICY_DENIED);
      expect(classified.isRetryable).toBe(false);
      expect(classified.suggestedAction).toContain('policy');
    });

    it('should classify unauthorized errors', () => {
      const error = new Error('Unauthorized access attempt');
      const classified = classifySealError(error);

      expect(classified.code).toBe(SealErrorCode.UNAUTHORIZED);
      expect(classified.isRetryable).toBe(false);
    });

    it('should classify session expiry', () => {
      const error = new Error('Session has expired');
      const classified = classifySealError(error);

      expect(classified.code).toBe(SealErrorCode.SESSION_EXPIRED);
      expect(classified.isRetryable).toBe(true);
    });

    it('should classify personal message signature error', () => {
      const error = new Error('Personal message signature is not set');
      const classified = classifySealError(error);

      expect(classified.code).toBe(SealErrorCode.INVALID_PERSONAL_MESSAGE);
      expect(classified.isRetryable).toBe(true);
      expect(classified.suggestedAction).toContain('authorize');
    });

    it('should classify decryption failures', () => {
      const error = new Error('Failed to decrypt blob');
      const classified = classifySealError(error);

      expect(classified.code).toBe(SealErrorCode.DECRYPTION_FAILED);
      expect(classified.isRetryable).toBe(false);
    });

    it('should classify invalid array length errors', () => {
      const error = new Error('RangeError: Invalid array length');
      const classified = classifySealError(error);

      expect(classified.code).toBe(SealErrorCode.INVALID_ARRAY_LENGTH);
      expect(classified.isRetryable).toBe(false);
    });

    it('should classify network timeouts', () => {
      const error = new Error('Transaction timeout');
      const classified = classifySealError(error);

      expect(classified.code).toBe(SealErrorCode.TRANSACTION_TIMEOUT);
      expect(classified.isRetryable).toBe(true);
    });

    it('should classify network errors', () => {
      const error = new Error('Failed to fetch from key server');
      const classified = classifySealError(error);

      expect(classified.code).toBe(SealErrorCode.NETWORK_ERROR);
      expect(classified.isRetryable).toBe(true);
    });

    it('should classify key server errors', () => {
      const error = new Error('Key server error: timeout');
      const classified = classifySealError(error);

      expect(classified.code).toBe(SealErrorCode.KEY_SERVER_ERROR);
      expect(classified.isRetryable).toBe(true);
    });

    it('should classify unknown errors', () => {
      const error = new Error('Some obscure error');
      const classified = classifySealError(error);

      expect(classified.code).toBe(SealErrorCode.UNKNOWN);
      expect(classified.isRetryable).toBe(true);
    });

    it('should handle non-Error objects', () => {
      const classified = classifySealError('A string error');
      expect(classified.code).toBeDefined();
      expect(classified.message).toContain('error');
    });

    it('should handle null/undefined', () => {
      const classified1 = classifySealError(null);
      const classified2 = classifySealError(undefined);

      expect(classified1.code).toBeDefined();
      expect(classified2.code).toBeDefined();
    });
  });

  describe('shouldRetryError', () => {
    it('should not retry policy denial', () => {
      const error = new Error('Access denied');
      const classified = classifySealError(error);
      expect(shouldRetryError(classified)).toBe(false);
    });

    it('should not retry authorization errors', () => {
      const error = new Error('Unauthorized');
      const classified = classifySealError(error);
      expect(shouldRetryError(classified)).toBe(false);
    });

    it('should retry session expiry', () => {
      const error = new Error('Session expired');
      const classified = classifySealError(error);
      expect(shouldRetryError(classified)).toBe(true);
    });

    it('should retry network errors', () => {
      const error = new Error('Network timeout');
      const classified = classifySealError(error);
      expect(shouldRetryError(classified)).toBe(true);
    });

    it('should not retry decryption failures', () => {
      const error = new Error('Decryption failed');
      const classified = classifySealError(error);
      expect(shouldRetryError(classified)).toBe(false);
    });
  });

  describe('formatSealErrorForUser', () => {
    it('should format policy error with action', () => {
      const error = new Error('Access denied');
      const classified = classifySealError(error);
      const formatted = formatSealErrorForUser(classified);

      expect(formatted).toContain('Error:');
      expect(formatted).toContain('Suggestion:');
      expect(formatted).not.toContain('(This error may be retryable)');
    });

    it('should indicate retryable errors', () => {
      const error = new Error('Session expired');
      const classified = classifySealError(error);
      const formatted = formatSealErrorForUser(classified);

      expect(formatted).toContain('(This error may be retryable)');
    });

    it('should provide helpful user guidance', () => {
      const error = new Error('Personal message signature is not set');
      const classified = classifySealError(error);
      const formatted = formatSealErrorForUser(classified);

      expect(formatted).toContain('authorize');
      expect(formatted).not.toMatch(/undefined/i);
    });
  });

  describe('Error Classification Accuracy', () => {
    const errorScenarios = [
      {
        error: 'denied',
        expectedCode: SealErrorCode.POLICY_DENIED,
        shouldRetry: false,
      },
      {
        error: 'unauthorized',
        expectedCode: SealErrorCode.UNAUTHORIZED,
        shouldRetry: false,
      },
      {
        error: 'session expired',
        expectedCode: SealErrorCode.SESSION_EXPIRED,
        shouldRetry: true,
      },
      {
        error: 'timeout',
        expectedCode: SealErrorCode.TRANSACTION_TIMEOUT,
        shouldRetry: true,
      },
      {
        error: 'Failed to fetch',
        expectedCode: SealErrorCode.NETWORK_ERROR,
        shouldRetry: true,
      },
      {
        error: 'Decryption failed',
        expectedCode: SealErrorCode.DECRYPTION_FAILED,
        shouldRetry: false,
      },
      {
        error: 'Invalid array length',
        expectedCode: SealErrorCode.INVALID_ARRAY_LENGTH,
        shouldRetry: false,
      },
    ];

    errorScenarios.forEach(({ error, expectedCode, shouldRetry }) => {
      it(`should classify "${error}" correctly`, () => {
        const classified = classifySealError(new Error(error));
        expect(classified.code).toBe(expectedCode);
        expect(shouldRetryError(classified)).toBe(shouldRetry);
      });
    });
  });
});
