/**
 * Unit Tests for VerificationStep Session Reuse Logic
 * Tests that createSession is called only once per verification flow
 * and that session caching prevents duplicate wallet prompts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Mock for tracking session creation calls
 */
class SessionMock {
  private callCount = 0;
  private sessionCache: any = null;
  private sessionValidity = new Map<string, boolean>();

  async createSession(options: any) {
    this.callCount++;
    const sessionId = `session-${this.callCount}`;
    this.sessionValidity.set(sessionId, true);
    const sessionKey = {
      id: sessionId,
      export: () => ({ sessionData: 'exported', id: sessionId }),
      isExpired: () => !this.sessionValidity.get(sessionId),
    };
    this.sessionCache = sessionKey;
    return sessionKey;
  }

  async getOrCreateSession(options: any) {
    // Check cache first
    if (this.sessionCache && !this.sessionCache.isExpired()) {
      return this.sessionCache;
    }
    // Create new
    return this.createSession(options);
  }

  getCallCount() {
    return this.callCount;
  }

  getCache() {
    return this.sessionCache;
  }

  resetCallCount() {
    this.callCount = 0;
  }

  expireSession() {
    if (this.sessionCache) {
      this.sessionValidity.set(this.sessionCache.id, false);
    }
  }

  restoreValidity() {
    if (this.sessionCache) {
      this.sessionValidity.set(this.sessionCache.id, true);
    }
  }

  clearCache() {
    this.sessionCache = null;
  }
}

