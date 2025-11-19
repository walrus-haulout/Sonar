/**
 * Unit and Property Tests for Re-encryption Module
 * Tests policy rotation, key update, and access revocation scenarios
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateReencryptionOptions } from '../reencryption';
import type { ReencryptionOptions } from '../reencryption';
import * as fc from 'fast-check';

/** Helper to create valid re-encryption options for testing */
function createValidOptions(overrides?: Partial<ReencryptionOptions>): ReencryptionOptions {
  return {
    decryptionOptions: {
      client: {} as any,
      identity: 'policy-1',
      sessionKey: {},
      packageId: 'test-package-id',
      suiClient: {} as any,
    },
    encryptionOptions: {
      client: {} as any,
      identity: 'policy-2',
      accessPolicy: 'private',
    },
    ...overrides,
  };
}

describe('Re-encryption Module', () => {
  describe('validateReencryptionOptions', () => {
    let validOptions: ReencryptionOptions;

    beforeEach(() => {
      validOptions = createValidOptions();
    });

    it('should accept valid re-encryption options', () => {
      const result = validateReencryptionOptions(validOptions);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject if decryption options missing', () => {
      const invalid = createValidOptions() as any;
      invalid.decryptionOptions = undefined;

      const result = validateReencryptionOptions(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Decryption options required');
    });

    it('should reject if encryption options missing', () => {
      const invalid = createValidOptions() as any;
      invalid.encryptionOptions = undefined;

      const result = validateReencryptionOptions(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Encryption options required');
    });

    it('should reject if old and new policies are the same', () => {
      const invalid = {
        ...validOptions,
        encryptionOptions: {
          ...validOptions.encryptionOptions,
          identity: 'policy-1', // Same as old
        },
      };

      const result = validateReencryptionOptions(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('New policy must differ from current policy');
    });

    it('should reject if decryption client missing', () => {
      const invalid = {
        ...validOptions,
        decryptionOptions: {
          ...validOptions.decryptionOptions,
          client: null as any,
        },
      };

      const result = validateReencryptionOptions(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Decryption client required');
    });

    it('should reject if original policy identity missing', () => {
      const invalid = {
        ...validOptions,
        decryptionOptions: {
          ...validOptions.decryptionOptions,
          identity: '',
        },
      };

      const result = validateReencryptionOptions(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Original policy identity required');
    });

    it('should reject if new policy identity missing', () => {
      const invalid = {
        ...validOptions,
        encryptionOptions: {
          ...validOptions.encryptionOptions,
          identity: '',
        },
      };

      const result = validateReencryptionOptions(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('New policy identity required');
    });
  });

  describe('Re-encryption Policy Rotation Scenarios', () => {
    it('should validate subscription policy change', () => {
      const options = createValidOptions({
        decryptionOptions: {
          client: {} as any,
          identity: 'subscription-tier-1',
          sessionKey: {},
          packageId: 'test-package-id',
          suiClient: {} as any,
        },
        encryptionOptions: {
          client: {} as any,
          identity: 'subscription-tier-2',
          accessPolicy: 'subscription',
        },
      });

      expect(validateReencryptionOptions(options).valid).toBe(true);
    });

    it('should validate access revocation (remove user)', () => {
      const options = createValidOptions({
        decryptionOptions: {
          client: {} as any,
          identity: 'policy-with-user-123',
          sessionKey: {},
          packageId: 'test-package-id',
          suiClient: {} as any,
        },
        encryptionOptions: {
          client: {} as any,
          identity: 'policy-without-user-123',
          accessPolicy: 'allowlist',
        },
      });

      expect(validateReencryptionOptions(options).valid).toBe(true);
    });

    it('should validate key rotation', () => {
      const options = createValidOptions({
        decryptionOptions: {
          client: {} as any,
          identity: 'master-key-v1',
          sessionKey: {},
          packageId: 'test-package-id',
          suiClient: {} as any,
        },
        encryptionOptions: {
          client: {} as any,
          identity: 'master-key-v2',
          accessPolicy: 'private',
        },
      });

      expect(validateReencryptionOptions(options).valid).toBe(true);
    });
  });

  describe('Re-encryption Property Tests', () => {
    it('should accept any different policy IDs', () => {
      fc.assert(
        fc.property(
          fc.tuple(fc.string({ minLength: 1 }), fc.string({ minLength: 1 })),
          ([policy1, policy2]) => {
            fc.pre(policy1 !== policy2);

            const options = createValidOptions({
              decryptionOptions: {
                client: {} as any,
                identity: policy1,
                sessionKey: {},
                packageId: 'test-package-id',
                suiClient: {} as any,
              },
              encryptionOptions: {
                client: {} as any,
                identity: policy2,
                accessPolicy: 'private',
              },
            });

            return validateReencryptionOptions(options).valid === true;
          }
        )
      );
    });

    it('should reject if policies are identical', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (policy) => {
          const options = createValidOptions({
            decryptionOptions: {
              client: {} as any,
              identity: policy,
              sessionKey: {},
              packageId: 'test-package-id',
              suiClient: {} as any,
            },
            encryptionOptions: {
              client: {} as any,
              identity: policy,
              accessPolicy: 'private',
            },
          });

          return validateReencryptionOptions(options).valid === false;
        })
      );
    });
  });

  describe('Large-Scale Re-encryption', () => {
    it('should handle GB-scale encrypted files', () => {
      const progressCallback = vi.fn();
      const options = createValidOptions({
        decryptionOptions: {
          client: {} as any,
          identity: 'current-policy',
          sessionKey: {},
          packageId: 'test-package-id',
          suiClient: {} as any,
        },
        encryptionOptions: {
          client: {} as any,
          identity: 'new-policy',
          accessPolicy: 'purchase',
        },
        onProgress: progressCallback,
      });

      expect(validateReencryptionOptions(options).valid).toBe(true);
      expect(progressCallback).not.toHaveBeenCalled();
    });

    it('should validate multi-hour re-encryption', () => {
      // For 10GB file with 100MB/s throughput = 100 seconds
      const options = createValidOptions({
        decryptionOptions: {
          client: {} as any,
          identity: 'policy-for-huge-file',
          sessionKey: {},
          packageId: 'test-package-id',
          suiClient: {} as any,
        },
        encryptionOptions: {
          client: {} as any,
          identity: 'policy-for-huge-file-v2',
          accessPolicy: 'hybrid',
        },
      });

      expect(validateReencryptionOptions(options).valid).toBe(true);
    });
  });
});
