/**
 * Build transaction for on-chain Walrus blob registration with WAL payment
 * This properly registers blobs on the Sui blockchain using the Walrus protocol
 */

import { Transaction } from "@mysten/sui/transactions";
import type { SuiClient } from "@mysten/sui/client";
import { prepareWalPayment } from "@/lib/sui/wal-coin-utils";
import { blobIdToU256 } from "@/lib/sui/blob-id-utils";
import {
  WALRUS_SYSTEM_OBJECT_ID,
  ENCODING_TYPE,
  DEFAULT_STORAGE_EPOCHS,
  estimateWalCost,
} from "@/lib/sui/walrus-constants";
import { PACKAGE_ID } from "@/lib/sui/client";

export interface SubmitAndRegisterBlobsParams {
  client: SuiClient;
  walletAddress: string;
  // Main blob data
  mainBlobId: string; // Base64url
  mainBlobRootHash: string; // Hex string (0x...)
  mainBlobSize: number; // Unencoded size in bytes
  // Preview blob data
  previewBlobId: string; // Base64url
  previewBlobRootHash: string; // Hex string (0x...)
  previewBlobSize: number; // Unencoded size in bytes
  // Metadata
  sealPolicyId: string; // Hex string (0x...)
  durationSeconds: number;
  // Optional overrides
  storageEpochs?: number; // Default: 26
  encodingType?: number; // Default: RS2 (1)
}

/**
 * Build transaction to submit and register blobs on-chain
 *
 * This function:
 * 1. Calculates WAL cost for storage + writes
 * 2. Collects and merges WAL coins from wallet
 * 3. Builds transaction calling blob_manager::submit_and_register_blobs
 * 4. Pays 0.5 SUI fee + WAL for storage
 *
 * Returns transaction ready to sign and execute
 */
export async function buildSubmitAndRegisterBlobsTransaction(
  params: SubmitAndRegisterBlobsParams,
): Promise<Transaction> {
  const {
    client,
    walletAddress,
    mainBlobId,
    mainBlobRootHash,
    mainBlobSize,
    previewBlobId,
    previewBlobRootHash,
    previewBlobSize,
    sealPolicyId,
    durationSeconds,
    storageEpochs = DEFAULT_STORAGE_EPOCHS,
    encodingType = ENCODING_TYPE.RS2,
  } = params;

  if (!PACKAGE_ID) {
    throw new Error("NEXT_PUBLIC_PACKAGE_ID not configured");
  }

  // Validate inputs
  if (!mainBlobId || mainBlobId.length < 16) {
    throw new Error(`Invalid main blob ID: ${mainBlobId}`);
  }
  if (!previewBlobId || previewBlobId.length < 16) {
    throw new Error(`Invalid preview blob ID: ${previewBlobId}`);
  }
  if (!sealPolicyId || !sealPolicyId.startsWith("0x")) {
    throw new Error(`Invalid seal policy ID: ${sealPolicyId}`);
  }

  const tx = new Transaction();

  // Set higher gas budget for on-chain registration (0.2 SUI)
  tx.setGasBudget(200_000_000);

  // Calculate WAL cost for both blobs
  const mainCost = estimateWalCost(mainBlobSize, storageEpochs, encodingType);
  const previewCost = estimateWalCost(
    previewBlobSize,
    storageEpochs,
    encodingType,
  );
  const totalWalNeeded = mainCost.total + previewCost.total;

  console.log("[Submit Blobs] WAL cost estimation:", {
    mainSize: mainBlobSize,
    mainCost: mainCost.total,
    previewSize: previewBlobSize,
    previewCost: previewCost.total,
    totalWal: totalWalNeeded,
    storageEpochs,
  });

  // Prepare WAL payment (collects and merges coins)
  const { walCoin } = await prepareWalPayment(
    client,
    tx,
    walletAddress,
    totalWalNeeded,
  );

  // Split SUI fee (0.5 SUI for Sonar protocol)
  const [suiCoin] = tx.splitCoins(tx.gas, [500_000_000]);

  // Get Walrus system shared object
  const walrusSystem = tx.object(WALRUS_SYSTEM_OBJECT_ID);

  // Convert blob IDs to u256
  const mainBlobIdU256 = blobIdToU256(mainBlobId);
  const previewBlobIdU256 = blobIdToU256(previewBlobId);

  console.log("[Submit Blobs] Building transaction:", {
    packageId: PACKAGE_ID.substring(0, 20) + "...",
    walrusSystem: WALRUS_SYSTEM_OBJECT_ID.substring(0, 20) + "...",
    mainBlobId: mainBlobId.substring(0, 20) + "...",
    mainBlobIdU256: mainBlobIdU256.substring(0, 20) + "...",
    previewBlobId: previewBlobId.substring(0, 20) + "...",
    sealPolicyId: sealPolicyId.substring(0, 20) + "...",
    durationSeconds,
    encodingType,
    storageEpochs,
  });

  // Call blob_manager::submit_and_register_blobs
  tx.moveCall({
    target: `${PACKAGE_ID}::blob_manager::submit_and_register_blobs`,
    arguments: [
      walrusSystem, // &mut System
      tx.pure.u256(mainBlobIdU256), // main_blob_id: u256
      tx.pure.u256(mainBlobRootHash), // main_blob_root_hash: u256
      tx.pure.u64(mainBlobSize), // main_blob_size: u64
      tx.pure.u256(previewBlobIdU256), // preview_blob_id: u256
      tx.pure.u256(previewBlobRootHash), // preview_blob_root_hash: u256
      tx.pure.u64(previewBlobSize), // preview_blob_size: u64
      tx.pure.string(mainBlobId), // main_blob_id_str: String
      tx.pure.string(previewBlobId), // preview_blob_id_str: String
      tx.pure.string(sealPolicyId), // seal_policy_id: String
      tx.pure.u64(durationSeconds), // duration_seconds: u64
      tx.pure.u8(encodingType), // encoding_type: u8
      tx.pure.u32(storageEpochs), // storage_epochs: u32
      walCoin, // wal_payment: &mut Coin<WAL>
      suiCoin, // sui_payment: Coin<SUI>
    ],
  });

  console.log("[Submit Blobs] ✅ Transaction built successfully");
  return tx;
}

/**
 * Helper to estimate total cost for user display
 */
export function estimateTotalCost(params: {
  mainBlobSize: number;
  previewBlobSize: number;
  storageEpochs?: number;
}): {
  walCost: number;
  suiFee: number;
  gasEstimate: number;
  totalSui: number;
  totalWal: number;
} {
  const {
    mainBlobSize,
    previewBlobSize,
    storageEpochs = DEFAULT_STORAGE_EPOCHS,
  } = params;

  const mainCost = estimateWalCost(mainBlobSize, storageEpochs);
  const previewCost = estimateWalCost(previewBlobSize, storageEpochs);

  const walCost = mainCost.total + previewCost.total;
  const suiFee = 0.5; // Sonar protocol fee
  const gasEstimate = 0.2; // Gas for transaction

  return {
    walCost,
    suiFee,
    gasEstimate,
    totalSui: suiFee + gasEstimate,
    totalWal: walCost,
  };
}
