import { useState, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useSignAndExecuteTransaction, useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import type { EphemeralSubWallet } from './useSubWalletOrchestrator';

interface SponsorshipProgress {
  totalTransactions: number;
  sponsoredCount: number;
  currentBatch: number;
  totalBatches: number;
  isComplete: boolean;
  error?: string;
}

interface UseBrowserWalletSponsorshipResult {
  sponsorTransactions: (
    buildTransaction: (subWallet: EphemeralSubWallet) => Promise<Transaction>,
    subWallets: EphemeralSubWallet[]
  ) => Promise<void>;
  progress: SponsorshipProgress | null;
  isLoading: boolean;
  error: string | null;
  reset: () => void;
}

const MAX_TRANSACTIONS_PER_BATCH = 10; // Process transactions in batches

/**
 * Hook for sponsoring transactions from ephemeral wallets using browser wallet
 * The browser wallet pays gas while ephemeral wallets execute the transactions
 */
export function useBrowserWalletSponsorship(): UseBrowserWalletSponsorshipResult {
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SponsorshipProgress | null>(null);

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setProgress(null);
  }, []);

  /**
   * Sponsor a batch of transactions
   */
  const sponsorTransactionBatch = useCallback(
    async (
      buildTransaction: (subWallet: EphemeralSubWallet) => Promise<Transaction>,
      subWallets: EphemeralSubWallet[],
      batchIndex: number,
      totalBatches: number
    ): Promise<void> => {
      if (!currentAccount) {
        throw new Error('No wallet connected');
      }

      // Process transactions sequentially within the batch
      for (const subWallet of subWallets) {
        // Build transaction for this sub-wallet
        const tx = await buildTransaction(subWallet);

        // Step 1: Build transaction kind without gas data
        const kindBytes = await tx.build({
          client: suiClient,
          onlyTransactionKind: true,
        });

        // Step 2: Ephemeral wallet signs the transaction kind
        const senderSig = await subWallet.keypair.sign(kindBytes);

        // Step 3: Create sponsored transaction
        const sponsoredTx = Transaction.fromKind(kindBytes);
        sponsoredTx.setSender(subWallet.address);
        sponsoredTx.setGasOwner(currentAccount.address);

        // Step 4: Execute with dual signatures
        // The browser wallet will add its signature when we call signAndExecute
        try {
          await signAndExecute({
            transaction: sponsoredTx,
          });

          setProgress((prev) => ({
            totalTransactions: prev?.totalTransactions || subWallets.length,
            sponsoredCount: (prev?.sponsoredCount || 0) + 1,
            currentBatch: batchIndex + 1,
            totalBatches,
            isComplete: batchIndex + 1 === totalBatches,
          }));
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Transaction sponsorship failed';
          setError(errorMsg);
          throw new Error(errorMsg);
        }
      }
    },
    [currentAccount, suiClient, signAndExecute]
  );

  /**
   * Sponsor multiple transactions, batching if necessary
   */
  const sponsorTransactions = useCallback(
    async (
      buildTransaction: (subWallet: EphemeralSubWallet) => Promise<Transaction>,
      subWallets: EphemeralSubWallet[]
    ): Promise<void> => {
      if (!currentAccount) {
        const error = 'No wallet connected. Please connect your wallet first.';
        setError(error);
        throw new Error(error);
      }

      if (subWallets.length === 0) {
        const error = 'No sub-wallets provided';
        setError(error);
        throw new Error(error);
      }

      try {
        setIsLoading(true);
        setError(null);

        console.log(`[BrowserWalletSponsorship] Sponsoring ${subWallets.length} transactions`);

        // Split into batches if needed
        const batches: EphemeralSubWallet[][] = [];
        for (let i = 0; i < subWallets.length; i += MAX_TRANSACTIONS_PER_BATCH) {
          batches.push(subWallets.slice(i, i + MAX_TRANSACTIONS_PER_BATCH));
        }

        const totalBatches = batches.length;

        setProgress({
          totalTransactions: subWallets.length,
          sponsoredCount: 0,
          currentBatch: 0,
          totalBatches,
          isComplete: false,
        });

        // Execute batches sequentially
        for (let i = 0; i < batches.length; i++) {
          console.log(
            `[BrowserWalletSponsorship] Sponsoring batch ${i + 1}/${totalBatches} (${batches[i].length} transactions)`
          );
          await sponsorTransactionBatch(buildTransaction, batches[i], i, totalBatches);
        }

        setProgress((prev) => (prev ? { ...prev, isComplete: true } : null));
        console.log(`[BrowserWalletSponsorship] All transactions sponsored successfully`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown sponsorship error';
        console.error('[BrowserWalletSponsorship] Sponsorship failed:', errorMsg);
        setError(errorMsg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [currentAccount, sponsorTransactionBatch]
  );

  return {
    sponsorTransactions,
    progress,
    isLoading,
    error,
    reset,
  };
}
