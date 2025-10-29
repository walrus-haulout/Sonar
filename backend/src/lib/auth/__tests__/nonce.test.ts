/**
 * Tests for nonce generation and validation
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  generateNonce,
  storeNonce,
  getNonceEntry,
  verifyNonce,
  consumeNonce,
  getChallengeMessage,
  clearNonce,
  getNonceTTL,
  cleanupExpiredNonces,
} from '../nonce';

describe('Nonce Management', () => {
  let testNonce: string;
  const testMessage = 'Test message for nonce';

  beforeEach(() => {
    testNonce = generateNonce();
  });

  describe('generateNonce', () => {
    it('should generate a valid UUID v4', () => {
      const nonce = generateNonce();
      // UUID v4 regex pattern
      const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuidV4Regex.test(nonce)).toBe(true);
    });

    it('should generate unique nonces', () => {
      const nonce1 = generateNonce();
      const nonce2 = generateNonce();
      expect(nonce1).not.toBe(nonce2);
    });
  });

  describe('storeNonce', () => {
    it('should store a nonce with message and TTL', () => {
      storeNonce(testNonce, testMessage, 5 * 60 * 1000);
      const entry = getNonceEntry(testNonce);
      expect(entry).not.toBeNull();
      expect(entry?.message).toBe(testMessage);
    });

    it('should expire nonce after TTL', async () => {
      const shortTTL = 100; // 100ms
      storeNonce(testNonce, testMessage, shortTTL);

      // Should exist immediately
      expect(getNonceEntry(testNonce)).not.toBeNull();

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, shortTTL + 50));

      // Should be expired
      expect(getNonceEntry(testNonce)).toBeNull();
    });

    it('should use default TTL of 5 minutes', () => {
      const ttl = getNonceTTL(testNonce);
      expect(ttl).toBe(-1); // Not stored yet

      storeNonce(testNonce, testMessage); // Default TTL
      const storedTTL = getNonceTTL(testNonce);

      // Should be close to 5 minutes (300000ms)
      expect(storedTTL).toBeGreaterThan(299000);
      expect(storedTTL).toBeLessThanOrEqual(300000);
    });
  });

  describe('getNonceEntry', () => {
    it('should return nonce entry without mutation', () => {
      storeNonce(testNonce, testMessage, 5 * 60 * 1000);

      // Get entry twice - should work both times
      const entry1 = getNonceEntry(testNonce);
      const entry2 = getNonceEntry(testNonce);

      expect(entry1).not.toBeNull();
      expect(entry2).not.toBeNull();
      expect(entry1?.message).toBe(testMessage);
      expect(entry2?.message).toBe(testMessage);
    });

    it('should return null for non-existent nonce', () => {
      const entry = getNonceEntry('non-existent-nonce');
      expect(entry).toBeNull();
    });

    it('should return null for expired nonce', async () => {
      const shortTTL = 50; // 50ms
      storeNonce(testNonce, testMessage, shortTTL);

      await new Promise((resolve) => setTimeout(resolve, shortTTL + 25));

      expect(getNonceEntry(testNonce)).toBeNull();
    });
  });

  describe('verifyNonce', () => {
    it('should return true for valid nonce (use consumeNonce to make unusable)', () => {
      storeNonce(testNonce, testMessage, 5 * 60 * 1000);

      const isValid = verifyNonce(testNonce);
      expect(isValid).toBe(true);

      // After consumeNonce, verifyNonce should fail
      consumeNonce(testNonce);
      const isValidSecond = verifyNonce(testNonce);
      expect(isValidSecond).toBe(false);
    });

    it('should return false for non-existent nonce', () => {
      const isValid = verifyNonce('non-existent-nonce');
      expect(isValid).toBe(false);
    });

    it('should return false for expired nonce', async () => {
      const shortTTL = 50; // 50ms
      storeNonce(testNonce, testMessage, shortTTL);

      await new Promise((resolve) => setTimeout(resolve, shortTTL + 25));

      const isValid = verifyNonce(testNonce);
      expect(isValid).toBe(false);
    });
  });

  describe('consumeNonce', () => {
    it('should permanently delete nonce', () => {
      storeNonce(testNonce, testMessage, 5 * 60 * 1000);
      expect(getNonceEntry(testNonce)).not.toBeNull();

      consumeNonce(testNonce);
      expect(getNonceEntry(testNonce)).toBeNull();
    });

    it('should prevent replay attacks', () => {
      storeNonce(testNonce, testMessage, 5 * 60 * 1000);

      // First use
      const entry1 = getNonceEntry(testNonce);
      expect(entry1).not.toBeNull();

      // Consume (successful auth)
      consumeNonce(testNonce);

      // Second use attempt (replay) should fail
      const entry2 = getNonceEntry(testNonce);
      expect(entry2).toBeNull();
    });
  });

  describe('getChallengeMessage', () => {
    it('should return the challenge message', () => {
      storeNonce(testNonce, testMessage, 5 * 60 * 1000);
      const message = getChallengeMessage(testNonce);
      expect(message).toBe(testMessage);
    });

    it('should return null for non-existent nonce', () => {
      const message = getChallengeMessage('non-existent-nonce');
      expect(message).toBeNull();
    });
  });

  describe('clearNonce', () => {
    it('should remove a nonce from store', () => {
      storeNonce(testNonce, testMessage, 5 * 60 * 1000);
      expect(getNonceEntry(testNonce)).not.toBeNull();

      clearNonce(testNonce);
      expect(getNonceEntry(testNonce)).toBeNull();
    });
  });

  describe('getNonceTTL', () => {
    it('should return remaining TTL in milliseconds', () => {
      const ttl = 10000; // 10 seconds
      storeNonce(testNonce, testMessage, ttl);

      const remainingTTL = getNonceTTL(testNonce);
      expect(remainingTTL).toBeGreaterThan(0);
      expect(remainingTTL).toBeLessThanOrEqual(ttl);
    });

    it('should return -1 for non-existent nonce', () => {
      const ttl = getNonceTTL('non-existent-nonce');
      expect(ttl).toBe(-1);
    });

    it('should return -1 for expired nonce', async () => {
      const shortTTL = 50; // 50ms
      storeNonce(testNonce, testMessage, shortTTL);

      await new Promise((resolve) => setTimeout(resolve, shortTTL + 25));

      const ttl = getNonceTTL(testNonce);
      expect(ttl).toBe(-1);
    });
  });

  describe('cleanupExpiredNonces', () => {
    it('should remove expired nonces', async () => {
      const nonce1 = generateNonce();
      const nonce2 = generateNonce();

      storeNonce(nonce1, testMessage, 50); // 50ms
      storeNonce(nonce2, testMessage, 5 * 60 * 1000); // 5 minutes

      // Wait for nonce1 to expire
      await new Promise((resolve) => setTimeout(resolve, 75));

      // Manual cleanup
      cleanupExpiredNonces();

      expect(getNonceEntry(nonce1)).toBeNull();
      expect(getNonceEntry(nonce2)).not.toBeNull();
    });
  });

  describe('Race condition prevention', () => {
    it('should prevent race condition between reading and marking used', async () => {
      storeNonce(testNonce, testMessage, 5 * 60 * 1000);

      // Simulate concurrent reads (no mutation from reading)
      const promise1 = Promise.resolve(getNonceEntry(testNonce));
      const promise2 = Promise.resolve(getNonceEntry(testNonce));

      const [entry1, entry2] = await Promise.all([promise1, promise2]);

      // Both should succeed (no mutations from reading)
      expect(entry1).not.toBeNull();
      expect(entry2).not.toBeNull();
      expect(entry1?.message).toBe(testMessage);
      expect(entry2?.message).toBe(testMessage);
    });

    it('should only allow single successful verification', () => {
      storeNonce(testNonce, testMessage, 5 * 60 * 1000);

      // Get entry (read-only)
      const entry = getNonceEntry(testNonce);
      expect(entry).not.toBeNull();

      // Consume (mutation - deletes nonce)
      consumeNonce(testNonce);

      // Second attempt to get entry should fail
      const secondEntry = getNonceEntry(testNonce);
      expect(secondEntry).toBeNull();
    });
  });
});
