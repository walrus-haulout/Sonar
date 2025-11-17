/**
 * useSubWalletOrchestrator
 *
 * Manages ephemeral sub-wallets for parallel Walrus uploads with sponsored transactions.
 *
 * ARCHITECTURE NOTES:
 * - Sub-wallets are ephemeral (RAM-only, no persistence)
 * - Sponsor (user wallet) pays gas via dual-signature transactions
 * - No sweeping needed (wallets are throwaway after upload completes)
 *
 * CURRENT LIMITATION:
 * The Sui SDK's TransactionBlock.sign() always tries to resolve gas coins from the sender,
 * which fails for ephemeral sub-wallets with zero balance. This is a fundamental SDK limitation
 * for client-side sponsored transactions where the sponsor is a browser wallet extension.
 *
 * WORKAROUND STRATEGY:
 * - Small files (<1GB): Use Blockberry HTTP API (sponsor wallet signs via edge function)
 * - Large files (≥1GB): Use server-side dual-signature orchestration or wait for SDK support
 *
 * @see /Users/angel/Projects/dreamlit-walrus-sdk/sub-wallet-sdk/src/sub-wallet-walrus/core/SponsoredTransactions.ts
 */

import { useState, useCallback, useRef } from 'react';
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { TransactionBlock } from '@mysten/sui.js/transactions';

export interface EphemeralSubWallet {
  id: string;
  address: string;
  keypair: Ed25519Keypair;
  createdAt: number;
}

export interface SubWalletOrchestratorState {
  wallets: Map<string, EphemeralSubWallet>;
  fundedWallets: Set<string>;
  isProcessing: boolean;
  error: string | null;
}

/**
 * Hook for managing ephemeral sub-wallets
 */
