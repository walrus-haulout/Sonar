/**
 * @sonar/seal - Session Management
 * SessionKey creation, caching, and restoration
 */

import { SessionKey } from '@mysten/seal';
import type { SuiClient } from '@mysten/sui/client';
import type { CreateSessionOptions, SessionKeyExport } from './types';
import { SessionError, SessionExpiredError } from './errors';
import { SealErrorCode } from './types';
import { getCache } from './cache';
import {
  DEFAULT_SESSION_TTL_MIN,
  MIN_SESSION_TTL_MIN,
  MAX_SESSION_TTL_MIN,
} from './constants';
import { validateSessionTTL, parsePackageId } from './utils';

/**
 * Create new session key with wallet signature
 */
export async function createSession(
  address: string,
  packageId: string,
  options: Omit<CreateSessionOptions, 'address' | 'packageId'>
): Promise<SessionKey> {
  const {
    ttlMin = DEFAULT_SESSION_TTL_MIN,
    suiClient,
    mvrName,
    signMessage,
  } = options;

  // Validate TTL
  if (!validateSessionTTL(ttlMin)) {
    throw new SessionError(
      SealErrorCode.SESSION_CREATION_FAILED,
      `Invalid TTL: ${ttlMin}. Must be between ${MIN_SESSION_TTL_MIN} and ${MAX_SESSION_TTL_MIN} minutes.`
    );
  }

  try {
    // Create session key
    const sessionKey = await SessionKey.create({
      address,
      packageId,
      ttlMin,
      suiClient,
      mvrName,
    });

    // Get personal message for user to sign
    const message = sessionKey.getPersonalMessage();

    // User signs with wallet
    const { signature } = await signMessage(message);

    // Set signature on session key
    sessionKey.setPersonalMessageSignature(signature);

    // Cache session
    await cacheSession(packageId, sessionKey, address);

    return sessionKey;
  } catch (error) {
    throw new SessionError(
      SealErrorCode.SESSION_CREATION_FAILED,
      'Failed to create session key',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Restore session key from cache
 */
export async function restoreSession(
  packageId: string,
  suiClient: SuiClient
): Promise<SessionKey | null> {
  try {
    const cache = getCache();
    const cached = await cache.get(packageId);

    if (!cached || !cached.data) {
      return null;
    }

    // Import session key
    const sessionKey = SessionKey.import(cached.data, suiClient);

    // Check if expired
    if (isSessionExpired(sessionKey)) {
      // Delete from cache
      await cache.delete(packageId);
      return null;
    }

    return sessionKey;
  } catch (error) {
    console.error('Failed to restore session:', error);
    return null;
  }
}

/**
 * Cache session key for later restoration
 */
export async function cacheSession(
  packageId: string,
  sessionKey: SessionKey,
  address: string
): Promise<void> {
  try {
    const exported = sessionKey.export();
    const expiresAt = getSessionExpirationTime(sessionKey);

    const cache = getCache();
    await cache.set(packageId, {
      packageId,
      data: exported,
      address,
      expiresAt,
      createdAt: Date.now(),
    });
  } catch (error) {
    console.error('Failed to cache session:', error);
    // Don't throw - caching is optional
  }
}

/**
 * Delete session from cache
 */
export async function clearSession(packageId: string): Promise<void> {
  try {
    const cache = getCache();
    await cache.delete(packageId);
  } catch (error) {
    console.error('Failed to clear session:', error);
  }
}

/**
 * Check if session key is valid (not expired)
 */
export function isSessionValid(sessionKey: SessionKey): boolean {
  return !isSessionExpired(sessionKey);
}

/**
 * Check if session key is expired
 */
export function isSessionExpired(sessionKey: SessionKey): boolean {
  try {
    return sessionKey.isExpired();
  } catch (error) {
    // If error checking expiration, assume expired
    return true;
  }
}

/**
 * Get session expiration timestamp
 */
export function getSessionExpirationTime(sessionKey: SessionKey): number {
  // SessionKey doesn't expose expiration directly, so we calculate it
  // based on the TTL that was used when creating it
  // This is an approximation - actual expiration is stored in the session
  const now = Date.now();
  const maxTTL = MAX_SESSION_TTL_MIN * 60 * 1000;
  return now + maxTTL; // Conservative estimate
}

/**
 * Get or create session key
 * Tries to restore from cache first, creates new if not found or expired
 */
export async function getOrCreateSession(
  address: string,
  packageId: string,
  options: Omit<CreateSessionOptions, 'address' | 'packageId'>
): Promise<SessionKey> {
  // Try to restore from cache
  const cached = await restoreSession(packageId, options.suiClient);

  if (cached && isSessionValid(cached)) {
    return cached;
  }

  // Create new session
  return createSession(address, packageId, options);
}

/**
 * Refresh session key before expiration
 * Creates a new session if the current one is close to expiring
 */
export async function refreshSession(
  sessionKey: SessionKey,
  address: string,
  packageId: string,
  options: Omit<CreateSessionOptions, 'address' | 'packageId'>,
  thresholdMin: number = 2
): Promise<SessionKey> {
  // Check if session is close to expiring
  const expiresAt = getSessionExpirationTime(sessionKey);
  const now = Date.now();
  const timeUntilExpiry = expiresAt - now;
  const thresholdMs = thresholdMin * 60 * 1000;

  if (timeUntilExpiry > thresholdMs) {
    // Session still valid, return as-is
    return sessionKey;
  }

  // Session close to expiring, create new one
  return createSession(address, packageId, options);
}

/**
 * Ensure session is valid, throw if expired
 */
export function ensureSessionValid(sessionKey: SessionKey): void {
  if (isSessionExpired(sessionKey)) {
    throw new SessionExpiredError(getSessionExpirationTime(sessionKey));
  }
}

/**
 * Get session info for display purposes
 */
export function getSessionInfo(sessionKey: SessionKey): {
  isValid: boolean;
  isExpired: boolean;
  expiresAt: number;
} {
  const isExpired = isSessionExpired(sessionKey);
  const expiresAt = getSessionExpirationTime(sessionKey);

  return {
    isValid: !isExpired,
    isExpired,
    expiresAt,
  };
}

/**
 * Clear all cached sessions
 */
export async function clearAllSessions(): Promise<void> {
  try {
    const cache = getCache();
    await cache.clear();
  } catch (error) {
    console.error('Failed to clear all sessions:', error);
  }
}
