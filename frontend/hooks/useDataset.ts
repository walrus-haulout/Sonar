import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/providers/repository-provider';
import type { Dataset } from '@/types/blockchain';

/**
 * Hook for fetching a single dataset by ID
 *
 * Features:
 * - Caches individual datasets for 5 minutes
 * - Automatic refetch on window focus
 * - Error handling for missing datasets
 *
 * Usage:
 * ```tsx
 * const { data: dataset, isLoading, error } = useDataset('0x123...');
 *
 * if (isLoading) return <LoadingSpinner />;
 * if (error) return <ErrorMessage error={error} />;
 * if (!dataset) return <NotFound />;
 *
 * return <DatasetDetail dataset={dataset} />;
 * ```
 */
export function useDataset(id: string | undefined) {
  const repository = useRepository();

  return useQuery<Dataset, Error>({
    queryKey: ['dataset', id],
    queryFn: () => {
      if (!id) {
        throw new Error('Dataset ID is required');
      }
      return repository.getDataset(id);
    },
    staleTime: 300_000, // 5 minutes - individual datasets change infrequently
    refetchOnWindowFocus: true,
    retry: 2,
    enabled: !!id, // Only run query if ID exists
  });
}

/**
 * Hook for prefetching a dataset (for hover/link optimization)
 *
 * Usage:
 * ```tsx
 * const prefetchDataset = usePrefetchDataset();
 *
 * <Link
 *   href={`/dataset/${id}`}
 *   onMouseEnter={() => prefetchDataset(id)}
 * >
 *   Dataset Card
 * </Link>
 * ```
 */
export function usePrefetchDataset() {
  const repository = useRepository();
  const queryClient = useQueryClient();

  return (id: string) => {
    queryClient.prefetchQuery({
      queryKey: ['dataset', id],
      queryFn: () => repository.getDataset(id),
      staleTime: 300_000,
    });
  };
}

// Re-export for convenience
import { useQueryClient } from '@tanstack/react-query';
