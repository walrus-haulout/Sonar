/**
 * @sonar/seal - Type Definitions
 * TypeScript interfaces and types for Seal encryption SDK
 */

import type { SuiClient } from '@mysten/sui/client';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Key server configuration
 */
export interface KeyServerConfig {
  /** Sui object ID of the key server */
  objectId: string;
  /** Weight for threshold calculation (usually 1) */
  weight: number;
  /** Optional API key for authenticated requests */
  apiKey?: string;
  /** Optional API key name for authentication */
  apiKeyName?: string;
}

/**
 * Seal client configuration options
 */
export interface SealConfig {
  /** Sui client instance */
  suiClient: SuiClient;
  /** Array of key server configurations */
  keyServers: KeyServerConfig[];
  /** Decryption threshold (default: 2) */
  threshold?: number;
  /** Verify key servers on initialization (default: true) */
  verifyServers?: boolean;
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Session TTL in minutes (default: 10) */
  sessionTTL?: number;
  /** Cache strategy for session keys */
  cacheStrategy?: 'indexeddb' | 'memory' | 'none';
}

// ============================================================================
// Encryption Types
// ============================================================================

/**
 * Data Encapsulation Method (DEM) type
 */
export enum DemType {
  /** AES-256-GCM (recommended for performance) */
  AES = 'AES',
  /** HMAC-based CTR mode (for on-chain decryption) */
  HMAC_CTR = 'HMAC_CTR',
}

/**
 * Access policy types supported by SONAR
 */
export type PolicyType =
  | 'purchase'      // Requires dataset purchase
  | 'allowlist'     // Requires address in allowlist
  | 'subscription'  // Requires valid subscription NFT
  | 'timelock'      // Public after timestamp
  | 'private';      // Owner-only access

/**
 * Encryption options
 */
export interface EncryptOptions {
  /** Minimum number of key servers required for decryption */
  threshold: number;
  /** Package ID for access policy */
  packageId: Uint8Array;
  /** Unique identifier for this encrypted data */
  id: Uint8Array;
  /** Data to encrypt */
  data: Uint8Array;
  /** DEM type (default: AES) */
  demType?: DemType;
  /** Additional authenticated data */
  aad?: Uint8Array;
}

/**
 * High-level encryption options for files
 */
export interface EncryptFileOptions {
  /** Encryption threshold (default: 2) */
  threshold?: number;
  /** Package ID for access policy (optional for encryption, required for decryption) */
  packageId?: string;
  /** Access policy type */
  accessPolicy: PolicyType;
  /** Custom identity (optional, random if not provided) */
  customId?: Uint8Array;
  /** Use envelope encryption for large files (default: auto) */
  useEnvelope?: boolean;
}

/**
 * Result of encryption operation
 */
export interface EncryptionResult {
  /** Encrypted data bytes */
  encryptedData: Uint8Array;
  /** Backup symmetric key */
  backupKey: Uint8Array;
  /** Identity string (hex-encoded) */
  identity: string;
  /** Metadata about the encryption */
  metadata: EncryptionMetadata;
}

/**
 * Encryption metadata
 */
export interface EncryptionMetadata {
  /** Decryption threshold */
  threshold: number;
  /** Package ID used (optional for encryption, required for decryption) */
  packageId?: string;
  /** Access policy type */
  accessPolicy: PolicyType;
  /** DEM type used */
  demType: DemType;
  /** Timestamp of encryption */
  timestamp: number;
  /** File size (original) */
  originalSize: number;
  /** File size (encrypted) */
  encryptedSize: number;
  /** Whether envelope encryption was used */
  isEnvelope: boolean;
}

/**
 * Envelope encryption result (for large files)
 */
export interface EnvelopeEncryptionResult {
  /** AES-encrypted file data */
  encryptedData: Uint8Array;
  /** Seal-encrypted AES key */
  sealedKey: EncryptionResult;
}

// ============================================================================
// Decryption Types
// ============================================================================

/**
 * Session key export format (for caching)
 */
export interface SessionKeyExport {
  /** Base64-encoded session key data */
  data: string;
  /** User's Sui address */
  address: string;
  /** Package ID */
  packageId: string;
  /** Expiration timestamp */
  expiresAt: number;
  /** Creation timestamp */
  createdAt: number;
}

/**
 * Session key creation options
 */
export interface CreateSessionOptions {
  /** User's Sui address */
  address: string;
  /** Package ID for access policy */
  packageId: string;
  /** TTL in minutes (1-30) */
  ttlMin?: number;
  /** Sui client instance */
  suiClient: SuiClient;
  /** Multi-version registry name (optional) */
  mvrName?: string;
  /** Function to sign personal message */
  signMessage: (message: Uint8Array) => Promise<{ signature: string }>;
}

