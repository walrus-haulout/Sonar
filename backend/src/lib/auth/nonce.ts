/**
 * Nonce generation and validation for authentication
 * Nonces have a 5-minute TTL and are one-time use
 */

import { randomUUID } from 'crypto';

interface NonceEntry {
  message: string;
  expiresAt: number;
  used: boolean;
}

// In-memory store - in production, use Redis
const nonceStore = new Map<string, NonceEntry>();

/**
 * Generate a new authentication nonce
 */
export function generateNonce(): string {
  return randomUUID();
}

/**
 * Store a nonce with its challenge message and TTL
 * Default TTL: 5 minutes
 */
export function storeNonce(
  nonce: string,
  message: string,
  ttlMs: number = 5 * 60 * 1000
): void {
  const expiresAt = Date.now() + ttlMs;

  nonceStore.set(nonce, {
    message,
    expiresAt,
    used: false,
  });

  // Auto-cleanup after TTL
  setTimeout(() => {
    nonceStore.delete(nonce);
  }, ttlMs);
}

/**
 * Get a nonce entry without mutating state
 * Returns the entry if valid, null otherwise
 */
export function getNonceEntry(nonce: string): { message: string; expiresAt: number } | null {
  const entry = nonceStore.get(nonce);

  if (!entry) {
    return null;
  }

  // Check if expired
  if (Date.now() > entry.expiresAt) {
    nonceStore.delete(nonce);
    return null;
  }

  // Check if already used
  if (entry.used) {
    return null;
  }

  return {
    message: entry.message,
    expiresAt: entry.expiresAt,
  };
}

/**
 * Verify a nonce is valid and mark it as used (one-time use)
 * Returns true if valid, false if expired/invalid/already used
 * This is a mutation operation - only call after validation succeeds
 */
export function verifyNonce(nonce: string): boolean {
  const entry = nonceStore.get(nonce);

  if (!entry) {
    return false;
  }

  // Check if expired
  if (Date.now() > entry.expiresAt) {
    nonceStore.delete(nonce);
    return false;
  }

  // Check if already used
  if (entry.used) {
    return false;
  }

  // Mark as used (one-time use)
  entry.used = true;

  return true;
}

/**
 * Consume a nonce - permanently remove it to prevent replay attacks
 * Call this after successful authentication
 */
export function consumeNonce(nonce: string): void {
  nonceStore.delete(nonce);
}

/**
 * Get the challenge message for a nonce
 * Returns the message if nonce exists, null otherwise
 */
export function getChallengeMessage(nonce: string): string | null {
  const entry = nonceStore.get(nonce);
  if (!entry) {
    return null;
  }
  return entry.message;
}

/**
 * Clear a nonce from the store
 */
export function clearNonce(nonce: string): void {
  nonceStore.delete(nonce);
}

/**
 * Get remaining TTL for a nonce (in milliseconds)
 * Returns -1 if nonce doesn't exist or is expired
 */
export function getNonceTTL(nonce: string): number {
  const entry = nonceStore.get(nonce);

  if (!entry) {
    return -1;
  }

  const ttl = entry.expiresAt - Date.now();
  return ttl > 0 ? ttl : -1;
}

/**
 * Clear expired nonces (cleanup)
 */
export function cleanupExpiredNonces(): void {
  const now = Date.now();

  for (const [nonce, entry] of nonceStore.entries()) {
    if (now > entry.expiresAt) {
      nonceStore.delete(nonce);
    }
  }
}
