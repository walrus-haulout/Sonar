/**
 * @sonar/seal - Utility Functions
 * Helper functions for data conversion and validation
 */

import type { HexString, Base64String } from "./types";

/**
 * Convert Uint8Array to hex string with 0x prefix (Sui-compatible format)
 */
export function bytesToHex(bytes: Uint8Array): HexString {
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * Convert hex string to Uint8Array
 */
export function hexToBytes(hex: HexString): Uint8Array {
  // Remove 0x prefix if present
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;

  if (cleanHex.length % 2 !== 0) {
    throw new Error("Invalid hex string: odd length");
  }

  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16);
  }

  return bytes;
}

/**
 * Convert Uint8Array to base64 string
 */
export function bytesToBase64(bytes: Uint8Array): Base64String {
  if (typeof Buffer !== "undefined") {
    // Node.js environment
    return Buffer.from(bytes).toString("base64");
  } else {
    // Browser environment
    const binary = String.fromCharCode(...bytes);
    return btoa(binary);
  }
}

/**
 * Convert base64 string to Uint8Array
 */
export function base64ToBytes(base64: Base64String): Uint8Array {
  if (typeof Buffer !== "undefined") {
    // Node.js environment
    return new Uint8Array(Buffer.from(base64, "base64"));
  } else {
    // Browser environment
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

/**
 * Validate hex string format
 */
export function isValidHex(hex: string): boolean {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  return /^[0-9a-fA-F]*$/.test(cleanHex) && cleanHex.length % 2 === 0;
}

/**
 * Validate Sui address format
 */
export function isValidSuiAddress(address: string): boolean {
  // Sui addresses are 0x followed by 64 hex characters
  return /^0x[0-9a-fA-F]{64}$/.test(address);
}

/**
 * Generate random identity bytes
 */
export function generateRandomIdentity(length: number = 16): Uint8Array {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint8Array(length));
  } else if (typeof require !== "undefined") {
    // Node.js fallback
    const crypto = require("crypto");
    return new Uint8Array(crypto.randomBytes(length));
  } else {
    throw new Error("No secure random generator available");
  }
}

/**
 * Calculate cache key for identity
 */
export function getCacheKey(packageId: string, identity: string): string {
  return `${packageId}:${identity}`;
}

/**
 * Check if running in browser environment
 */
export function isBrowser(): boolean {
  return (
    typeof window !== "undefined" && typeof window.document !== "undefined"
  );
}

/**
 * Check if IndexedDB is available
 */
export function hasIndexedDB(): boolean {
  return isBrowser() && typeof indexedDB !== "undefined";
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry async function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
  } = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
  } = options;

  let lastError: Error | undefined;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown error");

      if (attempt < maxAttempts) {
        await sleep(Math.min(delay, maxDelay));
        delay *= backoffFactor;
      }
    }
  }

  throw lastError;
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Estimate encryption overhead
 * Seal adds approximately 200-300 bytes of overhead
 */
export function estimateEncryptedSize(originalSize: number): number {
  const SEAL_OVERHEAD = 300; // bytes
  return originalSize + SEAL_OVERHEAD;
}

/**
 * Check if file should use envelope encryption
 * Files larger than 1MB benefit from envelope encryption
 */
export function shouldUseEnvelopeEncryption(fileSize: number): boolean {
  const ENVELOPE_THRESHOLD = 1024 * 1024; // 1MB
  return fileSize > ENVELOPE_THRESHOLD;
}

/**
 * Validate session TTL
 * Must be between 1 and 30 minutes
 */
export function validateSessionTTL(ttlMin: number): boolean {
  return ttlMin >= 1 && ttlMin <= 30 && Number.isInteger(ttlMin);
}

/**
 * Validate threshold value
 * Must be positive integer and <= number of key servers
 */
export function validateThreshold(
  threshold: number,
  numServers: number,
): boolean {
  return (
    Number.isInteger(threshold) && threshold > 0 && threshold <= numServers
  );
}

/**
 * Parse package ID from string (handles 0x prefix)
 */
export function parsePackageId(packageId: string): Uint8Array {
  if (!isValidHex(packageId)) {
    throw new Error(`Invalid package ID: ${packageId}`);
  }
  return hexToBytes(packageId);
}

/**
 * Create deterministic identity from string
 */
export function createIdentityFromString(input: string): Uint8Array {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);

  // Use Web Crypto API for hashing
  if (typeof crypto !== "undefined" && crypto.subtle) {
    // Note: This is async, but we'll make the function sync by using a different approach
    // For deterministic identity, we can use a simple hash
  }

  // Simple hash for deterministic identity (not cryptographically secure)
  const hash = new Uint8Array(16);
  for (let i = 0; i < data.length; i++) {
    hash[i % 16] ^= data[i];
  }

  return hash;
}

/**
 * Merge Uint8Arrays
 */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);

  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }

  return result;
}

/**
 * Compare two Uint8Arrays for equality
 */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }

  return true;
}
