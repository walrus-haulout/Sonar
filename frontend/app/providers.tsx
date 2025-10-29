'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RepositoryProvider } from '@/providers/repository-provider';
import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui.js/client';
import { useState } from 'react';
import { Toaster } from 'sonner';
import '@mysten/dapp-kit/dist/index.css';

/**
 * Providers Component
 * Wraps the app with all necessary context providers:
 * - React Query for data fetching and caching
 * - Sui Client for blockchain connection
 * - Wallet Provider for Sui wallet integration
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
            gcTime: 300_000, // 5 minutes for cached data
            refetchOnWindowFocus: false,
            retry: 2,
          },
        },
      })
  );

  // Sui network configuration
  const networks = {
    testnet: { url: getFullnodeUrl('testnet') },
    mainnet: { url: getFullnodeUrl('mainnet') },
    devnet: { url: getFullnodeUrl('devnet') },
  };

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <RepositoryProvider>{children}</RepositoryProvider>
          <Toaster
            position="top-right"
            richColors
            theme="dark"
            closeButton
          />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
