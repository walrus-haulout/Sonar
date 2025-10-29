/**
 * useAuth hook
 * Manages wallet-based authentication with the backend
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSignMessage } from '@mysten/dapp-kit';
import type { AuthVerifyRequest } from '@sonar/shared';
import {
  requestAuthChallenge,
  verifyAuthSignature,
  createAuthHeader,
} from '@/lib/api/client';
import { toastError, toastSuccess, toastPromise } from '@/lib/toast';

const TOKEN_STORAGE_KEY = 'sonar_auth_token';
const TOKEN_EXPIRY_STORAGE_KEY = 'sonar_auth_expiry';

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  isLoading: boolean;
  error: Error | null;
}

export function useAuth(autoLoad = true) {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    token: null,
    isLoading: false,
    error: null,
  });

  const { mutate: signMessage } = useSignMessage();

  /**
   * Load stored token from localStorage on mount
   */
  useEffect(() => {
    if (!autoLoad) return;

    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    const storedExpiry = localStorage.getItem(TOKEN_EXPIRY_STORAGE_KEY);

    if (storedToken && storedExpiry) {
      const expiryTime = parseInt(storedExpiry, 10);
      if (Date.now() < expiryTime) {
        setAuthState({
          isAuthenticated: true,
          token: storedToken,
          isLoading: false,
          error: null,
        });
      } else {
        // Token expired, clear it
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(TOKEN_EXPIRY_STORAGE_KEY);
      }
    }
  }, [autoLoad]);

  /**
   * Request challenge and return challenge details + signature callback
   */
  const requestChallenge = useCallback(
    async (address: string) => {
      try {
        setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));
        const challenge = await requestAuthChallenge(address);
        setAuthState((prev) => ({ ...prev, isLoading: false }));
        return challenge;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        setAuthState((prev) => ({
          ...prev,
          isLoading: false,
          error: err,
        }));
        toastError('Challenge Request Failed', err.message);
        throw err;
      }
    },
    []
  );

  /**
   * Complete authentication with signed message
   */
  const authenticate = useCallback(
    async (
      address: string,
      message: string,
      signatureCallback: (msg: string) => Promise<string>
    ): Promise<string> => {
      try {
        setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));

        // Step 1: Request challenge
        const challenge = await requestChallenge(address);

        // Step 2: Sign message with wallet
        const signature = await signatureCallback(challenge.message);

        // Step 3: Verify signature and get JWT
        const verifyRequest: AuthVerifyRequest = {
          address,
          signature,
          nonce: challenge.nonce,
          message: challenge.message,
        };

        const tokenResponse = await toastPromise(
          verifyAuthSignature(verifyRequest),
          {
            loading: 'Verifying wallet signature...',
            success: 'Authentication successful!',
            error: 'Authentication failed',
          }
        );

        // Step 4: Store token
        localStorage.setItem(TOKEN_STORAGE_KEY, tokenResponse.token);
        localStorage.setItem(TOKEN_EXPIRY_STORAGE_KEY, tokenResponse.expiresAt.toString());

        setAuthState({
          isAuthenticated: true,
          token: tokenResponse.token,
          isLoading: false,
          error: null,
        });

        return tokenResponse.token;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        setAuthState((prev) => ({
          ...prev,
          isLoading: false,
          error: err,
        }));
        throw err;
      }
    },
    [requestChallenge]
  );

  /**
   * Logout - clear token from storage and state
   */
  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_STORAGE_KEY);
    setAuthState({
      isAuthenticated: false,
      token: null,
      isLoading: false,
      error: null,
    });
    toastSuccess('Logged out successfully');
  }, []);

  /**
   * Get authorization header for API requests
   */
  const getAuthHeader = useCallback(() => {
    if (!authState.token) return null;
    return createAuthHeader(authState.token);
  }, [authState.token]);

  /**
   * Check if token is valid (not expired)
   */
  const isTokenValid = useCallback(() => {
    if (!authState.token) return false;
    const expiry = localStorage.getItem(TOKEN_EXPIRY_STORAGE_KEY);
    if (!expiry) return false;
    return Date.now() < parseInt(expiry, 10);
  }, [authState.token]);

  return {
    ...authState,
    authenticate,
    logout,
    getAuthHeader,
    isTokenValid,
    requestChallenge,
  };
}
