import { Transaction } from "@mysten/sui/transactions";
import type { SuiClient } from "@mysten/sui/client";
import { collectCoinsForAmount } from "@/lib/sui/coin-utils";

// Get env vars lazily to support testing
function getWalrusConfig(): {
  packageId: string;
  systemObject: string;
  epochsAhead: number;
} {
  const packageId = process.env.NEXT_PUBLIC_WALRUS_PACKAGE_ID?.trim();
  const systemObject = process.env.NEXT_PUBLIC_WALRUS_SYSTEM_OBJECT?.trim();
  const epochsAhead = Number(
    process.env.NEXT_PUBLIC_WALRUS_DEFAULT_EPOCHS || "26",
  );

  if (!packageId) {
    throw new Error("NEXT_PUBLIC_WALRUS_PACKAGE_ID is not configured");
  }
  if (!systemObject) {
    throw new Error("NEXT_PUBLIC_WALRUS_SYSTEM_OBJECT is not configured");
  }

  return { packageId, systemObject, epochsAhead };
}

export interface RegisterBlobParams {
  blobId: string;
  size: number;
  encodingType?: string;
  storageId?: string;
  deletable?: boolean;
  rootHash?: string;
  walCoinId?: string;
  sponsorAddress?: string;
  suiClient?: SuiClient;
}

/**
 * Convert encoding type string to u8
 * Walrus supports two encoding schemes:
 * - RED_STUFF_RAPTOR (0): RedStuff with RaptorQ
 * - RS2 (1): RedStuff with Reed-Solomon
 */
function encodingTypeToU8(encodingType: string | undefined): number {
  if (!encodingType) {
    console.warn(
      "[Walrus] No encoding type provided, defaulting to RED_STUFF_RAPTOR (0)",
    );
    return 0;
  }

  // Walrus encoding type constants (from walrus::encoding module)
  const typeMap: Record<string, number> = {
    RED_STUFF_RAPTOR: 0,
    RedStuffRaptor: 0,
    RedStuff: 0,
    RaptorQ: 0,
    RS2: 1,
    ReedSolomon: 1,
  };

  const value = typeMap[encodingType];
  if (value === undefined) {
    console.warn(
      `[Walrus] Unknown encoding type: "${encodingType}", defaulting to RED_STUFF_RAPTOR (0)`,
    );
    return 0;
  }

  console.log(
    `[Walrus] Encoding type "${encodingType}" mapped to u8: ${value}`,
  );
  return value;
}

/**
 * Calculate storage size for Walrus blob reservation
 * Walrus erasure coding increases blob size by 4-5x depending on network configuration
 * Using 6x as a safe multiplier to ensure sufficient storage and account for network overhead
 *
 * @param unencodedSize - Original blob size in bytes
 * @returns Storage size to reserve (6x original with safety margin)
 */
function calculateWalrusStorageSize(unencodedSize: number): number {
  // Walrus erasure coding overhead: 4-5x depending on sharding configuration (n_shards)
  // The actual formula is complex and depends on:
  // - encoding_type (RS2 = 1)
  // - n_shards (network configuration)
  // - symbol_size calculations
  // 
  // Using 6x multiplier with additional padding to avoid EResourceSize errors
  // This ensures we always have enough storage regardless of network configuration
  const WALRUS_ERASURE_OVERHEAD = 6;
  const SAFETY_PADDING = 1.1; // 10% additional padding

  const storageSize = Math.ceil(
    unencodedSize * WALRUS_ERASURE_OVERHEAD * SAFETY_PADDING,
  );

  console.log("[Walrus] Storage size calculation:", {
    unencodedSize,
    storageSize,
    overhead: `${WALRUS_ERASURE_OVERHEAD}x + ${((SAFETY_PADDING - 1) * 100).toFixed(0)}% padding`,
  });

  return storageSize;
}

/**
 * Convert a base64url string to a BigInt
 * Walrus blob IDs are base64url encoded, but the Move contract expects a u256
 */
function base64UrlToBigInt(base64Url: string): bigint {
  // 1. Convert base64url to base64
  let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding if needed
  const padding = base64.length % 4;
  if (padding) {
    base64 += "=".repeat(4 - padding);
  }

  // 2. Decode base64 to binary string
  const binary = atob(base64);

  // 3. Convert binary to hex
  let hex = "0x";
  for (let i = 0; i < binary.length; i++) {
    const byte = binary.charCodeAt(i).toString(16).padStart(2, "0");
    hex += byte;
  }

  // 4. Convert hex to BigInt
  return BigInt(hex);
}

