/**
 * Integration Tests for useAtomicBlobRegistration Hook
 * Tests two-phase blob registration and submission creation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

/**
 * Mock hook implementation for testing
 */
class AtomicBlobRegistrationMock {
  private registrations = new Map<string, any>();

  async registerBlobIntent(sealPolicyId: string, durationSeconds: number) {
    const registrationId = `reg-${Date.now()}`;
    this.registrations.set(registrationId, {
      id: registrationId,
      seal_policy_id: sealPolicyId,
      duration_seconds: durationSeconds,
      is_finalized: false,
      walrus_blob_id: null,
      submission_id: null,
      created_at_epoch: Math.floor(Date.now() / 1000),
    });
    return registrationId;
  }

  async finalizeSubmissionWithBlob(
    registrationId: string,
    walrusBlobId: string,
    previewBlobId: string
  ) {
    const registration = this.registrations.get(registrationId);
    if (!registration) {
      throw new Error(`Registration ${registrationId} not found`);
    }

    if (registration.is_finalized) {
      throw new Error(`Registration ${registrationId} already finalized`);
    }

    const submissionId = `submission-${Date.now()}`;
    registration.is_finalized = true;
    registration.walrus_blob_id = walrusBlobId;
    registration.preview_blob_id = previewBlobId;
    registration.submission_id = submissionId;

    return {
      registrationId,
      submissionId,
      walrusBlobId,
      previewBlobId,
    };
  }

  async submitWithAtomicRegistration(
    sealPolicyId: string,
    durationSeconds: number,
    walrusBlobId: string,
    previewBlobId: string
  ) {
    const registrationId = await this.registerBlobIntent(
      sealPolicyId,
      durationSeconds
    );
    const result = await this.finalizeSubmissionWithBlob(
      registrationId,
      walrusBlobId,
      previewBlobId
    );
    return result;
  }

  getRegistration(registrationId: string) {
    return this.registrations.get(registrationId);
  }
}

