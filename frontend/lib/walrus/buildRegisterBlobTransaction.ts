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

    if (
      !systemObject.data?.content ||
      systemObject.data.content.dataType !== "moveObject"
    ) {
      throw new Error("Invalid system object structure");
    }

    const fields = systemObject.data.content.fields as any;

    // The n_shards value is in the system state inner object
    // Navigate: System -> inner (VersionedInner) -> contents (SystemStateInnerV1)
    let nShards: number | undefined;

    if (
      fields.inner?.fields?.contents?.fields?.epoch_params?.fields?.n_shards
    ) {
      nShards = Number(
        fields.inner.fields.contents.fields.epoch_params.fields.n_shards,
      );
    }

    if (!nShards || nShards === 0) {
      console.warn(
        "[Walrus] Could not query n_shards from system object, using default 1000",
      );
      return 1000; // Mainnet default
    }

    console.log(`[Walrus] Queried n_shards from system: ${nShards}`);
    return nShards;
  } catch (error) {
    console.warn(
      "[Walrus] Failed to query n_shards, using default 1000:",
      error,
    );
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
  const decodingSafetyLimit =
    encodingType === 0
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
    const exactSize = calculateExactEncodedSize(
      unencodedSize,
      nShards,
      encodingType,
    );
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
    warning:
      "Using conservative multiplier - consider querying n_shards for efficiency",
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
  // Main Blob (already registered by Walrus HTTP API)
  mainBlob: {
    blobId: string;
    size: number;
  };
  // Preview Blob (already registered by Walrus HTTP API)
  previewBlob: {
    blobId: string;
    size: number;
  };
  // Submission metadata for Sonar marketplace
  submission: {
    sealPolicyId: string;
    previewBlobHash?: string; // hex string
    durationSeconds: number;
    suiPaymentCoinId?: string; // Optional: if not provided, will split from gas
  };
}

/**
 * Build a transaction to submit already-registered blobs to the Sonar marketplace
 *
 * NOTE: The Walrus HTTP API already registers blobs on-chain automatically.
 * This function only builds a transaction to submit the blob metadata to the Sonar marketplace
 * for tracking and points calculation.
 */
export async function buildBatchRegisterAndSubmitTransactionAsync(
  params: BatchRegisterAndSubmitParams,
): Promise<Transaction> {
  console.log(
    "[Sonar] Building marketplace submission (blobs already registered by Walrus HTTP API)",
  );

  // No need to fetch WAL coins or query n_shards since we're not registering blobs
  // The Walrus HTTP API already handled blob registration with automatic payment
  return buildBatchRegisterAndSubmitTransaction(params);
}

export function buildBatchRegisterAndSubmitTransaction(
  params: BatchRegisterAndSubmitParams,
): Transaction {
  const { mainBlob, previewBlob, submission } = params;
  const sonarPackageId = process.env.NEXT_PUBLIC_PACKAGE_ID;

  if (!sonarPackageId) {
    throw new Error("NEXT_PUBLIC_PACKAGE_ID is not defined");
  }

  const tx = new Transaction();

  console.log("[Sonar] Building marketplace submission transaction:", {
    mainBlobId: mainBlob.blobId,
    previewBlobId: previewBlob.blobId,
    sealPolicyId: submission.sealPolicyId,
    durationSeconds: submission.durationSeconds,
  });

  // NOTE: Blobs are already registered on-chain by the Walrus HTTP API
  // We only need to submit them to the Sonar marketplace

  // Submit to marketplace (collect 0.5-10 SUI fee based on quality)
  // Build SUI payment coin
  let suiPaymentCoin;
  if (
    submission.suiPaymentCoinId &&
    submission.suiPaymentCoinId !== "GAS_COIN_PLACEHOLDER"
  ) {
    suiPaymentCoin = tx.object(submission.suiPaymentCoinId);
  } else {
    // Split from gas (minimum fee)
    const [coin] = tx.splitCoins(tx.gas, [500_000_000]); // 0.5 SUI minimum
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

  console.log("[Sonar] Marketplace submission transaction built successfully");
  return tx;
}
