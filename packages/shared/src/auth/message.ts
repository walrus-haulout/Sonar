/**
 * Authentication message format
 * Ensures frontend and backend use identical message format
 */

/**
 * Create a standardized authentication message
 * Must match exactly on both frontend and backend for signature verification
 */
export function createAuthMessage(
  address: string,
  nonce: string,
  expiresAt: number
): string {
  const expiresDate = new Date(expiresAt).toISOString();

  return `Sign this message to authenticate with SONAR:

Address: ${address}
Nonce: ${nonce}
Expires: ${expiresDate}

This signature will be used to verify your wallet ownership.`;
}

/**
 * Parse and validate an authentication message
 * Returns the extracted data if valid, null otherwise
 */
export function parseAuthMessage(message: string): {
  address: string;
  nonce: string;
  expiresAt: number;
} | null {
  try {
    const addressMatch = message.match(/Address: (0x[a-fA-F0-9]+)/);
    const nonceMatch = message.match(/Nonce: ([0-9a-f-]+)/);
    const expiresMatch = message.match(/Expires: (.+)/);

    if (!addressMatch || !nonceMatch || !expiresMatch) {
      return null;
    }

    const address = addressMatch[1];
    const nonce = nonceMatch[1];
    const expiresAt = new Date(expiresMatch[1]).getTime();

    // Validate that the date parsed correctly
    if (isNaN(expiresAt)) {
      return null;
    }

    return { address, nonce, expiresAt };
  } catch {
    return null;
  }
}

/**
 * Verify that a message hasn't expired
 */
export function isMessageExpired(expiresAt: number): boolean {
  return Date.now() > expiresAt;
}