export interface BatchRegisterAndSubmitParams {
  // Main Blob
  mainBlob: RegisterBlobParams;
  // Preview Blob
  previewBlob: RegisterBlobParams;
  // Submission
  submission: {
    sealPolicyId: string;
    previewBlobHash?: string; // hex string
    durationSeconds: number;
    suiPaymentCoinId?: string; // Optional: if not provided, will split from gas
  };
  // Payment
  walCoinId?: string;
  sponsorAddress?: string;
  suiClient?: SuiClient;
  // Walrus configuration (optional, uses env vars if not provided)
  walrusConfig?: {
    packageId: string;
    systemObject: string;
    epochsAhead: number;
  };
}

/**
 * Build a batch transaction to register both blobs and submit to marketplace
 */
export async function buildBatchRegisterAndSubmitTransactionAsync(
  params: BatchRegisterAndSubmitParams,
): Promise<Transaction> {
  let resolvedWalCoinId = params.walCoinId;

  // If no coin ID provided, fetch one from the sponsor address
  if (!resolvedWalCoinId && params.sponsorAddress && params.suiClient) {
    console.log(
      "[Walrus] Fetching WAL coin for sponsor:",
      params.sponsorAddress,
    );
    const walCoinType = `${process.env.NEXT_PUBLIC_WAL_TOKEN_PACKAGE}::wal::WAL`;

    try {
      const coinsResult = await collectCoinsForAmount(
        params.suiClient,
        params.sponsorAddress,
        walCoinType,
        1n, // Minimum 1 unit needed
      );

      if (coinsResult.coins.length === 0) {
        throw new Error(
          "No WAL coins found in sponsor wallet. Please ensure you have WAL tokens to pay for blob storage.",
        );
      }

      const selectedCoin = coinsResult.coins[0];
      resolvedWalCoinId = selectedCoin.coinObjectId;

      console.log("[Walrus] WAL coin fetching successful:", {
        totalBalance: coinsResult.total.toString(),
        coinCount: coinsResult.coins.length,
        selectedCoinId: resolvedWalCoinId,
        selectedCoinBalance: selectedCoin.balance.toString(),
      });
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to fetch WAL coins";
      throw new Error(
        `[Walrus] Could not obtain WAL payment coin: ${errorMsg}`,
      );
    }
  }

  if (!resolvedWalCoinId) {
    throw new Error(
      "[Walrus] WAL coin ID not provided and unable to fetch. " +
      "Either provide walCoinId or provide sponsorAddress with suiClient.",
    );
  }

  // Use provided walrusConfig or fetch from env vars
  const walrusConfig = params.walrusConfig || getWalrusConfig();

  return buildBatchRegisterAndSubmitTransaction({
    ...params,
    walCoinId: resolvedWalCoinId,
    walrusConfig,
  });
}

