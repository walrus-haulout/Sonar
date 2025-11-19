/**
 * @sonar/seal - Session Management Utilities
 * Support for proactive session refresh and batch operation optimization
 */

import type { SessionKey } from '@mysten/seal';

export interface SessionRefreshConfig {
  // How much time (in ms) before expiry should we refresh?
  refreshThresholdMs: number;
  // Maximum number of retries if refresh fails
  maxRefreshRetries: number;
  // Delay between retry attempts (ms)
  retryDelayMs: number;
}

export const DEFAULT_SESSION_REFRESH_CONFIG: SessionRefreshConfig = {
  refreshThresholdMs: 2 * 60 * 1000, // Refresh 2 minutes before expiry
  maxRefreshRetries: 3,
  retryDelayMs: 1000,
};

/**
 * Session state with refresh tracking
 */
export interface ManagedSession {
  sessionKey: SessionKey;
  createdAt: number;
  expiresAt: number;
  lastRefreshAt?: number;
  refreshAttempts: number;
}

/**
 * Check if session should be refreshed soon
 */
export function shouldRefreshSession(
  session: ManagedSession,
  config: SessionRefreshConfig = DEFAULT_SESSION_REFRESH_CONFIG
): boolean {
  const now = Date.now();
  const timeUntilExpiry = session.expiresAt - now;

  // Refresh if within threshold
  if (timeUntilExpiry < config.refreshThresholdMs) {
    return true;
  }

  // Always refresh if already expired
  if (now > session.expiresAt) {
    return true;
  }

  return false;
}

/**
 * Get time until session expiry in milliseconds
 */
export function getSessionTimeRemaining(session: ManagedSession): number {
  const now = Date.now();
  return Math.max(0, session.expiresAt - now);
}

/**
 * Get session expiry as percentage (100 = fresh, 0 = expired)
 */
export function getSessionHealthPercent(session: ManagedSession): number {
  const now = Date.now();
  const totalLifetime = session.expiresAt - session.createdAt;
  const timeElapsed = now - session.createdAt;

  if (timeElapsed >= totalLifetime) {
    return 0; // Expired
  }

  return Math.round(((totalLifetime - timeElapsed) / totalLifetime) * 100);
}

/**
 * Estimate if session will last for an operation
 */
export function canSessionLastFor(
  session: ManagedSession,
  estimatedOperationTimeMs: number
): boolean {
  const now = Date.now();
  const timeUntilExpiry = session.expiresAt - now;

  // Add 10% buffer to ensure completion
  const requiredTime = estimatedOperationTimeMs * 1.1;

  return timeUntilExpiry > requiredTime;
}

/**
 * Format session expiry time for display
 */
export function formatSessionExpiry(session: ManagedSession): string {
  const timeRemaining = getSessionTimeRemaining(session);

  if (timeRemaining <= 0) {
    return 'Expired';
  }

  const minutes = Math.floor(timeRemaining / 60000);
  const seconds = Math.floor((timeRemaining % 60000) / 1000);

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

/**
 * Configure batch operation with session management
 */
export interface BatchOperationConfig {
  // Total number of items to process
  totalItems: number;
  // Estimated time per item in milliseconds
  estimatedTimePerItemMs: number;
  // Refresh session if fewer items will complete before expiry
  minItemsBeforeRefresh: number;
}

/**
 * Calculate if session needs refresh for batch operation
 */
export function shouldRefreshSessionForBatch(
  session: ManagedSession,
  batchConfig: BatchOperationConfig
): boolean {
  const totalEstimatedTimeMs = batchConfig.totalItems * batchConfig.estimatedTimePerItemMs;

  // Check if session will last for entire batch
  if (!canSessionLastFor(session, totalEstimatedTimeMs)) {
    return true;
  }

  // Check if we're running low on items that can be processed
  const timeRemaining = getSessionTimeRemaining(session);
  const itemsBeforeExpiry = Math.floor(timeRemaining / batchConfig.estimatedTimePerItemMs);

  return itemsBeforeExpiry < batchConfig.minItemsBeforeRefresh;
}

/**
 * Calculate safe batch size for current session
 */
export function calculateSafeBatchSize(
  session: ManagedSession,
  estimatedTimePerItemMs: number,
  bufferPercent: number = 10
): number {
  const timeRemaining = getSessionTimeRemaining(session);
  const timeWithBuffer = timeRemaining * ((100 - bufferPercent) / 100);

  return Math.max(1, Math.floor(timeWithBuffer / estimatedTimePerItemMs));
}
