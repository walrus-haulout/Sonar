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
 * Query n_shards from the Walrus system object
 * This is needed for accurate storage size calculation
 */
async function getNShardsFromSystem(
  suiClient: SuiClient,
  systemObjectId: string,
): Promise<number> {
  try {
    const systemObject = await suiClient.getObject({
      id: systemObjectId,
      options: { showContent: true },
    });

    if (!systemObject.data?.content || systemObject.data.content.dataType !== "moveObject") {
      throw new Error("Invalid system object structure");
    }

    const fields = systemObject.data.content.fields as any;
    
    // The n_shards value is in the system state inner object
    // Navigate: System -> inner (VersionedInner) -> contents (SystemStateInnerV1)
    let nShards: number | undefined;
    
    if (fields.inner?.fields?.contents?.fields?.epoch_params?.fields?.n_shards) {
      nShards = Number(fields.inner.fields.contents.fields.epoch_params.fields.n_shards);
    }
    
    if (!nShards || nShards === 0) {
      console.warn("[Walrus] Could not query n_shards from system object, using default 1000");
      return 1000; // Mainnet default
    }

    console.log(`[Walrus] Queried n_shards from system: ${nShards}`);
    return nShards;
  } catch (error) {
    console.warn("[Walrus] Failed to query n_shards, using default 1000:", error);
    return 1000; // Fallback to mainnet default
  }
}

/**
 * Calculate exact encoded blob length using Walrus redstuff formula
 * This matches the Move contract logic in walrus::redstuff::encoded_blob_length
 * 
 * Formula from contracts/dependencies/walrus/sources/system/redstuff.move
 */
function calculateExactEncodedSize(
  unencodedLength: number,
  nShards: number,
  encodingType: number, // 0 = RED_STUFF_RAPTOR, 1 = RS2
): number {
  const DIGEST_LEN = 32;
  const BLOB_ID_LEN = 32;
  
  // Helper: max_byzantine
  const maxByzantine = Math.floor((nShards - 1) / 3);
  
  // Helper: decoding_safety_limit
  const decodingSafetyLimit = encodingType === 0 
    ? Math.min(Math.floor(maxByzantine / 5), 5) // RED_STUFF_RAPTOR
    : 0; // RS2
  
  // source_symbols_primary and source_symbols_secondary
  const primary = nShards - 2 * maxByzantine - decodingSafetyLimit;
  const secondary = nShards - maxByzantine - decodingSafetyLimit;
  
  // n_source_symbols
  const nSourceSymbols = primary * secondary;
  
  // symbol_size
  const unencodedLengthAdjusted = unencodedLength === 0 ? 1 : unencodedLength;
  let symbolSize = Math.ceil(unencodedLengthAdjusted / nSourceSymbols);
  
  // For RS2, symbol size must be even (multiple of 2)
  if (encodingType === 1 && symbolSize % 2 === 1) {
    symbolSize += 1;
  }
  
  // slivers_size
  const sliversSize = (primary + secondary) * symbolSize;
  
  // metadata_size
  const metadataSize = nShards * DIGEST_LEN * 2 + BLOB_ID_LEN;
  
  // encoded_blob_length
  const encodedSize = nShards * (sliversSize + metadataSize);
  
  console.log("[Walrus] Exact encoding calculation:", {
    unencodedLength,
    nShards,
    encodingType: encodingType === 0 ? "RED_STUFF_RAPTOR" : "RS2",
    maxByzantine,
    decodingSafetyLimit,
    primary,
    secondary,
    nSourceSymbols,
    symbolSize,
    sliversSize,
    metadataSize,
    encodedSize,
    multiplier: `${(encodedSize / unencodedLength).toFixed(2)}x`,
  });
  
  return encodedSize;
}

/**
 * Calculate storage size for Walrus blob reservation with exact calculation
 * 
 * @param unencodedSize - Original blob size in bytes
 * @param nShards - Number of shards (optional, will use fallback multiplier if not provided)
 * @param encodingType - Encoding type (0 = RED_STUFF_RAPTOR, 1 = RS2)
 * @returns Storage size to reserve
 */
function calculateWalrusStorageSize(
  unencodedSize: number,
  nShards?: number,
  encodingType: number = 1, // Default to RS2
): number {
  // If n_shards is provided, calculate exact size
  if (nShards !== undefined && nShards > 0) {
    const exactSize = calculateExactEncodedSize(unencodedSize, nShards, encodingType);
    // Add 5% safety padding for any rounding differences
    const storageSize = Math.ceil(exactSize * 1.05);
    
    console.log("[Walrus] Storage size calculation (exact):", {
      unencodedSize,
      nShards,
      exactEncodedSize: exactSize,
      storageSize,
      overhead: `${(storageSize / unencodedSize).toFixed(2)}x with 5% padding`,
    });
    
    return storageSize;
  }
  
  // Fallback: Use conservative multiplier for safety
  // For small files with 1000 shards, we need ~160x multiplier
  // Use 200x to be safe for all file sizes
  const CONSERVATIVE_MULTIPLIER = 200;
  
  const storageSize = Math.ceil(unencodedSize * CONSERVATIVE_MULTIPLIER);
  
  console.warn("[Walrus] Storage size calculation (fallback):", {
    unencodedSize,
    storageSize,
    overhead: `${CONSERVATIVE_MULTIPLIER}x (conservative - n_shards not available)`,
    warning: "Using conservative multiplier - consider querying n_shards for efficiency",
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
  // Optional: if already queried, avoids re-querying
  nShards?: number;
}

/**
 * Build a batch transaction to register both blobs and submit to marketplace
 */
export async function buildBatchRegisterAndSubmitTransactionAsync(
  params: BatchRegisterAndSubmitParams,
): Promise<Transaction> {
  let resolvedWalCoinId = params.walCoinId;
  
  // Use provided walrusConfig or fetch from env vars
  const walrusConfig = params.walrusConfig || getWalrusConfig();

  // Query n_shards from the Walrus system object if suiClient is available
  let nShards: number | undefined = params.nShards;
  if (!nShards && params.suiClient) {
    nShards = await getNShardsFromSystem(params.suiClient, walrusConfig.systemObject);
  }

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

  return buildBatchRegisterAndSubmitTransaction({
    ...params,
    walCoinId: resolvedWalCoinId,
    walrusConfig,
    nShards,
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
  // Calculate storage size using exact encoding formula or fallback multiplier
  const mainEncodingTypeU8 = encodingTypeToU8(mainBlob.encodingType);
  const mainStorageSize = calculateWalrusStorageSize(
    mainBlob.size,
    params.nShards,
    mainEncodingTypeU8,
  );
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
      tx.pure.u64(mainStorageSize), // storage_amount: u64
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
  // Calculate storage size using exact encoding formula or fallback multiplier
  const previewEncodingTypeU8 = encodingTypeToU8(previewBlob.encodingType);
  const previewStorageSize = calculateWalrusStorageSize(
    previewBlob.size,
    params.nShards,
    previewEncodingTypeU8,
  );
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
      tx.pure.u64(previewStorageSize), // storage_amount: u64
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
