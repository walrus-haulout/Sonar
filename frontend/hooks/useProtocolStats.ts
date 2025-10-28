import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/providers/repository-provider';
import type { ProtocolStats } from '@/types/blockchain';

/**
 * Hook for fetching real-time protocol statistics
 *
 * Features:
 * - 10-second polling for real-time updates
 * - Automatic refetch on window focus
 * - 5-minute stale time for caching
 * - Retry logic for failed requests
 *
 * Usage:
 * ```tsx
 * const { data: stats, isLoading, error } = useProtocolStats();
 * ```
 */
export function useProtocolStats() {
  const repository = useRepository();

  return useQuery<ProtocolStats, Error>({
    queryKey: ['protocol-stats'],
    queryFn: () => repository.getStats(),
    staleTime: 10_000, // 10 seconds - frequent updates for real-time feel
    refetchInterval: 10_000, // Poll every 10 seconds
    refetchOnWindowFocus: true,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Hook variant with custom refetch interval
 *
 * Usage:
 * ```tsx
 * // Update every 5 seconds instead of 10
 * const { data: stats } = useProtocolStats({ refetchInterval: 5_000 });
 * ```
 */
export function useProtocolStatsWithInterval(refetchInterval: number = 10_000) {
  const repository = useRepository();

  return useQuery<ProtocolStats, Error>({
    queryKey: ['protocol-stats', refetchInterval],
    queryFn: () => repository.getStats(),
    staleTime: refetchInterval,
    refetchInterval,
    refetchOnWindowFocus: true,
    retry: 3,
  });
}