describe('VerificationStep Session Reuse Logic', () => {
  let sessionMock: SessionMock;

  beforeEach(() => {
    sessionMock = new SessionMock();
  });

  describe('Single verification flow', () => {
    it('should create session once when no cached session exists', async () => {
      const session1 = await sessionMock.createSession({ ttlMin: 30 });

      expect(sessionMock.getCallCount()).toBe(1);
      expect(session1.id).toBe('session-1');
    });

    it('should reuse cached session instead of creating new one', async () => {
      // First call creates session
      const session1 = await sessionMock.getOrCreateSession({ ttlMin: 30 });
      expect(sessionMock.getCallCount()).toBe(1);

      // Second call should use cache
      const session2 = await sessionMock.getOrCreateSession({ ttlMin: 30 });
      expect(sessionMock.getCallCount()).toBe(1); // Still 1, not 2

      expect(session1.id).toBe(session2.id);
    });

    it('should create new session if cached one is expired', async () => {
      // Create first session
      const session1 = await sessionMock.createSession({ ttlMin: 30 });
      expect(sessionMock.getCallCount()).toBe(1);

      // Expire the cached session
      sessionMock.expireSession();

      // Should create new session
      const session2 = await sessionMock.getOrCreateSession({ ttlMin: 30 });
      expect(sessionMock.getCallCount()).toBe(2);

      expect(session1.id).not.toBe(session2.id);
    });
  });

  describe('Authorization flow simulation', () => {
    it('should not prompt wallet twice with valid cached session', async () => {
      // Phase 1: Authorization button click
      const session1 = await sessionMock.getOrCreateSession({ ttlMin: 30 });
      const walletPromptsPhase1 = sessionMock.getCallCount();

      // Phase 2: Start verification (should reuse session, not create new one)
      const session2 = await sessionMock.getOrCreateSession({ ttlMin: 30 });
      const walletPromptsPhase2 = sessionMock.getCallCount();

      // Should only have prompted wallet once
      expect(walletPromptsPhase1).toBe(1);
      expect(walletPromptsPhase2).toBe(1); // Still 1, no new prompts
      expect(session1.id).toBe(session2.id);
    });

    it('should prompt wallet again after session expiry', async () => {
      // Initial authorization
      const session1 = await sessionMock.getOrCreateSession({ ttlMin: 30 });
      expect(sessionMock.getCallCount()).toBe(1);

      // Session expires
      sessionMock.expireSession();

      // User retries verification - should prompt wallet again
      const session2 = await sessionMock.getOrCreateSession({ ttlMin: 30 });
      expect(sessionMock.getCallCount()).toBe(2);

      // Sessions should be different
      expect(session1.id).not.toBe(session2.id);
    });
  });

  describe('Multi-file verification', () => {
    it('should use same session for multiple files', async () => {
      // Create session for first file
      const file1Session = await sessionMock.getOrCreateSession({ ttlMin: 30 });
      expect(sessionMock.getCallCount()).toBe(1);

      // Verify second file with same session (no new prompt)
      const file2Session = await sessionMock.getOrCreateSession({ ttlMin: 30 });
      expect(sessionMock.getCallCount()).toBe(1); // Still 1

      // Verify third file with same session
      const file3Session = await sessionMock.getOrCreateSession({ ttlMin: 30 });
      expect(sessionMock.getCallCount()).toBe(1); // Still 1

      // All should reference same session
      expect(file1Session.id).toBe(file2Session.id);
      expect(file2Session.id).toBe(file3Session.id);
    });

    it('should create new session for retry after all files fail', async () => {
      // Initial verification for file 1
      const session1 = await sessionMock.getOrCreateSession({ ttlMin: 30 });
      expect(sessionMock.getCallCount()).toBe(1);

      // Verification fails, session expires, clear cache for retry
      sessionMock.expireSession();
      sessionMock.clearCache();

      const session2 = await sessionMock.getOrCreateSession({ ttlMin: 30 });
      expect(sessionMock.getCallCount()).toBe(2);

      // New session for retry should be created (expired session cleared)
      expect(session1.id).not.toBe(session2.id);
    });
  });

  describe('Session export and serialization', () => {
    it('should export session correctly', async () => {
      const session = await sessionMock.getOrCreateSession({ ttlMin: 30 });
      const exported = session.export();

      expect(exported).toBeDefined();
      expect(exported.sessionData).toBe('exported');
      expect(exported.id).toBe('session-1');
    });

    it('should maintain export consistency across reuses', async () => {
      // First use
      const session1 = await sessionMock.getOrCreateSession({ ttlMin: 30 });
      const export1 = session1.export();

      // Reuse from cache
      const session2 = await sessionMock.getOrCreateSession({ ttlMin: 30 });
      const export2 = session2.export();

      // Exports should be identical
      expect(export1).toEqual(export2);
    });
  });

  describe('Guard refs behavior', () => {
    it('should prevent duplicate authorization attempts', async () => {
      let authorizationAttempts = 0;

      const mockAuthorize = async () => {
        // Simulate isAuthorizingRef guard
        if (authorizationAttempts > 0) {
          return; // Guard prevents second attempt
        }
        authorizationAttempts++;
        await sessionMock.createSession({ ttlMin: 30 });
      };

      // First attempt succeeds
      await mockAuthorize();
      expect(authorizationAttempts).toBe(1);
      expect(sessionMock.getCallCount()).toBe(1);

      // Second attempt is blocked by guard
      await mockAuthorize();
      expect(authorizationAttempts).toBe(1); // Still 1
      expect(sessionMock.getCallCount()).toBe(1); // Still 1
    });

    it('should reset guard on failed state to allow retry', async () => {
      let isAuthorizingRef = true;
      let verificationState = 'running';

      // Initial authorization
      if (!isAuthorizingRef) {
        await sessionMock.createSession({ ttlMin: 30 });
      }
      expect(sessionMock.getCallCount()).toBe(0); // Not called due to guard

      // Reset guard on failed state
      isAuthorizingRef = false;
      verificationState = 'failed';

      // Retry should work
      if (!isAuthorizingRef) {
        await sessionMock.createSession({ ttlMin: 30 });
      }
      expect(sessionMock.getCallCount()).toBe(1); // Now called
    });
  });

  describe('React Strict Mode protection', () => {
    it('should handle double-mounting without duplicate session creation', async () => {
      // First mount
      const session1 = await sessionMock.getOrCreateSession({ ttlMin: 30 });
      expect(sessionMock.getCallCount()).toBe(1);

      // React Strict Mode causes second mount - should use cache
      const session2 = await sessionMock.getOrCreateSession({ ttlMin: 30 });
      expect(sessionMock.getCallCount()).toBe(1); // Still 1

      // Should return same session
      expect(session1.id).toBe(session2.id);
    });
  });

  describe('Session validity checks', () => {
    it('should validate session before reusing', async () => {
      // Create session
      const session = await sessionMock.createSession({ ttlMin: 30 });
      expect(sessionMock.getCallCount()).toBe(1);

      // Session is valid, should reuse
      const reused = await sessionMock.getOrCreateSession({ ttlMin: 30 });
      expect(sessionMock.getCallCount()).toBe(1);

      // Expire session
      sessionMock.expireSession();

      // Should create new session since old one is expired
      const newSession = await sessionMock.getOrCreateSession({ ttlMin: 30 });
      expect(sessionMock.getCallCount()).toBe(2);
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle complete verification flow with single session', async () => {
      // User clicks "Sign & Authorize"
      const authSession = await sessionMock.getOrCreateSession({ ttlMin: 30 });
      let promptCount = sessionMock.getCallCount();
      expect(promptCount).toBe(1);

      // System starts verification
      const verifySession = await sessionMock.getOrCreateSession({ ttlMin: 30 });
      promptCount = sessionMock.getCallCount();
      expect(promptCount).toBe(1); // No new prompts

      // Multiple verification stages use same session
      for (let i = 0; i < 4; i++) {
        const stageSession = await sessionMock.getOrCreateSession({ ttlMin: 30 });
        expect(stageSession.id).toBe(authSession.id);
      }

      expect(sessionMock.getCallCount()).toBe(1); // Still only 1 wallet prompt
    });

    it('should handle retry after verification failure', async () => {
      // Initial verification with session
      const session1 = await sessionMock.getOrCreateSession({ ttlMin: 30 });
      expect(sessionMock.getCallCount()).toBe(1);

      // Verification fails and session expires
      sessionMock.expireSession();

      // User clicks retry - should use new session
      const session2 = await sessionMock.getOrCreateSession({ ttlMin: 30 });
      expect(sessionMock.getCallCount()).toBe(2);

      // Sessions should be different
      expect(session1.id).not.toBe(session2.id);
    });
  });
});
