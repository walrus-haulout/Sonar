import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  WalrusUploadResult,
  DatasetMetadata,
  VerificationResult,
} from '@/lib/types/upload';

const POLL_INTERVAL = 4000; // 4 seconds
const MAX_POLL_DURATION = 300000; // 5 minutes

/**
 * Hook for AI verification workflow
 * Triggers verification and polls for status updates
 */

interface UseAIVerificationOptions {
  onComplete?: (result: VerificationResult) => void;
  onError?: (error: Error) => void;
}

export function useAIVerification(options?: UseAIVerificationOptions) {
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [pollStartTime, setPollStartTime] = useState<number | null>(null);

  /**
   * Start verification
   */
  const startVerification = useMutation({
    mutationFn: async ({
      walrusUpload,
      metadata,
      audioMetadata,
    }: {
      walrusUpload: WalrusUploadResult;
      metadata: DatasetMetadata;
      audioMetadata?: {
        duration: number;
        fileSize: number;
        format: string;
      };
    }): Promise<{ verificationId: string; estimatedTime: number }> => {
      const response = await fetch('/api/edge/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walrusBlobId: walrusUpload.blobId,
          metadata,
          audioMetadata,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start verification');
      }

      const result = await response.json();
      return result;
    },
    onSuccess: (data) => {
      setVerificationId(data.verificationId);
      setPollStartTime(Date.now());
    },
    onError: (error: Error) => {
      options?.onError?.(error);
    },
  });

  /**
   * Poll verification status
   */
  const {
    data: verificationResult,
    isLoading: isPolling,
    error: pollError,
  } = useQuery({
    queryKey: ['verification', verificationId],
    queryFn: async (): Promise<VerificationResult> => {
      if (!verificationId) {
        throw new Error('No verification ID');
      }

      const response = await fetch(`/api/edge/verify/${verificationId}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch verification status');
      }

      return response.json();
    },
    enabled: !!verificationId,
    refetchInterval: (query) => {
      // Stop polling if completed/failed
      if (
        query.state.data?.state === 'completed' ||
        query.state.data?.state === 'failed'
      ) {
        return false;
      }

      // Stop polling after max duration
      if (pollStartTime && Date.now() - pollStartTime > MAX_POLL_DURATION) {
        return false;
      }

      return POLL_INTERVAL;
    },
    refetchOnWindowFocus: false,
  });

  /**
   * Check if verification is complete
   */
  useEffect(() => {
    if (
      verificationResult &&
      verificationResult.state === 'completed' &&
      options?.onComplete
    ) {
      options.onComplete(verificationResult);
    }
  }, [verificationResult, options]);

  /**
   * Check for timeout
   */
  useEffect(() => {
    if (pollStartTime && verificationId) {
      const timer = setTimeout(() => {
        if (
          verificationResult?.state !== 'completed' &&
          verificationResult?.state !== 'failed'
        ) {
          options?.onError?.(new Error('Verification timeout'));
        }
      }, MAX_POLL_DURATION);

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [pollStartTime, verificationId, verificationResult, options]);

  /**
   * Cancel verification (stop polling)
   */
  const cancel = useCallback(() => {
    setVerificationId(null);
    setPollStartTime(null);
  }, []);

  /**
   * Retry verification
   */
  const retry = useCallback(
    (params: {
      walrusUpload: WalrusUploadResult;
      metadata: DatasetMetadata;
      audioMetadata?: {
        duration: number;
        fileSize: number;
        format: string;
      };
    }) => {
      setVerificationId(null);
      setPollStartTime(null);
      startVerification.mutate(params);
    },
    [startVerification]
  );

  /**
   * Get current stage info
   */
  const getCurrentStage = useCallback(() => {
    if (!verificationResult) return null;

    return verificationResult.stages.find(
      (stage) => stage.name === verificationResult.currentStage
    );
  }, [verificationResult]);

  return {
    startVerification: startVerification.mutate,
    startVerificationAsync: startVerification.mutateAsync,
    verificationId,
    verificationResult,
    isStarting: startVerification.isPending,
    isPolling,
    isVerifying: !!verificationId && verificationResult?.state === 'processing',
    isCompleted: verificationResult?.state === 'completed',
    isFailed: verificationResult?.state === 'failed',
    currentStage: getCurrentStage(),
    error: startVerification.error || pollError,
    cancel,
    retry,
    reset: () => {
      setVerificationId(null);
      setPollStartTime(null);
      startVerification.reset();
    },
  };
}
