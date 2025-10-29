/**
 * Nonce generation and validation for authentication
 * Nonces have a 5-minute TTL and are one-time use
 */

import { v4 as uuidv4 } from 'crypto';
import { randomUUID } from 'crypto';

interface NonceEntry {
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
 * Store a nonce with TTL
 * Default TTL: 5 minutes
 */
export function storeNonce(nonce: string, ttlMs: number = 5 * 60 * 1000): void {
  const expiresAt = Date.now() + ttlMs;

  nonceStore.set(nonce, {
    expiresAt,
    used: false,
  });

  // Auto-cleanup after TTL
  setTimeout(() => {
    nonceStore.delete(nonce);
  }, ttlMs);
}

/**
 * Verify a nonce is valid and mark it as used (one-time use)
 * Returns true if valid, false if expired/invalid/already used
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
