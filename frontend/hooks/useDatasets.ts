import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/providers/repository-provider';
import type { Dataset, DatasetFilter } from '@/types/blockchain';

/**
 * Hook for fetching filtered datasets from the marketplace
 *
 * Features:
 * - Client-side filtering by language, format, quality, price
 * - Automatic caching with 30-second stale time
 * - Refetch on window focus
 * - Loading and error states
 *
 * Usage:
 * ```tsx
 * const { data: datasets, isLoading } = useDatasets({
 *   languages: ['en', 'es'],
 *   minQuality: 7,
 *   maxPrice: 1000n
 * });
 * ```
 */
export function useDatasets(filter?: DatasetFilter) {
  const repository = useRepository();

  return useQuery<Dataset[], Error>({
    queryKey: ['datasets', filter],
    queryFn: () => repository.getDatasets(filter),
    staleTime: 30_000, // 30 seconds
    refetchOnWindowFocus: true,
    retry: 2,
  });
}

/**
 * Hook for fetching paginated datasets (for infinite scroll)
 *
 * Usage:
 * ```tsx
 * const { data, fetchNextPage, hasNextPage } = useDatasetsPaginated({
 *   languages: ['en']
 * });
 * ```
 */
export function useDatasetsPaginated(filter?: DatasetFilter, cursor?: string) {
  const repository = useRepository();

  return useQuery({
    queryKey: ['datasets-paginated', filter, cursor],
    queryFn: () => repository.getDatasetsPaginated(filter, cursor),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook for searching datasets by title or description
 * Combines with filter for powerful search
 *
 * Usage:
 * ```tsx
 * const { data } = useDatasetSearch('conversational', {
 *   languages: ['en']
 * });
 * ```
 */
export function useDatasetSearch(query: string, filter?: DatasetFilter) {
  const repository = useRepository();

  return useQuery<Dataset[], Error>({
    queryKey: ['datasets-search', query, filter],
    queryFn: async () => {
      const datasets = await repository.getDatasets(filter);

      if (!query) return datasets;

      // Client-side search through title and description
      const lowerQuery = query.toLowerCase();
      return datasets.filter(
        (dataset) =>
          dataset.title.toLowerCase().includes(lowerQuery) ||
          dataset.description.toLowerCase().includes(lowerQuery)
      );
    },
    staleTime: 30_000,
    enabled: query.length > 0, // Only run query if search term exists
  });
}

/**
 * Hook for fetching a single dataset by ID
 *
 * Usage:
 * ```tsx
 * const { data: dataset, isLoading } = useDataset('dataset-id-123');
 * ```
 */
export function useDataset(datasetId: string) {
  const repository = useRepository();

  return useQuery<Dataset, Error>({
    queryKey: ['dataset', datasetId],
    queryFn: () => repository.getDataset(datasetId),
    staleTime: 5 * 60_000, // 5 minutes (individual datasets change less frequently)
    refetchOnWindowFocus: false, // Don't refetch on focus for detail pages
    retry: 2,
  });
}

/**
 * Hook for fetching featured/top datasets
 * Returns datasets sorted by quality score
 *
 * Usage:
 * ```tsx
 * const { data: featured } = useFeaturedDatasets(5);
 * ```
 */
export function useFeaturedDatasets(limit: number = 10) {
  const repository = useRepository();

  return useQuery<Dataset[], Error>({
    queryKey: ['datasets-featured', limit],
    queryFn: async () => {
      const datasets = await repository.getDatasets({});

      // Sort by quality score (descending) and take top N
      return datasets
        .sort((a, b) => b.quality_score - a.quality_score)
        .slice(0, limit);
    },
    staleTime: 60_000, // 1 minute (featured datasets change less frequently)
  });
}
