/**
 * Backend JWT Authentication Hook
 * Handles challenge-response authentication with backend API
 */

import { useSignPersonalMessage, useCurrentAccount } from "@mysten/dapp-kit";
import { useState, useCallback, useEffect } from "react";
import type { AuthChallenge, AuthToken } from "@sonar/shared";
import { toastError, toastSuccess } from "@/lib/toast";

interface StoredAuth {
  token: string;
  expiresAt: number;
  address: string;
}

const AUTH_STORAGE_KEY = "sonar_auth_token";
const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000; // Refresh 5 min before expiry

export function useBackendAuth() {
  const account = useCurrentAccount();
  const { mutateAsync: signMessage } = useSignPersonalMessage();
  const [auth, setAuth] = useState<StoredAuth | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Load stored auth on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        const parsed: StoredAuth = JSON.parse(stored);
        // Only restore if not expired and matches current wallet
        if (
          parsed.expiresAt > Date.now() &&
          parsed.address === account?.address
        ) {
          setAuth(parsed);
        } else {
          localStorage.removeItem(AUTH_STORAGE_KEY);
        }
      }
    } catch (error) {
      console.error("[useBackendAuth] Failed to load stored auth:", error);
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, [account?.address]);

  // Clear auth when wallet disconnects
  useEffect(() => {
    if (!account?.address && auth) {
      setAuth(null);
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, [account?.address, auth]);

  /**
   * Check if current token is valid and not expiring soon
   */
  const isTokenValid = useCallback(() => {
    if (!auth || !account?.address) return false;
    if (auth.address !== account.address) return false;
    return auth.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER;
  }, [auth, account?.address]);

  /**
   * Get Authorization header value
   */
  const getAuthHeader = useCallback((): string | null => {
    if (!isTokenValid()) return null;
    return `Bearer ${auth!.token}`;
  }, [auth, isTokenValid]);

  /**
   * Authenticate with backend and get JWT token
   */
  const authenticate = useCallback(async (): Promise<string> => {
    if (!account?.address) {
      throw new Error("Wallet not connected");
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) {
      throw new Error("Backend URL not configured");
    }

    // Return existing token if valid
    if (isTokenValid()) {
      return auth!.token;
    }

    setIsAuthenticating(true);

    try {
      console.log("[useBackendAuth] Requesting auth challenge...");

      // Step 1: Request challenge
      const challengeRes = await fetch(`${backendUrl}/auth/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: account.address }),
      });

      if (!challengeRes.ok) {
        const error = await challengeRes.json();
        throw new Error(error.message || "Failed to get auth challenge");
      }

      const challenge: AuthChallenge = await challengeRes.json();
      console.log("[useBackendAuth] Challenge received, signing message...");

      // Step 2: Sign message with wallet
      const messageBytes = new TextEncoder().encode(challenge.message);
      const signResult = await signMessage({ message: messageBytes });

      // Convert signature to string (base64)
      const signature = signResult.signature;

      console.log("[useBackendAuth] Message signed, verifying with backend...");

      // Step 3: Verify signature and get token
      const verifyRes = await fetch(`${backendUrl}/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: account.address,
          signature,
          nonce: challenge.nonce,
          message: challenge.message,
        }),
      });

      if (!verifyRes.ok) {
        const error = await verifyRes.json();
        throw new Error(error.message || "Signature verification failed");
      }

      const tokenData: AuthToken = await verifyRes.json();
      console.log("[useBackendAuth] Authenticated successfully");

      // Store auth
      const storedAuth: StoredAuth = {
        token: tokenData.token,
        expiresAt: tokenData.expiresAt,
        address: account.address,
      };

      setAuth(storedAuth);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(storedAuth));

      toastSuccess("Authenticated", "Ready to submit metadata");

      return tokenData.token;
    } catch (error: any) {
      console.error("[useBackendAuth] Authentication failed:", error);
      toastError(
        "Authentication failed",
        error.message || "Could not authenticate with backend",
      );
      throw error;
    } finally {
      setIsAuthenticating(false);
    }
  }, [account, signMessage, auth, isTokenValid]);

  /**
   * Clear authentication
   */
  const clearAuth = useCallback(() => {
    setAuth(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }, []);

  return {
    auth,
    isAuthenticated: isTokenValid(),
    isAuthenticating,
    getAuthHeader,
    authenticate,
    clearAuth,
  };
}
