'use client';

import { createContext, useContext, useMemo } from 'react';
import type { DataRepository } from '@/lib/data/repository';
import { HybridRepository } from '@/lib/data/hybrid-repository';

const RepositoryContext = createContext<DataRepository | null>(null);

/**
 * Repository Provider
 * Provides data repository to the entire app
 *
 * Uses HybridRepository:
 * - Blockchain for core data (audio, metadata, price) - source of truth
 * - Backend for enrichment (transcript, AI analysis, tags)
 */
export function RepositoryProvider({ children }: { children: React.ReactNode }) {
  const repository = useMemo(() => {
    return new HybridRepository();
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
