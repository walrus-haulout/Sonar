/**
 * @sonar/seal - SONAR Protocol's Seal Encryption SDK
 *
 * High-level TypeScript SDK for Mysten Seal encryption/decryption
 * with SONAR-specific defaults and optimizations.
 *
 * Features:
 * - Identity-Based Encryption (IBE) with threshold decryption
 * - Envelope encryption for large files (AES + Seal)
 * - Session key management with IndexedDB caching
 * - Batch decryption with key prefetching
 * - Progress tracking and error handling
 *
 * @example
 * ```typescript
 * import { createSonarSealClient, encryptFile, createSession } from '@sonar/seal';
 *
 * // Initialize client
 * const client = createSonarSealClient({
 *   suiClient,
 *   network: 'testnet',
 * });
 *
 * // Create session
 * const session = await createSession(address, packageId, {
 *   suiClient,
 *   signMessage: wallet.signMessage,
 * });
 *
 * // Encrypt file
 * const result = await encryptFile(client, fileData, {
 *   packageId,
 *   accessPolicy: 'purchase',
 * });
 * ```
 */

// ============================================================================
// Core Client
// ============================================================================

export {
  createSonarSealClient,
  getSealClient,
  initializeSealClient,
  isSealClientInitialized,
  resetSealClient,
  getSealClientConfig,
  getKeyServersFromEnv,
  createSealClientFromEnv,
  type Network,
} from './client';

// ============================================================================
// Session Management
// ============================================================================

export {
  createSession,
  restoreSession,
  cacheSession,
  clearSession,
  isSessionValid,
  isSessionExpired,
  getSessionExpirationTime,
  getOrCreateSession,
  refreshSession,
  ensureSessionValid,
  getSessionInfo,
  clearAllSessions,
} from './session';

// ============================================================================
// Encryption APIs
// ============================================================================

export {
  encryptFile,
  encryptMetadata,
  estimateEncryptedFileSize,
  recommendEnvelopeEncryption,
} from './encryption';

// ============================================================================
// Decryption APIs
// ============================================================================

export {
  decryptFile,
  batchDecrypt,
  decryptMetadata,
  decryptFileWithRetry,
} from './decryption';

// ============================================================================
// Re-encryption APIs
// ============================================================================

export {
  reencryptBlob,
  reencryptBlobStreaming,
  validateReencryptionOptions,
} from './reencryption';

// ============================================================================
// Cache Management
// ============================================================================

export {
  getCache,
  setCache,
  createCache,
  IndexedDBCache,
  MemoryCache,
  NoCache,
} from './cache';

// ============================================================================
// Types
// ============================================================================

export type {
  // Configuration
  SealConfig,
  KeyServerConfig,
  CreateSessionOptions,
  SessionKeyExport,

  // Encryption
  EncryptFileOptions,
  EncryptionResult,
  EnvelopeEncryptionResult,
  EncryptionMetadata,
  DemType,

  // Decryption
  DecryptFileOptions,
  DecryptionResult,
  DecryptionMetadata,
  BatchDecryptItem,
  BatchDecryptOptions,

  // Policy
  PolicyType,

  // Callbacks
  ProgressCallback,

  // Cache
  CacheStrategy,
  KeyCacheEntry,
} from './types';

export type {
  // Re-encryption
  ReencryptionOptions,
  ReencryptionStage,
} from './reencryption';

// Export SealErrorCode enum from types
export { SealErrorCode } from './types';

// ============================================================================
// Errors
// ============================================================================

export {
  SealError,
  EncryptionError,
  DecryptionError,
  SessionError,
  SessionExpiredError,
  PolicyDeniedError,
  ConfigError,
  NetworkError,
  isSealError,
  getUserFriendlyMessage,
  wrapWithErrorHandling,
} from './errors';

// ============================================================================
// Utilities
// ============================================================================

export {
  // Conversion utilities
  hexToBytes,
  bytesToHex,
  base64ToBytes,
  bytesToBase64,

  // Validation
  validateSessionTTL,
  validateThreshold,

  // Identity
  generateRandomIdentity,

  // Package ID
  parsePackageId,

  // Retry
  retry,

  // File size
  shouldUseEnvelopeEncryption,
  estimateEncryptedSize,
  formatFileSize,

  // Platform detection
  isBrowser,
} from './utils';

// ============================================================================
// Constants
// ============================================================================

export {
  // Defaults
  DEFAULT_THRESHOLD,
  DEFAULT_SESSION_TTL_MIN,
  DEFAULT_BATCH_SIZE,
  DEFAULT_DEM_TYPE,
  DEFAULT_TIMEOUT_MS,

  // Limits
  MIN_SESSION_TTL_MIN,
  MAX_SESSION_TTL_MIN,
  MAX_BATCH_SIZE,

  // Thresholds
  ENVELOPE_THRESHOLD_BYTES,
  SEAL_OVERHEAD_BYTES,

  // Cache TTL
  SESSION_CACHE_TTL_MS,
  KEY_CACHE_TTL_MS,

  // Key servers
  TESTNET_KEY_SERVERS,
  MAINNET_KEY_SERVERS,

  // Platform
  HAS_INDEXEDDB,

  // IndexedDB
  INDEXEDDB_NAME,
  INDEXEDDB_VERSION,
  INDEXEDDB_STORES,
} from './constants';

// ============================================================================
// Re-exports from @mysten/seal
// ============================================================================

export type { SealClient, SessionKey } from '@mysten/seal';

// ============================================================================
// Package Metadata
// ============================================================================

export const VERSION = '0.1.0';
export const NAME = '@sonar/seal';
