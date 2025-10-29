/**
 * JWT token generation and verification
 */

import jwt from 'jsonwebtoken';
import type { JWTPayload } from '@sonar/shared';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required. Run: bun scripts/setup.ts');
}

/**
 * Generate a JWT token for a wallet address
 */
export function generateToken(address: string): { token: string; expiresAt: number } {
  const now = Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    address,
    type: 'wallet-auth',
    iat: now,
    exp: calculateExpiry(now),
  };

  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  return {
    token,
    expiresAt: payload.exp * 1000, // Convert to milliseconds
  };
}

/**
 * Verify and decode a JWT token
 * Returns the payload if valid, null otherwise
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Type guard
    if (
      typeof decoded === 'object' &&
      decoded !== null &&
      'address' in decoded &&
      'type' in decoded &&
      decoded.type === 'wallet-auth'
    ) {
      return decoded as JWTPayload;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Calculate token expiry time (seconds since epoch)
 */
function calculateExpiry(iat: number): number {
  // Parse JWT_EXPIRES_IN format (e.g., "24h", "7d", "3600s")
  const ttlMs = parseExpiresIn(JWT_EXPIRES_IN);
  return iat + Math.floor(ttlMs / 1000);
}

/**
 * Parse expires in format to milliseconds
 */
function parseExpiresIn(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);

  if (!match) {
    throw new Error(`Invalid JWT_EXPIRES_IN format: ${expiresIn}`);
  }

  const [, amount, unit] = match;
  const value = parseInt(amount, 10);

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Unknown time unit: ${unit}`);
  }
}
