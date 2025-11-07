'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import type { SessionKey, SealClient } from '@mysten/seal';
import type { SuiClient } from '@mysten/sui/client';
import {
  createSonarSealClient,
  createSession,
  restoreSession,
  getOrCreateSession,
  isSessionValid,
  encryptFile,
  decryptFile,
  type EncryptFileOptions,
  type DecryptFileOptions,
  type EncryptionResult,
  type DecryptionResult,
  type ProgressCallback,
} from '@sonar/seal';
import { suiClient, PACKAGE_ID, NETWORK } from '@/lib/sui/client';

const RAW_KEY_SERVERS = process.env.NEXT_PUBLIC_SEAL_KEY_SERVERS || '';

function parseKeyServers(value: string) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((objectId) => ({
      objectId,
      weight: 1,
    }));
}

/**
 * Custom hook for Mysten Seal encryption/decryption
 * Manages SealClient, session keys, and provides encryption/decryption methods
 */
export function useSeal() {
  const account = useCurrentAccount();
  const [sealClient, setSealClient] = useState<SealClient | null>(null);
  const [sessionKey, setSessionKey] = useState<SessionKey | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyServers = useMemo(() => parseKeyServers(RAW_KEY_SERVERS), []);
  const hasKeyServersConfigured = keyServers.length > 0;

  // Initialize SealClient once
  useEffect(() => {
    if (!hasKeyServersConfigured) {
      console.warn(
        'Seal client disabled: set NEXT_PUBLIC_SEAL_KEY_SERVERS with comma-separated key server object IDs to enable encryption.'
      );
      setError('Seal client disabled: missing key server configuration');
      return;
    }

    try {
      const client = createSonarSealClient({
        suiClient: suiClient as SuiClient,
        network: NETWORK as 'testnet' | 'mainnet',
        keyServers,
      });
      setSealClient(client);
      setIsInitialized(true);
      setError(null);
    } catch (err) {
      console.error('Failed to initialize Seal client:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize Seal');
    }
  }, [hasKeyServersConfigured, keyServers]);

  // Try to restore session from cache when account is available
  useEffect(() => {
    if (account?.address && sealClient && !sessionKey) {
      restoreSessionFromCache();
    }
  }, [account?.address, sealClient]);

  /**
   * Restore session from IndexedDB cache
   */
  const restoreSessionFromCache = useCallback(async () => {
    if (!sealClient || !hasKeyServersConfigured) return;

    try {
      const cached = await restoreSession(PACKAGE_ID, suiClient as SuiClient);
      if (cached && isSessionValid(cached)) {
        console.log('Restored Seal session from cache');
        setSessionKey(cached);
        setError(null);
      }
    } catch (err) {
      console.warn('Failed to restore session from cache:', err);
      // Not an error - just means no cached session
    }
  }, [sealClient]);

  /**
   * Create new session with wallet signature
   * Requires user interaction to sign message
   *
   * @param options.ttlMin - Session time-to-live in minutes (default: 10)
   * @param options.signMessage - Wallet signing function (must be provided from component level)
   *
   * @example
   * ```tsx
   * import { useSignPersonalMessage } from '@mysten/dapp-kit';
   *
   * function MyComponent() {
   *   const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
   *   const { createSession } = useSeal();
   *
   *   const handleCreateSession = async () => {
   *     await createSession({
   *       signMessage: async (message) => {
   *         const result = await signPersonalMessage({ message });
   *         return { signature: result.signature };
   *       }
   *     });
   *   };
   * }
   * ```
   */
  const createNewSession = useCallback(
    async (options: {
      ttlMin?: number;
      signMessage: (message: Uint8Array) => Promise<{ signature: string }>;
    }) => {
      if (!account?.address) {
        throw new Error('Wallet not connected');
      }

      if (!sealClient) {
        throw new Error('Seal client not initialized');
      }

      setIsInitializing(true);
      setError(null);

      try {
        const session = await createSession(account.address, PACKAGE_ID, {
          ttlMin: options.ttlMin || 10,
          suiClient: suiClient as SuiClient,
          mvrName: 'SONAR',
          signMessage: async (message: Uint8Array) => {
            // Call the provided signing function with message bytes
            const result = await options.signMessage(message);
            return { signature: result.signature };
          },
        });

        setSessionKey(session);
        setError(null);
        return session;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to create session';
        setError(errorMessage);
        throw err;
      } finally {
        setIsInitializing(false);
      }
    },
    [account?.address, sealClient]
  );

  /**
   * Encrypt file or data
   */
  const encrypt = useCallback(
    async (
      data: File | Uint8Array,
      options: Partial<EncryptFileOptions> = {},
      onProgress?: ProgressCallback
    ): Promise<EncryptionResult> => {
      if (!sealClient) {
        throw new Error('Seal client not initialized');
      }

      setError(null);

      try {
        const result = await encryptFile(
          sealClient,
          data,
          {
            packageId: PACKAGE_ID,
            accessPolicy: 'purchase',
            ...options,
          },
          onProgress
        );

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Encryption failed';
        setError(errorMessage);
        throw err;
      }
    },
    [sealClient, hasKeyServersConfigured]
  );

  /**
   * Decrypt file or data
   * Requires valid session key
   */
  const decrypt = useCallback(
    async (
      encryptedData: Uint8Array,
      identity: string,
      options: Partial<DecryptFileOptions> = {},
      onProgress?: ProgressCallback
    ): Promise<DecryptionResult> => {
      if (!sealClient) {
        throw new Error('Seal client not initialized');
      }

      if (!sessionKey) {
        throw new Error('No active session. Please create a session first.');
      }

      setError(null);

      try {
        const result = await decryptFile(
          sealClient,
          encryptedData,
          {
            sessionKey,
            packageId: PACKAGE_ID,
            identity,
            policyModule: 'purchase_policy', // Default policy
            suiClient: suiClient as SuiClient,
            ...options,
          },
          onProgress
        );

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Decryption failed';
        setError(errorMessage);
        throw err;
      }
    },
    [sealClient, sessionKey]
  );

  return {
    // State
    isInitialized,
    isInitializing,
    hasSession: !!sessionKey,
    isReady: isInitialized && !!sealClient,
    error,

    // Methods
    createSession: createNewSession,
    restoreSession: restoreSessionFromCache,
    encrypt,
    decrypt,

    // Raw objects (for advanced usage)
    sealClient,
    sessionKey,
  };
}

/**
 * Simplified version that doesn't require session for encryption-only use cases
 */
export function useSealEncryption() {
  const { isReady, encrypt, error } = useSeal();

  return {
    isReady,
    encrypt,
    error,
  };
}
