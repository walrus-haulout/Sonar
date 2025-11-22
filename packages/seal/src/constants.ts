/**
 * @sonar/seal - Constants
 * Configuration constants and defaults
 */

import { DemType } from "./types";

/**
 * Default encryption threshold
 * Requires 2 out of N key servers for decryption
 */
export const DEFAULT_THRESHOLD = 2;

/**
 * Default session TTL in minutes
 * Maximum is 30 minutes per Seal protocol
 */
export const DEFAULT_SESSION_TTL_MIN = 10;

/**
 * Minimum session TTL (1 minute)
 */
export const MIN_SESSION_TTL_MIN = 1;

/**
 * Maximum session TTL (30 minutes)
 */
export const MAX_SESSION_TTL_MIN = 30;

/**
 * Default request timeout in milliseconds
 * Increased to 60 seconds to handle network latency and key server response times
 */
export const DEFAULT_TIMEOUT_MS = 60000;

/**
 * Default DEM (Data Encapsulation Method)
 * AES-256-GCM is recommended for best performance
 */
export const DEFAULT_DEM_TYPE: DemType = DemType.AES;

/**
 * Default cache strategy
 */
export const DEFAULT_CACHE_STRATEGY: "indexeddb" | "memory" = "indexeddb";

/**
 * File size threshold for envelope encryption (1MB)
 * Files larger than this will use envelope encryption automatically
 */
export const ENVELOPE_THRESHOLD_BYTES = 1024 * 1024;

/**
 * Seal encryption overhead estimate (bytes)
 * Actual overhead is ~200-300 bytes
 */
export const SEAL_OVERHEAD_BYTES = 300;

/**
 * Default batch size for key fetching
 * Seal recommends ≤10 identities per batch
 */
export const DEFAULT_BATCH_SIZE = 10;

/**
 * Maximum batch size for key fetching
 */
export const MAX_BATCH_SIZE = 10;

/**
 * Cache TTL for decryption keys (milliseconds)
 * Keys are cached for 5 minutes by default
 */
export const KEY_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Session cache TTL (milliseconds)
 * Sessions are cached until expiration
 */
export const SESSION_CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * IndexedDB database name
 */
export const INDEXEDDB_NAME = "sonar_seal";

/**
 * IndexedDB version
 */
export const INDEXEDDB_VERSION = 1;

/**
 * IndexedDB store names
 */
export const INDEXEDDB_STORES = {
  SESSIONS: "sessions",
  KEYS: "keys",
} as const;

/**
 * Retry configuration defaults
 */
export const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  INITIAL_DELAY_MS: 1000,
  MAX_DELAY_MS: 10000,
  BACKOFF_FACTOR: 2,
} as const;

/**
 * Default identity length (bytes)
 * 16 bytes = 128 bits
 */
export const DEFAULT_IDENTITY_LENGTH = 16;

/**
 * Testnet key server object IDs
 * These should be replaced with actual values from environment
 */
export const TESTNET_KEY_SERVERS = [
  process.env.SEAL_SERVER_1_TESTNET || "",
  process.env.SEAL_SERVER_2_TESTNET || "",
].filter(Boolean);

/**
 * Mainnet key server object IDs
 * These should be replaced with actual values from environment
 */
export const MAINNET_KEY_SERVERS = [
  process.env.SEAL_SERVER_1_MAINNET || "",
  process.env.SEAL_SERVER_2_MAINNET || "",
].filter(Boolean);

/**
 * Environment detection
 */
export const IS_BROWSER = typeof window !== "undefined";
export const IS_NODE = typeof process !== "undefined" && process.versions?.node;

/**
 * Feature detection
 */
export const HAS_CRYPTO = typeof crypto !== "undefined";
export const HAS_INDEXEDDB = IS_BROWSER && typeof indexedDB !== "undefined";
export const HAS_WEB_CRYPTO =
  HAS_CRYPTO && typeof crypto.subtle !== "undefined";

/**
 * Sui Clock Object ID
 * The canonical Clock object shared object on all Sui networks (mainnet, testnet, devnet)
 * Can be overridden via NEXT_PUBLIC_SUI_CLOCK_ID environment variable for custom networks
 */
export const CLOCK_OBJECT_ID =
  typeof window !== "undefined" &&
  typeof (process.env as any).NEXT_PUBLIC_SUI_CLOCK_ID === "string"
    ? (process.env as any).NEXT_PUBLIC_SUI_CLOCK_ID
    : "0x6";
