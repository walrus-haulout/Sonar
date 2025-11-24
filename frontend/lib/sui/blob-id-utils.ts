/**
 * Blob ID Conversion Utilities
 * Convert between base64url (Walrus blob IDs) and u256 (on-chain format)
 */

/**
 * Convert base64url string to hex string
 */
export function base64UrlToHex(base64Url: string): string {
  // Convert base64url to standard base64
  let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");

  // Add padding if needed
  const padding = base64.length % 4;
  if (padding) {
    base64 += "=".repeat(4 - padding);
  }

  // Decode base64 to binary
  const binary = atob(base64);

  // Convert binary to hex
  let hex = "";
  for (let i = 0; i < binary.length; i++) {
    const byte = binary.charCodeAt(i).toString(16).padStart(2, "0");
    hex += byte;
  }

  return hex;
}

/**
 * Convert base64url blob ID to u256 (0x-prefixed hex)
 */
export function blobIdToU256(blobId: string): string {
  const hex = base64UrlToHex(blobId);
  return `0x${hex}`;
}

/**
 * Convert base64url blob ID to BigInt
 */
export function blobIdToBigInt(blobId: string): bigint {
  const hex = base64UrlToHex(blobId);
  return BigInt(`0x${hex}`);
}

/**
 * Convert hex string to base64url (reverse of base64UrlToHex)
 */
export function hexToBase64Url(hex: string): string {
  // Remove 0x prefix if present
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;

  // Convert hex to binary
  let binary = "";
  for (let i = 0; i < cleanHex.length; i += 2) {
    const byte = parseInt(cleanHex.substring(i, i + 2), 16);
    binary += String.fromCharCode(byte);
  }

  // Encode to base64
  let base64 = btoa(binary);

  // Convert to base64url and remove padding
  const base64Url = base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return base64Url;
}

/**
 * Validate that a string is a valid base64url blob ID
 */
export function isValidBlobId(blobId: string): boolean {
  if (!blobId || typeof blobId !== "string") {
    return false;
  }

  // Base64url alphabet: A-Z, a-z, 0-9, -, _
  const base64UrlRegex = /^[A-Za-z0-9_-]+$/;
  if (!base64UrlRegex.test(blobId)) {
    return false;
  }

  // Typical blob IDs are 32-44 characters (for 256-bit hashes)
  if (blobId.length < 16 || blobId.length > 64) {
    return false;
  }

  return true;
}

/**
 * Convert a u256 hex string to base64url blob ID
 */
export function u256ToBlobId(u256: string): string {
  return hexToBase64Url(u256);
}
