import { useState, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useSignAndExecuteTransaction, useCurrentAccount } from '@mysten/dapp-kit';

const AMOUNT_PER_WALLET = 10_000_000; // 0.01 SUI
const MAX_WALLETS_PER_BATCH = 40; // Conservative limit for transaction size

interface FundingProgress {
  totalWallets: number;
  fundedCount: number;
  currentBatch: number;
  totalBatches: number;
  isComplete: boolean;
  error?: string;
}

interface UseBrowserWalletFundingResult {
  fundWallets: (walletAddresses: string[]) => Promise<void>;
  progress: FundingProgress | null;
  isLoading: boolean;
  error: string | null;
  reset: () => void;
}

/**
 * Hook for funding ephemeral wallets using connected browser wallet
 * Handles batch transactions for large wallet counts (up to 100)
 */
export function useBrowserWalletFunding(): UseBrowserWalletFundingResult {
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const currentAccount = useCurrentAccount();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<FundingProgress | null>(null);

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setProgress(null);
  }, []);

  /**
   * Fund a batch of wallets in a single transaction
   */
  const fundWalletsBatch = useCallback(
    (addresses: string[], batchIndex: number, totalBatches: number): Promise<void> => {
      return new Promise((resolve, reject) => {
        const tx = new Transaction();

        // Split and transfer to each wallet
        addresses.forEach((address) => {
          const coin = tx.splitCoins(tx.gas, [AMOUNT_PER_WALLET]);
          tx.transferObjects([coin], address);
        });

        signAndExecute(
          { transaction: tx },
          {
            onSuccess: () => {
              setProgress((prev) => ({
                totalWallets: prev?.totalWallets || addresses.length,
                fundedCount: (prev?.fundedCount || 0) + addresses.length,
                currentBatch: batchIndex + 1,
                totalBatches,
                isComplete: batchIndex + 1 === totalBatches,
              }));
              resolve();
            },
            onError: (err) => {
              const errorMsg = err instanceof Error ? err.message : 'Transaction failed';
              setError(errorMsg);
              reject(new Error(errorMsg));
            },
          }
        );
      });
    },
    [signAndExecute]
  );

  /**
   * Fund multiple wallets, batching if necessary for large counts
   */
  const fundWallets = useCallback(
    async (walletAddresses: string[]): Promise<void> => {
      if (!currentAccount) {
        const error = 'No wallet connected. Please connect your wallet first.';
        setError(error);
        throw new Error(error);
      }

      if (walletAddresses.length === 0) {
        const error = 'No wallet addresses provided';
        setError(error);
        throw new Error(error);
      }

      try {
        setIsLoading(true);
        setError(null);

        const totalWallets = walletAddresses.length;
        const totalSuiNeeded = (totalWallets * AMOUNT_PER_WALLET) / 1_000_000_000;

        console.log(`[BrowserWalletFunding] Funding ${totalWallets} wallets with ${totalSuiNeeded.toFixed(2)} SUI total`);

        // Split into batches if needed
        const batches: string[][] = [];
        for (let i = 0; i < walletAddresses.length; i += MAX_WALLETS_PER_BATCH) {
          batches.push(walletAddresses.slice(i, i + MAX_WALLETS_PER_BATCH));
        }

        const totalBatches = batches.length;

        setProgress({
          totalWallets,
          fundedCount: 0,
          currentBatch: 0,
          totalBatches,
          isComplete: false,
        });

        // Execute batches sequentially
        for (let i = 0; i < batches.length; i++) {
          console.log(`[BrowserWalletFunding] Funding batch ${i + 1}/${totalBatches} (${batches[i].length} wallets)`);
          await fundWalletsBatch(batches[i], i, totalBatches);
        }

        setProgress((prev) => prev ? { ...prev, isComplete: true } : null);
        console.log(`[BrowserWalletFunding] All wallets funded successfully`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown funding error';
        console.error('[BrowserWalletFunding] Funding failed:', errorMsg);
        setError(errorMsg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [currentAccount, fundWalletsBatch]
  );

  return {
    fundWallets,
    progress,
    isLoading,
    error,
    reset,
  };
}
