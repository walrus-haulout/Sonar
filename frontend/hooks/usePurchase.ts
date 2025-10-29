import { useState } from 'react';
import { useSignAndExecuteTransaction, useCurrentAccount } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import type { Dataset } from '@/types/blockchain';

export interface PurchaseState {
  isPurchasing: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: Error | null;
  digest: string | null;
}

export interface UsePurchaseReturn {
  purchaseDataset: (dataset: Dataset) => Promise<void>;
  state: PurchaseState;
  reset: () => void;
}

/**
 * usePurchase Hook
 * Handles dataset purchase transactions on Sui blockchain
 *
 * Features:
 * - Wallet connection check
 * - Transaction building with Move smart contract call
 * - Transaction signing and execution
 * - Success/error handling
 * - Transaction digest for tracking
 *
 * Usage:
 * ```tsx
 * const { purchaseDataset, state } = usePurchase();
 *
 * const handlePurchase = async () => {
 *   await purchaseDataset(dataset);
 *   if (state.isSuccess) {
 *     // Show success message
 *   }
 * };
 * ```
 */
export function usePurchase(): UsePurchaseReturn {
  const currentAccount = useCurrentAccount();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const [state, setState] = useState<PurchaseState>({
    isPurchasing: false,
    isSuccess: false,
    isError: false,
    error: null,
    digest: null,
  });

  const reset = () => {
    setState({
      isPurchasing: false,
      isSuccess: false,
      isError: false,
      error: null,
      digest: null,
    });
  };

  const purchaseDataset = async (dataset: Dataset) => {
    // Check wallet connection
    if (!currentAccount) {
      setState({
        isPurchasing: false,
        isSuccess: false,
        isError: true,
        error: new Error('Please connect your wallet first'),
        digest: null,
      });
      return;
    }

    setState({
      isPurchasing: true,
      isSuccess: false,
      isError: false,
      error: null,
      digest: null,
    });

    try {
      // Build transaction
      const tx = new Transaction();

      // Get SONAR token object for payment
      // Note: This is a placeholder - actual implementation will need to:
      // 1. Query user's SONAR token balance
      // 2. Split coins if needed
      // 3. Pass correct coin object to Move function

      // Call purchase_dataset Move function
      // Placeholder: Replace with actual package ID and module
      const packageId = process.env.NEXT_PUBLIC_SONAR_PACKAGE_ID || '0x...';

      // Example Move call structure:
      // tx.moveCall({
      //   target: `${packageId}::marketplace::purchase_dataset`,
      //   arguments: [
      //     tx.object(dataset.id), // Dataset object ID
      //     tx.pure.u64(dataset.price), // Price in SONAR (smallest units)
      //   ],
      // });

      // For now, we'll create a simple placeholder transaction
      // This demonstrates the transaction flow without deployed contracts
      tx.setGasBudget(10_000_000); // 0.01 SUI

      console.log('Purchase transaction built:', {
        dataset: dataset.id,
        price: dataset.price,
        buyer: currentAccount.address,
      });

      // Sign and execute transaction
      const result = await signAndExecuteTransaction({
        transaction: tx,
      });

      console.log('Transaction result:', result);

      setState({
        isPurchasing: false,
        isSuccess: true,
        isError: false,
        error: null,
        digest: result.digest,
      });

      // Note: In production, you would:
      // 1. Wait for transaction confirmation
      // 2. Update local state/cache
      // 3. Trigger data refetch
      // 4. Show success notification with explorer link
    } catch (error) {
      console.error('Purchase failed:', error);

      setState({
        isPurchasing: false,
        isSuccess: false,
        isError: true,
        error: error as Error,
        digest: null,
      });
    }
  };

  return {
    purchaseDataset,
    state,
    reset,
  };
}
