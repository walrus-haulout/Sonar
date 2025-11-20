'use client';

import { createContext, useContext, useMemo } from 'react';
import type { DataRepository } from '@/lib/data/repository';
import { SeedDataRepository } from '@/lib/data/seed-repository';
import { SuiRepository } from '@/lib/data/sui-repository';
import { USE_BLOCKCHAIN } from '@/lib/sui/client';

const RepositoryContext = createContext<DataRepository | null>(null);

/**
 * Repository Provider
 * Provides data repository to the entire app
 * Switches between seed data and blockchain based on environment variables
 */
export function RepositoryProvider({ children }: { children: React.ReactNode }) {
  const repository = useMemo(() => {
    if (USE_BLOCKCHAIN) {
      return new SuiRepository();
    } else {
      return new SeedDataRepository();
    }
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
