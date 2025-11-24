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
    RS: 1,
  };

  const value = typeMap[encodingType];
  if (value === undefined) {
    console.warn(
      `[Walrus] Unknown encoding type: "${encodingType}", defaulting to RED_STUFF_RAPTOR (0)`,
    );
    return 0;
  }

  return value;
}

/**
 * Calculate storage size for Walrus blob reservation
 */
function calculateWalrusStorageSize(
  unencodedSize: number,
  nShards?: number,
  encodingType: number = 1, // Default to RS2
): number {
  // Fallback: Use conservative multiplier for safety
  const CONSERVATIVE_MULTIPLIER = 200;
  return Math.ceil(unencodedSize * CONSERVATIVE_MULTIPLIER);
}

/**
 * Convert a base64url string to a BigInt
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
 * NOTE: The Walrus HTTP API (Publisher) typically handles the on-chain registration
 * and payment for the blob storage. This function builds the transaction to
 * submit the blob metadata to the Sonar marketplace.
 *
 * If the user wants to pay for storage themselves (User-Pays model),
 * we would need to add a `register_blob` call here, but that requires a WAL coin input.
 */
export async function buildBatchRegisterAndSubmitTransactionAsync(
  params: BatchRegisterAndSubmitParams,
): Promise<Transaction> {
  console.log(
    "[Sonar] Building batch registration and submission transaction...",
  );
  // We can perform async checks here if needed in the future
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

  // NOTE: Blobs are assumed to be registered by the Publisher.
  // We only submit to the marketplace here.

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

/**
 * Single-transaction blob submission with static 0.5 SUI fee
 *
 * Calls blob_manager::submit_blobs() which:
 * - Validates fee >= 0.5 SUI (MIN_SUBMISSION_FEE_SUI = 500_000_000 MIST)
 * - Transfers fee to protocol recipient (0xca79369...)
 * - Emits BlobsSubmitted event for backend tracking
 *
 * Move signature:
 *   public fun submit_blobs(
 *     main_blob_id: String,
 *     preview_blob_id: String,
 *     seal_policy_id: String,
 *     duration_seconds: u64,
 *     sui_payment: Coin<SUI>,
 *     ctx: &mut TxContext
 *   )
 */
export interface SubmitBlobsParams {
  mainBlobId: string;
  previewBlobId: string;
  sealPolicyId: string;
  durationSeconds: number;
}

export function buildSubmitBlobsTransaction(
  params: SubmitBlobsParams,
): Transaction {
  const { mainBlobId, previewBlobId, sealPolicyId, durationSeconds } = params;
  const sonarPackageId = process.env.NEXT_PUBLIC_PACKAGE_ID;

  if (!sonarPackageId) {
    throw new Error("NEXT_PUBLIC_PACKAGE_ID is not defined");
  }

  // Validate blob IDs are non-empty (preview_blob_id is required by Move)
  if (!mainBlobId || mainBlobId.length === 0) {
    throw new Error("main_blob_id cannot be empty");
  }
  if (!previewBlobId || previewBlobId.length === 0) {
    throw new Error(
      "preview_blob_id cannot be empty (required by Move contract)",
    );
  }

  const tx = new Transaction();

  // Use higher gas budget for mainnet safety (0.1-0.15 SUI)
  tx.setGasBudget(150_000_000); // 0.15 SUI gas budget

  // Static 0.5 SUI fee (contract minimum)
  const STATIC_FEE_MIST = 500_000_000; // 0.5 SUI

  // Split fee from gas coin
  // Important: gas coin must have at least (fee + gas) = ~0.65 SUI
  const [suiPaymentCoin] = tx.splitCoins(tx.gas, [STATIC_FEE_MIST]);

  // Call blob_manager::submit_blobs
  // Arguments MUST match Move signature order:
  // (String, String, String, u64, Coin<SUI>)
  tx.moveCall({
    target: `${sonarPackageId}::blob_manager::submit_blobs`,
    arguments: [
      tx.pure.string(mainBlobId), // main_blob_id: String
      tx.pure.string(previewBlobId), // preview_blob_id: String
      tx.pure.string(sealPolicyId), // seal_policy_id: String
      tx.pure.u64(durationSeconds), // duration_seconds: u64
      suiPaymentCoin, // sui_payment: Coin<SUI>
    ],
  });

  console.log("[Sonar] Built submit_blobs transaction:", {
    packageId: sonarPackageId.substring(0, 20) + "...",
    mainBlobId: mainBlobId.substring(0, 20) + "...",
    previewBlobId: previewBlobId.substring(0, 20) + "...",
    sealPolicyId: sealPolicyId.substring(0, 20) + "...",
    durationSeconds,
    feeMist: STATIC_FEE_MIST,
    feeSui: "0.5",
    gasBudget: "0.15 SUI",
  });

  return tx;
}
