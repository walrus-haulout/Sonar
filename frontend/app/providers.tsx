'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RepositoryProvider } from '@/providers/repository-provider';
import { useState } from 'react';

/**
 * Providers Component
 * Wraps the app with all necessary context providers
 * - React Query for data fetching and caching
 * - Repository for data source abstraction
 */
export function Providers({ children }: { children: React.ReactNode }) {
  // Create QueryClient in state to ensure it's stable across re-renders
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000, // 10 seconds for real-time data
            cacheTime: 300_000, // 5 minutes for cached data
            refetchOnWindowFocus: false,
            retry: 2,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RepositoryProvider>
        {children}
      </RepositoryProvider>
    </QueryClientProvider>
  );
}
