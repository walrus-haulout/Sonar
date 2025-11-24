/**
 * WAL Coin Utilities
 * Functions for collecting and managing WAL coins for Walrus storage payments
 */

import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { WAL_COIN_TYPE, walToMist } from "./walrus-constants";

export interface WalCoin {
  coinObjectId: string;
  balance: bigint;
  digest: string;
}

/**
 * Get all WAL coins owned by an address
 */
export async function getWalCoins(
  client: SuiClient,
  address: string,
): Promise<WalCoin[]> {
  try {
    const { data } = await client.getCoins({
      owner: address,
      coinType: WAL_COIN_TYPE,
    });

    return data.map((coin) => ({
      coinObjectId: coin.coinObjectId,
      balance: BigInt(coin.balance),
      digest: coin.digest,
    }));
  } catch (error) {
    console.error("[WAL] Failed to fetch WAL coins:", error);
    throw new Error("Failed to fetch WAL coins from wallet");
  }
}

/**
 * Get total WAL balance for an address
 */
export async function getWalBalance(
  client: SuiClient,
  address: string,
): Promise<bigint> {
  const coins = await getWalCoins(client, address);
  return coins.reduce((total, coin) => total + coin.balance, 0n);
}

/**
 * Collect WAL coins to meet a required amount
 * Returns transaction builder operations to merge coins
 */
export async function collectWalCoins(
  client: SuiClient,
  address: string,
  requiredAmount: bigint,
): Promise<{
  coins: WalCoin[];
  totalAmount: bigint;
  primaryCoin: string;
}> {
  const availableCoins = await getWalCoins(client, address);

  if (availableCoins.length === 0) {
    throw new Error(
      "No WAL coins found in wallet. Please acquire WAL tokens to pay for storage.",
    );
  }

  // Sort by balance descending
  availableCoins.sort((a, b) =>
    a.balance > b.balance ? -1 : a.balance < b.balance ? 1 : 0,
  );

  let totalCollected = 0n;
  const selectedCoins: WalCoin[] = [];

  // Greedily select coins until we have enough
  for (const coin of availableCoins) {
    selectedCoins.push(coin);
    totalCollected += coin.balance;

    if (totalCollected >= requiredAmount) {
      break;
    }
  }

  if (totalCollected < requiredAmount) {
    const requiredWal = Number(requiredAmount) / 1_000_000_000;
    const availableWal = Number(totalCollected) / 1_000_000_000;
    throw new Error(
      `Insufficient WAL balance. Required: ${requiredWal.toFixed(4)} WAL, Available: ${availableWal.toFixed(4)} WAL`,
    );
  }

  return {
    coins: selectedCoins,
    totalAmount: totalCollected,
    primaryCoin: selectedCoins[0].coinObjectId,
  };
}

/**
 * Build transaction to merge WAL coins
 * Returns the merged coin object that can be used for payment
 */
export function mergeWalCoins(
  tx: Transaction,
  coinIds: string[],
): ReturnType<typeof tx.object> {
  if (coinIds.length === 0) {
    throw new Error("No coin IDs provided to merge");
  }

  if (coinIds.length === 1) {
    // Single coin, no merging needed
    return tx.object(coinIds[0]);
  }

  // Merge all coins into the first one
  const [primaryCoinId, ...otherCoinIds] = coinIds;
  const primaryCoin = tx.object(primaryCoinId);

  if (otherCoinIds.length > 0) {
    tx.mergeCoins(
      primaryCoin,
      otherCoinIds.map((id) => tx.object(id)),
    );
  }

  return primaryCoin;
}

/**
 * Prepare WAL payment for a transaction
 * Collects coins, merges them if needed, and returns a coin object for payment
 */
export async function prepareWalPayment(
  client: SuiClient,
  tx: Transaction,
  address: string,
  amountWal: number,
): Promise<{
  walCoin: ReturnType<typeof tx.object>;
  totalCollected: bigint;
}> {
  const requiredMist = walToMist(amountWal);
  const { coins, totalAmount } = await collectWalCoins(
    client,
    address,
    requiredMist,
  );

  const coinIds = coins.map((c) => c.coinObjectId);
  const walCoin = mergeWalCoins(tx, coinIds);

  return {
    walCoin,
    totalCollected: totalAmount,
  };
}

/**
 * Format WAL amount for display
 */
export function formatWal(mist: bigint, decimals: number = 4): string {
  const wal = Number(mist) / 1_000_000_000;
  return wal.toFixed(decimals);
}