export function buildBatchRegisterAndSubmitTransaction(
  params: BatchRegisterAndSubmitParams,
): Transaction {
  const { mainBlob, previewBlob, submission, walCoinId } = params;
  const sonarPackageId = process.env.NEXT_PUBLIC_PACKAGE_ID;
  const walrusConfig = params.walrusConfig || getWalrusConfig();

  if (!sonarPackageId) {
    throw new Error("NEXT_PUBLIC_PACKAGE_ID is not defined");
  }

  if (!walCoinId) {
    throw new Error("[Walrus] WAL coin ID is required for batch registration");
  }

  const tx = new Transaction();
  const {
    packageId: walrusPackageId,
    systemObject,
    epochsAhead,
  } = walrusConfig;

  console.log("[Walrus] Building batch registration transaction:", {
    mainBlobId: mainBlob.blobId,
    mainBlobSize: mainBlob.size,
    previewBlobId: previewBlob.blobId,
    previewBlobSize: previewBlob.size,
    epochsAhead,
    walCoinId,
  });

  // Reference to the WAL coin - will be reused for all calls
  const walCoinRef = tx.object(walCoinId);

  // Step 1: Reserve space for main blob
  // Calculate storage size with 5x erasure coding overhead
  const mainStorageSize = calculateWalrusStorageSize(mainBlob.size);
  console.log(
    "[Walrus] Reserving space for main blob:",
    mainBlob.size,
    "bytes (unencoded) →",
    mainStorageSize,
    "bytes (encoded storage)",
  );
  const [mainStorage] = tx.moveCall({
    target: `${walrusPackageId}::system::reserve_space`,
    arguments: [
      tx.object(systemObject), // self: &mut System
      tx.pure.u64(mainStorageSize), // storage_amount: u64 (5x for erasure coding)
      tx.pure.u32(epochsAhead), // epochs_ahead: u32
      walCoinRef, // payment: &mut Coin<WAL>
    ],
  });

  // Step 2: Register main blob
  console.log(
    "[Walrus] Registering main blob with UNENCODED size:",
    mainBlob.size,
  );
  const mainBlobIdBigInt = base64UrlToBigInt(mainBlob.blobId);
  const mainEncodingTypeU8 = encodingTypeToU8(mainBlob.encodingType);

  tx.moveCall({
    target: `${walrusPackageId}::system::register_blob`,
    arguments: [
      tx.object(systemObject), // self: &mut System
      mainStorage, // storage: Storage
      tx.pure.u256(mainBlobIdBigInt), // blob_id: u256
      tx.pure.u256(mainBlobIdBigInt), // root_hash: u256 (use blob_id as default)
      tx.pure.u64(mainBlob.size), // size: u64 (UNENCODED blob size - contract calculates encoded size)
      tx.pure.u8(mainEncodingTypeU8), // encoding_type: u8
      tx.pure.bool(mainBlob.deletable ?? true), // deletable: bool
      walCoinRef, // write_payment: &mut Coin<WAL>
    ],
  });

  // Step 3: Reserve space for preview blob
  // Calculate storage size with 5x erasure coding overhead
  const previewStorageSize = calculateWalrusStorageSize(previewBlob.size);
  console.log(
    "[Walrus] Reserving space for preview blob:",
    previewBlob.size,
    "bytes (unencoded) →",
    previewStorageSize,
    "bytes (encoded storage)",
  );
  const [previewStorage] = tx.moveCall({
    target: `${walrusPackageId}::system::reserve_space`,
    arguments: [
      tx.object(systemObject), // self: &mut System
      tx.pure.u64(previewStorageSize), // storage_amount: u64 (5x for erasure coding)
      tx.pure.u32(epochsAhead), // epochs_ahead: u32
      walCoinRef, // payment: &mut Coin<WAL>
    ],
  });

  // Step 4: Register preview blob
  console.log(
    "[Walrus] Registering preview blob with UNENCODED size:",
    previewBlob.size,
  );
  const previewBlobIdBigInt = base64UrlToBigInt(previewBlob.blobId);
  const previewEncodingTypeU8 = encodingTypeToU8(previewBlob.encodingType);

  tx.moveCall({
    target: `${walrusPackageId}::system::register_blob`,
    arguments: [
      tx.object(systemObject), // self: &mut System
      previewStorage, // storage: Storage
      tx.pure.u256(previewBlobIdBigInt), // blob_id: u256
      tx.pure.u256(previewBlobIdBigInt), // root_hash: u256 (use blob_id as default)
      tx.pure.u64(previewBlob.size), // size: u64 (UNENCODED blob size - contract calculates encoded size)
      tx.pure.u8(previewEncodingTypeU8), // encoding_type: u8
      tx.pure.bool(previewBlob.deletable ?? true), // deletable: bool
      walCoinRef, // write_payment: &mut Coin<WAL>
    ],
  });

  // Step 5: Submit to marketplace (collect 0.25 SUI fee)
  console.log("[Walrus] Submitting blobs to marketplace");
  let suiPaymentCoin;
  if (
    submission.suiPaymentCoinId &&
    submission.suiPaymentCoinId !== "GAS_COIN_PLACEHOLDER"
  ) {
    suiPaymentCoin = tx.object(submission.suiPaymentCoinId);
  } else {
    // Split from gas
    const [coin] = tx.splitCoins(tx.gas, [250_000_000]); // 0.25 SUI
    suiPaymentCoin = coin;
  }

  tx.moveCall({
    target: `${sonarPackageId}::blob_manager::submit_blobs`,
    arguments: [
      tx.pure.string(mainBlob.blobId),
      tx.pure.string(previewBlob.blobId),
      tx.pure.string(submission.sealPolicyId),
      tx.pure.u64(submission.durationSeconds),
      suiPaymentCoin,
    ],
  });

  console.log("[Walrus] Batch registration transaction built successfully");
  return tx;
}