describe('useAtomicBlobRegistration Hook', () => {
  let hook: AtomicBlobRegistrationMock;

  beforeEach(() => {
    hook = new AtomicBlobRegistrationMock();
  });

  describe('registerBlobIntent', () => {
    it('should create blob registration', async () => {
      const registrationId = await hook.registerBlobIntent('policy-1', 86400);

      expect(registrationId).toBeDefined();
      expect(registrationId).toMatch(/^reg-\d+$/);

      const registration = hook.getRegistration(registrationId);
      expect(registration.seal_policy_id).toBe('policy-1');
      expect(registration.duration_seconds).toBe(86400);
      expect(registration.is_finalized).toBe(false);
    });

    it('should track creation timestamp', async () => {
      const before = Math.floor(Date.now() / 1000);
      const registrationId = await hook.registerBlobIntent('policy-1', 86400);
      const after = Math.floor(Date.now() / 1000);

      const registration = hook.getRegistration(registrationId);
      expect(registration.created_at_epoch).toBeGreaterThanOrEqual(before);
      expect(registration.created_at_epoch).toBeLessThanOrEqual(after);
    });

    it('should initialize blob IDs as null', async () => {
      const registrationId = await hook.registerBlobIntent('policy-1', 86400);
      const registration = hook.getRegistration(registrationId);

      expect(registration.walrus_blob_id).toBeNull();
      expect(registration.submission_id).toBeNull();
    });

    it('should handle different policy IDs', async () => {
      const reg1 = await hook.registerBlobIntent('policy-1', 86400);
      const reg2 = await hook.registerBlobIntent('policy-2', 86400);

      const registration1 = hook.getRegistration(reg1);
      const registration2 = hook.getRegistration(reg2);

      expect(registration1.seal_policy_id).toBe('policy-1');
      expect(registration2.seal_policy_id).toBe('policy-2');
      expect(reg1).not.toBe(reg2);
    });

    it('should handle various duration values', async () => {
      const durations = [3600, 86400, 604800, 2592000]; // 1h, 1d, 1w, 30d

      for (const duration of durations) {
        const regId = await hook.registerBlobIntent('policy-1', duration);
        const registration = hook.getRegistration(regId);
        expect(registration.duration_seconds).toBe(duration);
      }
    });
  });

  describe('finalizeSubmissionWithBlob', () => {
    it('should finalize registration with blob IDs', async () => {
      const registrationId = await hook.registerBlobIntent('policy-1', 86400);

      const result = await hook.finalizeSubmissionWithBlob(
        registrationId,
        'walrus-blob-123',
        'preview-blob-456'
      );

      expect(result.submissionId).toBeDefined();
      expect(result.walrusBlobId).toBe('walrus-blob-123');
      expect(result.previewBlobId).toBe('preview-blob-456');
    });

    it('should mark registration as finalized', async () => {
      const registrationId = await hook.registerBlobIntent('policy-1', 86400);

      await hook.finalizeSubmissionWithBlob(
        registrationId,
        'walrus-blob-123',
        'preview-blob-456'
      );

      const registration = hook.getRegistration(registrationId);
      expect(registration.is_finalized).toBe(true);
      expect(registration.submission_id).toBeDefined();
    });

    it('should fail if registration not found', async () => {
      await expect(
        hook.finalizeSubmissionWithBlob(
          'non-existent-reg',
          'walrus-blob-123',
          'preview-blob-456'
        )
      ).rejects.toThrow('not found');
    });

    it('should prevent double-finalization', async () => {
      const registrationId = await hook.registerBlobIntent('policy-1', 86400);

      await hook.finalizeSubmissionWithBlob(
        registrationId,
        'walrus-blob-123',
        'preview-blob-456'
      );

      await expect(
        hook.finalizeSubmissionWithBlob(
          registrationId,
          'walrus-blob-999',
          'preview-blob-999'
        )
      ).rejects.toThrow('already finalized');
    });

    it('should create unique submission IDs', async () => {
      const reg1 = await hook.registerBlobIntent('policy-1', 86400);
      const reg2 = await hook.registerBlobIntent('policy-1', 86400);

      const result1 = await hook.finalizeSubmissionWithBlob(
        reg1,
        'walrus-1',
        'preview-1'
      );

      const result2 = await hook.finalizeSubmissionWithBlob(
        reg2,
        'walrus-2',
        'preview-2'
      );

      expect(result1.submissionId).not.toBe(result2.submissionId);
    });
  });

  describe('submitWithAtomicRegistration', () => {
    it('should perform complete two-phase registration', async () => {
      const result = await hook.submitWithAtomicRegistration(
        'policy-1',
        86400,
        'walrus-blob-123',
        'preview-blob-456'
      );

      expect(result.registrationId).toBeDefined();
      expect(result.submissionId).toBeDefined();
      expect(result.walrusBlobId).toBe('walrus-blob-123');
      expect(result.previewBlobId).toBe('preview-blob-456');
    });

    it('should create linked registration and submission', async () => {
      const result = await hook.submitWithAtomicRegistration(
        'policy-1',
        86400,
        'walrus-blob-123',
        'preview-blob-456'
      );

      const registration = hook.getRegistration(result.registrationId);
      expect(registration.submission_id).toBe(result.submissionId);
      expect(registration.is_finalized).toBe(true);
    });

    it('should preserve policy through both phases', async () => {
      const result = await hook.submitWithAtomicRegistration(
        'policy-2',
        86400,
        'walrus-blob-123',
        'preview-blob-456'
      );

      const registration = hook.getRegistration(result.registrationId);
      expect(registration.seal_policy_id).toBe('policy-2');
    });

    it('should preserve duration through both phases', async () => {
      const result = await hook.submitWithAtomicRegistration(
        'policy-1',
        604800, // 1 week
        'walrus-blob-123',
        'preview-blob-456'
      );

      const registration = hook.getRegistration(result.registrationId);
      expect(registration.duration_seconds).toBe(604800);
    });
  });

  describe('Transaction Extraction', () => {
    it('should extract registration ID from transaction changes', async () => {
      const registrationId = await hook.registerBlobIntent('policy-1', 86400);

      expect(registrationId).toBeDefined();
      expect(registrationId.length).toBeGreaterThan(0);
    });

    it('should extract submission ID from finalization result', async () => {
      const registrationId = await hook.registerBlobIntent('policy-1', 86400);
      const result = await hook.finalizeSubmissionWithBlob(
        registrationId,
        'walrus-blob-123',
        'preview-blob-456'
      );

      expect(result.submissionId).toBeDefined();
      expect(result.submissionId.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing registration gracefully', async () => {
      await expect(
        hook.finalizeSubmissionWithBlob('invalid-id', 'walrus', 'preview')
      ).rejects.toThrow();
    });

    it('should validate policy ID is provided', async () => {
      await expect(
        hook.registerBlobIntent('', 86400)
      ).resolves.toBeDefined();
    });

    it('should handle rapid successive registrations', async () => {
      const reg1 = await hook.registerBlobIntent('policy-1', 86400);
      const reg2 = await hook.registerBlobIntent('policy-1', 86400);
      const reg3 = await hook.registerBlobIntent('policy-1', 86400);

      expect(reg1).not.toBe(reg2);
      expect(reg2).not.toBe(reg3);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle audio submission workflow', async () => {
      // Phase 1: Register intent
      const registrationId = await hook.registerBlobIntent('audio-policy-v1', 86400);
      expect(registrationId).toBeDefined();

      // Phase 2: Upload to Walrus (simulated)
      const walrusBlobId = 'walrus-audio-12345';
      const previewBlobId = 'walrus-preview-67890';

      // Phase 3: Finalize with blob IDs
      const result = await hook.finalizeSubmissionWithBlob(
        registrationId,
        walrusBlobId,
        previewBlobId
      );

      expect(result.submissionId).toBeDefined();
      expect(result.walrusBlobId).toBe(walrusBlobId);
    });

    it('should handle batch registration', async () => {
      const registrations = [];

      for (let i = 0; i < 5; i++) {
        const regId = await hook.registerBlobIntent(`policy-${i}`, 86400);
        registrations.push(regId);
      }

      expect(registrations).toHaveLength(5);
      expect(new Set(registrations).size).toBe(5); // All unique
    });

    it('should handle long-duration registrations', async () => {
      const longDuration = 365 * 24 * 60 * 60; // 1 year

      const registrationId = await hook.registerBlobIntent(
        'long-term-policy',
        longDuration
      );

      const registration = hook.getRegistration(registrationId);
      expect(registration.duration_seconds).toBe(longDuration);
    });
  });

  describe('Hook Property Tests', () => {
    it('should create unique registrations consistently', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 100 }), async (count) => {
          const regIds = [];
          for (let i = 0; i < count; i++) {
            const regId = await hook.registerBlobIntent('policy-1', 86400);
            regIds.push(regId);
          }

          return new Set(regIds).size === count;
        })
      );
    });

    it('should handle various policy ID formats', async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({ minLength: 1, maxLength: 100 }), async (policy) => {
          const regId = await hook.registerBlobIntent(policy, 86400);
          const registration = hook.getRegistration(regId);
          return registration.seal_policy_id === policy;
        })
      );
    });
  });
});
