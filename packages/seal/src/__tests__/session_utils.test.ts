/**
 * Unit Tests for Session Management Utilities
 * Tests proactive refresh, batch operation planning, and session lifecycle
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  shouldRefreshSession,
  getSessionTimeRemaining,
  getSessionHealthPercent,
  canSessionLastFor,
  formatSessionExpiry,
  shouldRefreshSessionForBatch,
  calculateSafeBatchSize,
  DEFAULT_SESSION_REFRESH_CONFIG,
  type ManagedSession,
  type SessionRefreshConfig,
  type BatchOperationConfig,
} from '../session_utils';
import * as fc from 'fast-check';

describe('Session Management', () => {
  let now: number;
  let session: ManagedSession;

  beforeEach(() => {
    now = Date.now();
  });

  describe('shouldRefreshSession', () => {
    it('should not refresh if plenty of time remains', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now,
        expiresAt: now + 30 * 60 * 1000, // 30 minutes
        refreshAttempts: 0,
      };

      expect(shouldRefreshSession(session)).toBe(false);
    });

    it('should refresh when within default threshold (2 min before expiry)', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now,
        expiresAt: now + 1 * 60 * 1000, // 1 minute
        refreshAttempts: 0,
      };

      expect(shouldRefreshSession(session)).toBe(true);
    });

    it('should refresh at exact threshold boundary', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now,
        expiresAt: now + 2 * 60 * 1000, // Exactly 2 minutes
        refreshAttempts: 0,
      };

      expect(shouldRefreshSession(session)).toBe(true);
    });

    it('should refresh if session already expired', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now - 30 * 60 * 1000,
        expiresAt: now - 5 * 60 * 1000, // 5 minutes ago
        refreshAttempts: 0,
      };

      expect(shouldRefreshSession(session)).toBe(true);
    });

    it('should allow custom refresh threshold', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now,
        expiresAt: now + 5 * 60 * 1000, // 5 minutes
        refreshAttempts: 0,
      };

      const config: SessionRefreshConfig = {
        refreshThresholdMs: 10 * 60 * 1000, // 10 minutes
        maxRefreshRetries: 3,
        retryDelayMs: 1000,
      };

      expect(shouldRefreshSession(session, config)).toBe(true);
    });
  });

  describe('getSessionTimeRemaining', () => {
    it('should return time until expiry', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now,
        expiresAt: now + 10 * 60 * 1000,
        refreshAttempts: 0,
      };

      const remaining = getSessionTimeRemaining(session);
      expect(remaining).toBeGreaterThan(9 * 60 * 1000);
      expect(remaining).toBeLessThanOrEqual(10 * 60 * 1000);
    });

    it('should return 0 if already expired', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now - 30 * 60 * 1000,
        expiresAt: now - 5 * 60 * 1000,
        refreshAttempts: 0,
      };

      expect(getSessionTimeRemaining(session)).toBe(0);
    });
  });

  describe('getSessionHealthPercent', () => {
    it('should return 100 for fresh session', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now,
        expiresAt: now + 60 * 60 * 1000,
        refreshAttempts: 0,
      };

      expect(getSessionHealthPercent(session)).toBe(100);
    });

    it('should return 50 for half-expired session', () => {
      const lifetime = 60 * 60 * 1000; // 1 hour
      session = {
        sessionKey: {} as any,
        createdAt: now - lifetime / 2,
        expiresAt: now + lifetime / 2,
        refreshAttempts: 0,
      };

      expect(getSessionHealthPercent(session)).toBe(50);
    });

    it('should return 0 for expired session', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now - 60 * 60 * 1000,
        expiresAt: now - 10 * 60 * 1000,
        refreshAttempts: 0,
      };

      expect(getSessionHealthPercent(session)).toBe(0);
    });

    it('should return correct percentage throughout lifecycle', () => {
      const lifetime = 60 * 60 * 1000;

      const testPercents = [0, 25, 50, 75, 100];
      testPercents.forEach((percent) => {
        const elapsed = (percent / 100) * lifetime;
        session = {
          sessionKey: {} as any,
          createdAt: now - elapsed,
          expiresAt: now + (lifetime - elapsed),
          refreshAttempts: 0,
        };

        const health = getSessionHealthPercent(session);
        // Allow 1% margin due to timing
        expect(Math.abs(health - (100 - percent))).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('canSessionLastFor', () => {
    it('should return true if session has plenty of time', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now,
        expiresAt: now + 30 * 60 * 1000,
        refreshAttempts: 0,
      };

      expect(canSessionLastFor(session, 5 * 60 * 1000)).toBe(true);
    });

    it('should return false if operation would timeout', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now,
        expiresAt: now + 1 * 60 * 1000,
        refreshAttempts: 0,
      };

      // 10 minute operation with 1.1x buffer = 11 minutes needed
      expect(canSessionLastFor(session, 10 * 60 * 1000)).toBe(false);
    });

    it('should include 10% buffer in calculation', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now,
        expiresAt: now + 11 * 60 * 1000, // 11 minutes
        refreshAttempts: 0,
      };

      // 10 minutes with 1.1x buffer = 11 minutes required
      // Should be borderline true
      expect(canSessionLastFor(session, 10 * 60 * 1000)).toBe(true);
    });

    it('should handle expired sessions', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now - 30 * 60 * 1000,
        expiresAt: now - 5 * 60 * 1000,
        refreshAttempts: 0,
      };

      expect(canSessionLastFor(session, 1000)).toBe(false);
    });
  });

  describe('formatSessionExpiry', () => {
    it('should format minutes and seconds', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now,
        expiresAt: now + 5 * 60 * 1000 + 30 * 1000, // 5m 30s
        refreshAttempts: 0,
      };

      const formatted = formatSessionExpiry(session);
      expect(formatted).toContain('5m');
      expect(formatted).toContain('s');
    });

    it('should format seconds only when < 1 minute', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now,
        expiresAt: now + 45 * 1000,
        refreshAttempts: 0,
      };

      const formatted = formatSessionExpiry(session);
      expect(formatted).toMatch(/^\d+s$/);
    });

    it('should show Expired when past expiry', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now - 30 * 60 * 1000,
        expiresAt: now - 5 * 60 * 1000,
        refreshAttempts: 0,
      };

      expect(formatSessionExpiry(session)).toBe('Expired');
    });

    it('should format exactly 1 minute', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now,
        expiresAt: now + 60 * 1000,
        refreshAttempts: 0,
      };

      const formatted = formatSessionExpiry(session);
      expect(formatted).toMatch(/^1m \d+s$/);
    });
  });

  describe('shouldRefreshSessionForBatch', () => {
    it('should not refresh if session covers entire batch', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now,
        expiresAt: now + 30 * 60 * 1000,
        refreshAttempts: 0,
      };

      const batchConfig: BatchOperationConfig = {
        totalItems: 100,
        estimatedTimePerItemMs: 1000,
        minItemsBeforeRefresh: 20,
      };

      expect(shouldRefreshSessionForBatch(session, batchConfig)).toBe(false);
    });

    it('should refresh if session cannot cover all items', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now,
        expiresAt: now + 30 * 1000, // 30 seconds
        refreshAttempts: 0,
      };

      const batchConfig: BatchOperationConfig = {
        totalItems: 100,
        estimatedTimePerItemMs: 1000, // 100 seconds total
        minItemsBeforeRefresh: 20,
      };

      expect(shouldRefreshSessionForBatch(session, batchConfig)).toBe(true);
    });

    it('should refresh if only few items will complete before expiry', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now,
        expiresAt: now + 15 * 1000, // 15 seconds
        refreshAttempts: 0,
      };

      const batchConfig: BatchOperationConfig = {
        totalItems: 100,
        estimatedTimePerItemMs: 1000,
        minItemsBeforeRefresh: 20,
      };

      // 15 seconds / 1000ms per item = 15 items. Less than minItemsBeforeRefresh (20)
      expect(shouldRefreshSessionForBatch(session, batchConfig)).toBe(true);
    });

    it('should not refresh if minimum items threshold met', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now,
        expiresAt: now + 30 * 1000, // 30 seconds
        refreshAttempts: 0,
      };

      const batchConfig: BatchOperationConfig = {
        totalItems: 100,
        estimatedTimePerItemMs: 1000,
        minItemsBeforeRefresh: 20,
      };

      // 30 seconds / 1000ms = 30 items. Meets minItemsBeforeRefresh (20)
      expect(shouldRefreshSessionForBatch(session, batchConfig)).toBe(false);
    });
  });

  describe('calculateSafeBatchSize', () => {
    it('should calculate batch size with default buffer', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now,
        expiresAt: now + 60 * 1000,
        refreshAttempts: 0,
      };

      // 60 seconds - 10% buffer = 54 seconds = 54 items
      const batchSize = calculateSafeBatchSize(session, 1000);
      expect(batchSize).toBeLessThanOrEqual(54);
      expect(batchSize).toBeGreaterThanOrEqual(50);
    });

    it('should apply custom buffer percentage', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now,
        expiresAt: now + 100 * 1000,
        refreshAttempts: 0,
      };

      const batchSizeDefault = calculateSafeBatchSize(session, 1000, 10);
      const batchSize20Percent = calculateSafeBatchSize(session, 1000, 20);

      // Less buffer = larger batch
      expect(batchSize20Percent).toBeGreaterThan(batchSizeDefault);
    });

    it('should return minimum 1 item', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now,
        expiresAt: now + 100, // Only 100ms left
        refreshAttempts: 0,
      };

      const batchSize = calculateSafeBatchSize(session, 1000); // 1s per item
      expect(batchSize).toBe(1);
    });

    it('should handle fast operations correctly', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now,
        expiresAt: now + 60 * 1000,
        refreshAttempts: 0,
      };

      // 60 seconds - 10% buffer = 54 seconds, at 10ms per item = 5400 items
      const batchSize = calculateSafeBatchSize(session, 10, 10);
      expect(batchSize).toBeGreaterThan(5000);
    });

    it('should handle slow operations correctly', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now,
        expiresAt: now + 60 * 1000,
        refreshAttempts: 0,
      };

      // 60 seconds - 10% buffer = 54 seconds, at 10s per item = 5 items
      const batchSize = calculateSafeBatchSize(session, 10 * 1000, 10);
      expect(batchSize).toBe(5);
    });
  });

  describe('Session Property Tests', () => {
    it('should maintain health percentage between 0 and 100', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0 }),
          fc.integer({ min: 0 })
        ),
        (elapsedMs, remainingMs) => {
          if (remainingMs === 0) return true; // Skip expired case

          session = {
            sessionKey: {} as any,
            createdAt: now - elapsedMs,
            expiresAt: now + remainingMs,
            refreshAttempts: 0,
          };

          const health = getSessionHealthPercent(session);
          return health >= 0 && health <= 100;
        }
      );
    });

    it('should report accurate time remaining', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1000, max: 3600000 }), (ttlMs) => {
          session = {
            sessionKey: {} as any,
            createdAt: now,
            expiresAt: now + ttlMs,
            refreshAttempts: 0,
          };

          const remaining = getSessionTimeRemaining(session);
          return remaining > 0 && remaining <= ttlMs;
        })
      );
    });

    it('should batch size always respect buffer percentage', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1000, max: 600000 }), // 1s to 10min TTL
          fc.integer({ min: 100, max: 10000 }), // 100ms to 10s per item
          fc.integer({ min: 5, max: 50 }) // 5-50% buffer
        ),
        (ttlMs, timePerItemMs, bufferPercent) => {
          session = {
            sessionKey: {} as any,
            createdAt: now,
            expiresAt: now + ttlMs,
            refreshAttempts: 0,
          };

          const batchSize = calculateSafeBatchSize(session, timePerItemMs, bufferPercent);

          // Batch size * time per item should not exceed available time
          return batchSize * timePerItemMs <= ttlMs;
        }
      );
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle long-running batch upload', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now,
        expiresAt: now + 15 * 60 * 1000, // 15 minute session
        refreshAttempts: 0,
      };

      const batchConfig: BatchOperationConfig = {
        totalItems: 500,
        estimatedTimePerItemMs: 1000, // 1s per item = 8+ minutes
        minItemsBeforeRefresh: 100,
      };

      // Should not need refresh yet - session covers batch with buffer
      expect(shouldRefreshSessionForBatch(session, batchConfig)).toBe(false);
    });

    it('should handle session about to expire', () => {
      session = {
        sessionKey: {} as any,
        createdAt: now - 55 * 60 * 1000,
        expiresAt: now + 5 * 60 * 1000, // 5 minutes left
        refreshAttempts: 0,
      };

      expect(shouldRefreshSession(session)).toBe(true);
      expect(getSessionHealthPercent(session)).toBeLessThan(10);
    });

    it('should handle session lifecycle', () => {
      const lifetime = 60 * 60 * 1000; // 1 hour

      // Fresh session
      let sessionTime = now;
      session = {
        sessionKey: {} as any,
        createdAt: sessionTime,
        expiresAt: sessionTime + lifetime,
        refreshAttempts: 0,
      };
      expect(getSessionHealthPercent(session)).toBe(100);

      // 30 minutes later
      sessionTime = now + 30 * 60 * 1000;
      session.expiresAt = sessionTime + (lifetime / 2);
      expect(getSessionHealthPercent(session)).toBe(50);

      // 55 minutes later - needs refresh
      sessionTime = now + 55 * 60 * 1000;
      session.expiresAt = sessionTime + (5 * 60 * 1000);
      expect(shouldRefreshSession(session)).toBe(true);
    });
  });
});
