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
import { suiClient, CHAIN_CONFIG, NETWORK } from '@/lib/sui/client';

const RAW_KEY_SERVERS = process.env.NEXT_PUBLIC_SEAL_KEY_SERVERS || '';

function parseKeyServers(value: string) {
  const servers = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((objectId) => ({
      objectId,
      weight: 1,
    }));

  return servers;
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
      // Set threshold based on number of key servers
      // Threshold must be between 1 and keyServers.length
      const threshold = Math.min(2, keyServers.length);

      const client = createSonarSealClient({
        suiClient: suiClient as SuiClient,
        network: NETWORK as 'testnet' | 'mainnet',
        keyServers,
        threshold, // Explicitly set threshold based on available servers
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

    const packageId = CHAIN_CONFIG.packageId;
    if (!packageId) {
      console.warn('Cannot restore Seal session: CHAIN_CONFIG.packageId is missing');
      return;
    }

    try {
      const cached = await restoreSession(packageId, suiClient as SuiClient);
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
      const packageId = CHAIN_CONFIG.packageId;
      if (!packageId) {
        throw new Error('Blockchain contracts not configured (missing packageId)');
      }

      if (!account?.address) {
        throw new Error('Wallet not connected');
      }

      if (!sealClient) {
        throw new Error('Seal client not initialized');
      }

      setIsInitializing(true);
      setError(null);

      try {
        const session = await createSession(account.address, packageId, {
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
        const resolvedPackageId = CHAIN_CONFIG.packageId ?? undefined;

        const result = await encryptFile(
          sealClient,
          data,
          {
            accessPolicy: 'purchase',
            packageId: resolvedPackageId,
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

    const packageId = CHAIN_CONFIG.packageId;
    if (!packageId) {
      throw new Error('Blockchain contracts not configured (missing packageId)');
    }

      setError(null);

      try {
        const result = await decryptFile(
          sealClient,
          encryptedData,
          {
            sessionKey,
            packageId,
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

export interface DecryptionProgress {
  stage: 'fetching' | 'decrypting' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  error?: string;
}

export interface DecryptAudioOptions {
  blobId: string;
  sealPolicyId: string;
  policyModule?: string;
  onProgress?: (progress: DecryptionProgress) => void;
}

/**
 * Hook for browser-based audio decryption with progress tracking
 * Handles the full flow: fetch encrypted blob, request Seal capsules, decrypt
 */
export function useSealDecryption() {
  const { decrypt, sealClient, sessionKey, createSession, isReady, error: sealError } = useSeal();
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [progress, setProgress] = useState<DecryptionProgress | null>(null);

  /**
   * Fetch encrypted blob from Walrus
   */
  const fetchEncryptedBlob = useCallback(async (blobId: string): Promise<Uint8Array> => {
    const walrusAggregator = process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL || 'https://aggregator.walrus-testnet.walrus.space';
    const response = await fetch(`${walrusAggregator}/v1/${blobId}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch blob from Walrus: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }, []);

  /**
   * Decrypt audio blob for playback
   * Returns decrypted audio data as Uint8Array
   */
  const decryptAudio = useCallback(async (options: DecryptAudioOptions): Promise<Uint8Array> => {
    const { blobId, sealPolicyId, policyModule = 'purchase_policy', onProgress } = options;

    if (!sessionKey) {
      throw new Error('No active session. Please create a session first.');
    }

    if (!sealClient) {
      throw new Error('Seal client not initialized');
    }

    setIsDecrypting(true);

    try {
      // Stage 1: Fetch encrypted blob from Walrus
      const updateProgress = (update: Partial<DecryptionProgress>) => {
        setProgress((prev) => {
          const next = { ...(prev ?? {}), ...update } as DecryptionProgress;
          onProgress?.(next);
          return next;
        });
      };

      updateProgress({
        stage: 'fetching',
        progress: 0,
        message: 'Fetching encrypted audio from Walrus...',
      });

      const encryptedData = await fetchEncryptedBlob(blobId);

      updateProgress({
        stage: 'fetching',
        progress: 30,
        message: `Fetched ${(encryptedData.length / 1024 / 1024).toFixed(2)} MB encrypted data`,
      });

      // Stage 2: Decrypt using Seal
      updateProgress({
        stage: 'decrypting',
        progress: 40,
        message: 'Requesting key shares from Seal servers...',
      });

      const result = await decrypt(
        encryptedData,
        sealPolicyId,
        { policyModule },
        (decryptProgress) => {
          // Map Seal progress (0-1) to our progress (40-90)
          const progressPercent = 40 + Math.floor(decryptProgress * 50);
          updateProgress({
            stage: 'decrypting',
            progress: progressPercent,
            message: `Decrypting audio... ${Math.floor(decryptProgress * 100)}%`,
          });
        }
      );

      updateProgress({
        stage: 'complete',
        progress: 100,
        message: 'Audio decrypted successfully',
      });

      return result.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Decryption failed';

      const errorProgress: DecryptionProgress = {
        stage: 'error',
        progress: 0,
        message: 'Decryption failed',
        error: errorMessage,
      };

      setProgress(errorProgress);
      onProgress?.(errorProgress);

      throw err;
    } finally {
      setIsDecrypting(false);
    }
  }, [sessionKey, sealClient, decrypt, fetchEncryptedBlob, progress]);

  /**
   * Reset progress state
   */
  const resetProgress = useCallback(() => {
    setProgress(null);
  }, []);

  const clientReady = isReady;
  const sessionAvailable = !!sessionKey;

  return {
    // State
    isReady: clientReady && sessionAvailable,
    isClientReady: clientReady,
    hasSession: sessionAvailable,
    isDecrypting,
    progress,
    error: sealError,

    // Methods
    decryptAudio,
    createSession,
    resetProgress,

    // Raw objects
    sessionKey,
  };
}