export function useSubWalletOrchestrator() {
  const currentAccount = useCurrentAccount();
  const suiClient = useSuiClient();

  const [state, setState] = useState<SubWalletOrchestratorState>({
    wallets: new Map(),
    fundedWallets: new Set(),
    isProcessing: false,
    error: null,
  });

  // Track active wallets in ref for cleanup
  const activeWalletsRef = useRef<Map<string, EphemeralSubWallet>>(new Map());

  /**
   * Create a new ephemeral sub-wallet (RAM-only, throwaway)
   */
  const createWallet = useCallback((): EphemeralSubWallet => {
    const keypair = Ed25519Keypair.generate();
    const address = keypair.getPublicKey().toSuiAddress();
    const id = `subwallet-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const wallet: EphemeralSubWallet = {
      id,
      address,
      keypair,
      createdAt: Date.now(),
    };

    activeWalletsRef.current.set(id, wallet);
    setState(prev => ({
      ...prev,
      wallets: new Map(prev.wallets).set(id, wallet),
    }));

    return wallet;
  }, []);

  /**
   * Create multiple ephemeral sub-wallets
   */
  const createWallets = useCallback((count: number): EphemeralSubWallet[] => {
    const wallets: EphemeralSubWallet[] = [];
    for (let i = 0; i < count; i++) {
      wallets.push(createWallet());
    }
    return wallets;
  }, [createWallet]);

  /**
   * Discard a sub-wallet (cleanup)
   */
  const discardWallet = useCallback((walletId: string) => {
    activeWalletsRef.current.delete(walletId);
    setState(prev => {
      const newWallets = new Map(prev.wallets);
      newWallets.delete(walletId);
      return { ...prev, wallets: newWallets };
    });
  }, []);

  /**
   * Discard all sub-wallets (cleanup after upload completes)
   */
  const discardAllWallets = useCallback(() => {
    activeWalletsRef.current.clear();
    setState(prev => ({
      ...prev,
      wallets: new Map(),
    }));
  }, []);

  /**
   * Calculate optimal wallet count for file size
   * Formula: 4 base + 4 per GB, capped at 100
   */
  const calculateWalletCount = useCallback((fileSizeBytes: number): number => {
    const sizeGB = fileSizeBytes / (1024 * 1024 * 1024);
    const baseWallets = 4;
    const walletsPerGB = 4;
    const calculated = baseWallets + Math.ceil(sizeGB) * walletsPerGB;
    return Math.min(calculated, 100);
  }, []);

  /**
   * Mark wallets as funded
   */
  const markAsFunded = useCallback((addresses: string[]) => {
    setState(prev => {
      const newFundedWallets = new Set(prev.fundedWallets);
      addresses.forEach(addr => newFundedWallets.add(addr));
      return { ...prev, fundedWallets: newFundedWallets };
    });
  }, []);

  /**
   * Check if a wallet is funded
   */
  const isFunded = useCallback((address: string): boolean => {
    return state.fundedWallets.has(address);
  }, [state.fundedWallets]);

  /**
   * Check wallet balance via Sui client
   */
  const checkWalletBalance = useCallback(async (address: string): Promise<number> => {
    try {
      const balance = await suiClient.getBalance({ owner: address });
      return parseInt(balance.totalBalance);
    } catch (error) {
      console.error(`[SubWalletOrchestrator] Failed to check balance for ${address}:`, error);
      return 0;
    }
  }, [suiClient]);

  /**
   * Check balances for all wallets
   */
  const checkAllBalances = useCallback(async (addresses: string[]): Promise<Map<string, number>> => {
    const balances = new Map<string, number>();
    await Promise.all(
      addresses.map(async (address) => {
        const balance = await checkWalletBalance(address);
        balances.set(address, balance);
      })
    );
    return balances;
  }, [checkWalletBalance]);

  /**
   * Build a Walrus blob storage transaction
   *
   * NOTE: This creates the transaction structure, but signing requires special handling
   * due to the sponsor pattern. See ARCHITECTURE NOTES above.
   *
   * @param subWallet - Ephemeral sub-wallet to use as sender
   * @param blobData - Encrypted blob data
   * @param blobId - Blob identifier from encoding
   * @param rootHash - Root hash from encoding
   * @param epochs - Storage duration
   */
  const buildWalrusStorageTransaction = useCallback((
    subWallet: EphemeralSubWallet,
    blobData: {
      blobId: string;
      rootHash: Uint8Array;
      size: number;
      epochs: number;
    }
  ): TransactionBlock => {
    const tx = new TransactionBlock();
    tx.setSender(subWallet.address);
    tx.setGasBudget(100000000); // 0.1 SUI for Walrus operations

    // This is where we'd call the Walrus registerBlob moveCall
    // Reference the WALRUS package ID from configuration or environment
    // rather than hard-coding values in source control.

    // NOTE: Actual Walrus SDK integration would go here
    // For now, this is a placeholder showing the transaction structure

    return tx;
  }, []);

  return {
    // State
    wallets: Array.from(state.wallets.values()),
    walletsMap: state.wallets,
    walletCount: state.wallets.size,
    fundedWallets: state.fundedWallets,
    isProcessing: state.isProcessing,
    error: state.error,

    // Wallet management
    createWallet,
    createWallets,
    discardWallet,
    discardAllWallets,
    calculateWalletCount,

    // Funding management
    markAsFunded,
    isFunded,
    checkWalletBalance,
    checkAllBalances,

    // Transaction building
    buildWalrusStorageTransaction,

    // Utilities
    isReady: !!currentAccount,
    sponsorAddress: currentAccount?.address,
  };
}

/**
 * Helper: Calculate file chunk distribution across sub-wallets
 */
export function distributeFileAcrossWallets(
  fileSize: number,
  walletCount: number
): Array<{ start: number; end: number; size: number }> {
  const chunkSize = Math.ceil(fileSize / walletCount);
  const chunks: Array<{ start: number; end: number; size: number }> = [];

  for (let i = 0; i < walletCount; i++) {
    const start = i * chunkSize;
    const end = Math.min((i + 1) * chunkSize, fileSize);
    chunks.push({
      start,
      end,
      size: end - start,
    });
  }

  return chunks;
}

/**
 * Helper: Determine upload strategy based on file size
 */
export function getUploadStrategy(fileSizeBytes: number): 'blockberry' | 'sponsored-parallel' {
  const ONE_GB = 1024 * 1024 * 1024;

  // Use Blockberry HTTP API for files < 1GB
  // Use sponsored parallel uploads for files ≥ 1GB
  return fileSizeBytes < ONE_GB ? 'blockberry' : 'sponsored-parallel';
}