/**
 * Decryption options
 */
export interface DecryptOptions {
  /** Encrypted data bytes */
  data: Uint8Array;
  /** Session key for authentication */
  sessionKey: any; // SessionKey type from @mysten/seal
  /** Transaction bytes from seal_approve function */
  txBytes: Uint8Array;
  /** Check share consistency (default: false) */
  checkShareConsistency?: boolean;
  /** Check little-endian encoding (default: false) */
  checkLEEncoding?: boolean;
}

/**
 * High-level decryption options for files
 */
export interface DecryptFileOptions {
  /** Session key for authentication */
  sessionKey: any; // SessionKey type from @mysten/seal
  /** Package ID for access policy */
  packageId: string;
  /** Identity string (hex-encoded) */
  identity: string;
  /** Policy module name (e.g., 'allowlist', 'purchase') */
  policyModule: string;
  /** Additional arguments for seal_approve function */
  policyArgs?: any[];
  /** Sui client for transaction building */
  suiClient: SuiClient;
}

/**
 * Result of decryption operation
 */
export interface DecryptionResult {
  /** Decrypted data bytes */
  data: Uint8Array;
  /** Metadata about the decryption */
  metadata: DecryptionMetadata;
}

/**
 * Decryption metadata
 */
export interface DecryptionMetadata {
  /** Timestamp when decrypted */
  decryptedAt: number;
  /** Identity used for decryption */
  identity: string;
  /** Policy module used */
  policyModule: string;
}

/**
 * Batch decryption item
 */
export interface BatchDecryptItem {
  /** Encrypted data bytes */
  encryptedData: Uint8Array;
  /** Identity string (hex-encoded) */
  identity: string;
  /** Optional metadata for tracking */
  metadata?: any;
}

/**
 * Batch decryption options
 */
export interface BatchDecryptOptions {
  /** Session key for authentication */
  sessionKey: any; // SessionKey type from @mysten/seal
  /** Package ID for access policy */
  packageId: string;
  /** Policy module name */
  policyModule: string;
  /** Sui client for transaction building */
  suiClient: SuiClient;
  /** Threshold for decryption (default: 2) */
  threshold?: number;
  /** Batch size for key fetching (default: 10) */
  batchSize?: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Seal error codes
 */
export enum SealErrorCode {
  // Configuration errors
  INVALID_CONFIG = 'INVALID_CONFIG',
  MISSING_KEY_SERVERS = 'MISSING_KEY_SERVERS',
  INVALID_THRESHOLD = 'INVALID_THRESHOLD',

  // Encryption errors
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED',
  INVALID_DATA = 'INVALID_DATA',
  INVALID_PACKAGE_ID = 'INVALID_PACKAGE_ID',

  // Decryption errors
  DECRYPTION_FAILED = 'DECRYPTION_FAILED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SESSION_INVALID = 'SESSION_INVALID',
  POLICY_DENIED = 'POLICY_DENIED',
  KEY_SERVER_ERROR = 'KEY_SERVER_ERROR',

  // Session errors
  SESSION_CREATION_FAILED = 'SESSION_CREATION_FAILED',
  SIGNATURE_FAILED = 'SIGNATURE_FAILED',
  CACHE_ERROR = 'CACHE_ERROR',

  // Network errors
  TIMEOUT = 'TIMEOUT',
  NETWORK_ERROR = 'NETWORK_ERROR',
}

/**
 * Seal error class
 */
export class SealError extends Error {
  constructor(
    public code: SealErrorCode,
    message: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'SealError';
  }
}

// ============================================================================
// Cache Types
// ============================================================================

/**
 * Cache entry for decryption keys
 */
export interface KeyCacheEntry {
  /** Package ID + Identity */
  key: string;
  /** Cached key data */
  keyData: any;
  /** Timestamp when cached */
  cachedAt: number;
  /** TTL in milliseconds */
  ttl: number;
}

/**
 * Cache strategy interface
 */
export interface CacheStrategy {
  /** Get cached value */
  get(key: string): Promise<any | null>;
  /** Set cached value */
  set(key: string, value: any, ttl?: number): Promise<void>;
  /** Delete cached value */
  delete(key: string): Promise<void>;
  /** Clear all cached values */
  clear(): Promise<void>;
  /** Check if key exists */
  has(key: string): Promise<boolean>;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Progress callback for long-running operations
 */
export type ProgressCallback = (progress: number, message?: string) => void;

/**
 * Utility type for hex strings
 */
export type HexString = string;

/**
 * Utility type for base64 strings
 */
export type Base64String = string;
