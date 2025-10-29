/**
 * Authentication types shared between frontend and backend
 */

/**
 * Challenge response from /auth/challenge endpoint
 */
export interface AuthChallenge {
  nonce: string;
  message: string;
  expiresAt: number;
}

/**
 * Request body for /auth/verify endpoint
 */
export interface AuthVerifyRequest {
  address: string;
  signature: string;
  nonce: string;
}

/**
 * Token response from /auth/verify endpoint
 */
export interface AuthToken {
  token: string;
  expiresAt: number;
}

/**
 * JWT payload structure
 */
export interface JWTPayload {
  address: string;
  type: 'wallet-auth';
  iat: number;
  exp: number;
}

/**
 * User context attached to requests
 */
export interface UserContext {
  address: string;
}
