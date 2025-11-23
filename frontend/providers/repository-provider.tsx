'use client';

import { createContext, useContext, useMemo } from 'react';
import type { DataRepository } from '@/lib/data/repository';
import { SuiRepository } from '@/lib/data/sui-repository';

const RepositoryContext = createContext<DataRepository | null>(null);

/**
 * Repository Provider
 * Provides data repository to the entire app
 * Uses blockchain (Sui) for all data
 */
export function RepositoryProvider({ children }: { children: React.ReactNode }) {
  const repository = useMemo(() => {
    return new SuiRepository();
  }, []);

  return (
    <RepositoryContext.Provider value={repository}>
      {children}
    </RepositoryContext.Provider>
  );
}

/**
 * Hook to access the repository
 * Must be used within RepositoryProvider
 */
export function useRepository(): DataRepository {
  const repository = useContext(RepositoryContext);

  if (!repository) {
    throw new Error('useRepository must be used within RepositoryProvider');
  }

  return repository;
}
