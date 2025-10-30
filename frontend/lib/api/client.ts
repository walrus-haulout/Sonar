/**
 * Backend API client
 * Handles communication with the SONAR backend service
 */

import type {
  AuthChallenge,
  AuthVerifyRequest,
  AuthToken,
  AccessGrant,
  ErrorResponse,
} from '@sonar/shared';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

/**
 * Request a signing challenge from the backend
 */
export async function requestAuthChallenge(address: string): Promise<AuthChallenge> {
  try {
    const response = await fetch(`${BACKEND_URL}/auth/challenge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address }),
    });

    if (!response.ok) {
      const error = (await response.json()) as ErrorResponse;
      throw new Error(error.message || 'Failed to request challenge');
    }

    return response.json() as Promise<AuthChallenge>;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        error.message.includes('Failed to fetch')
          ? `Backend server is not available at ${BACKEND_URL}. Make sure the backend is running.`
          : error.message
      );
    }
    throw error;
  }
}

/**
 * Verify a signed message and get JWT token
 */
export async function verifyAuthSignature(
  verifyRequest: AuthVerifyRequest
): Promise<AuthToken> {
  try {
    const response = await fetch(`${BACKEND_URL}/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(verifyRequest),
    });

    if (!response.ok) {
      const error = (await response.json()) as ErrorResponse;
      throw new Error(error.message || 'Failed to verify signature');
    }

    return response.json() as Promise<AuthToken>;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        error.message.includes('Failed to fetch')
          ? `Backend server is not available at ${BACKEND_URL}. Make sure the backend is running.`
          : error.message
      );
    }
    throw error;
  }
}

/**
 * Request access grant for a dataset (requires JWT)
 */
export async function requestAccessGrant(
  datasetId: string,
  token: string
): Promise<AccessGrant> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/datasets/${datasetId}/access`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = (await response.json()) as ErrorResponse;
      throw new Error(error.message || 'Failed to request access');
    }

    return response.json() as Promise<AccessGrant>;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        error.message.includes('Failed to fetch')
          ? `Backend server is not available at ${BACKEND_URL}. Make sure the backend is running.`
          : error.message
      );
    }
    throw error;
  }
}

/**
 * Get preview audio URL (public, no auth required)
 */
export function getPreviewUrl(datasetId: string): string {
  return `${BACKEND_URL}/api/datasets/${datasetId}/preview`;
}

/**
 * Get stream audio URL with JWT token
 */
export function getStreamUrl(datasetId: string, token: string): string {
  // In a real implementation, the token would be sent via Authorization header
  // For now, return the endpoint - the client will handle auth headers
  return `${BACKEND_URL}/api/datasets/${datasetId}/stream`;
}

/**
 * Create Authorization header value
 */
export function createAuthHeader(token: string): string {
  return `Bearer ${token}`;
}

/**
 * Get backend health status
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
