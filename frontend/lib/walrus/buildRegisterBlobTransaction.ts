import { Transaction } from '@mysten/sui/transactions';
import type { SuiClient } from '@mysten/sui/client';
import { collectCoinsForAmount } from '@/lib/sui/coin-utils';

// Get env vars lazily to support testing
function getWalrusConfig(): { packageId: string; systemObject: string } {
  const packageId = process.env.NEXT_PUBLIC_WALRUS_PACKAGE_ID?.trim();
  const systemObject = process.env.NEXT_PUBLIC_WALRUS_SYSTEM_OBJECT?.trim();

  if (!packageId) {
    throw new Error('NEXT_PUBLIC_WALRUS_PACKAGE_ID is not configured');
  }
  if (!systemObject) {
    throw new Error('NEXT_PUBLIC_WALRUS_SYSTEM_OBJECT is not configured');
  }

  return { packageId, systemObject };
}

export interface RegisterBlobParams {
  blobId: string;
  size: number;
  encodingType?: string;
  storageId?: string;
  deletable?: boolean;
  rootHash?: string;
  walCoinId?: string; // WAL coin for write payment (optional - will fetch if not provided)
  sponsorAddress?: string; // If walCoinId not provided, fetch from this address
  suiClient?: SuiClient; // Required if sponsorAddress is provided
}

/**
 * Convert encoding type string to u8
 * Walrus uses encoding schemes like "RS2" which map to specific u8 values
 */
function encodingTypeToU8(encodingType: string | undefined): number {
  if (!encodingType) {
    console.warn('[Walrus] No encoding type provided, defaulting to 0');
    return 0;
  }

  const typeMap: Record<string, number> = {
    'RS2': 0,
    'RS4': 1,
    'RS8': 2,
  };

  const value = typeMap[encodingType];
  if (value === undefined) {
    console.warn(`[Walrus] Unknown encoding type: ${encodingType}, defaulting to 0`);
    return 0;
  }

  return value;
}

/**
 * Convert a base64url string to a BigInt
 * Walrus blob IDs are base64url encoded, but the Move contract expects a u256
 */
function base64UrlToBigInt(base64Url: string): bigint {
  // 1. Convert base64url to base64
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding if needed
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }

  // 2. Decode base64 to binary string
  const binary = atob(base64);

  // 3. Convert binary to hex
  let hex = '0x';
  for (let i = 0; i < binary.length; i++) {
    const byte = binary.charCodeAt(i).toString(16).padStart(2, '0');
    hex += byte;
  }

  // 4. Convert hex to BigInt
  return BigInt(hex);
}

/**
 * Build a Walrus registerBlob transaction for on-chain blob registration
 *
 * This version handles coin fetching automatically if needed.
 * Use this when you don't have a pre-fetched coin object ID.
 */
export async function buildRegisterBlobTransactionAsync(params: RegisterBlobParams): Promise<Transaction> {
  let resolvedWalCoinId = params.walCoinId;

  // If no coin ID provided, fetch one from the sponsor address
  if (!resolvedWalCoinId && params.sponsorAddress && params.suiClient) {
    console.log('[Walrus] Fetching WAL coin for sponsor:', params.sponsorAddress);
    const walCoinType = `${process.env.NEXT_PUBLIC_WAL_TOKEN_PACKAGE}::wal::WAL`;

    try {
      const coinsResult = await collectCoinsForAmount(
        params.suiClient,
        params.sponsorAddress,
        walCoinType,
        1n // Minimum 1 unit needed
      );

      if (coinsResult.coins.length === 0) {
        throw new Error(
          'No WAL coins found in sponsor wallet. Please ensure you have WAL tokens to pay for blob storage.'
        );
      }

      resolvedWalCoinId = coinsResult.coins[0].coinObjectId;
      console.log('[Walrus] Found WAL coin:', resolvedWalCoinId);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch WAL coins';
      throw new Error(`[Walrus] Could not obtain WAL payment coin: ${errorMsg}`);
    }
  }

  if (!resolvedWalCoinId) {
    throw new Error(
      '[Walrus] WAL coin ID not provided and unable to fetch. ' +
      'Either provide walCoinId or provide sponsorAddress with suiClient.'
    );
  }

  return buildRegisterBlobTransaction({ ...params, walCoinId: resolvedWalCoinId });
}

/**
 * Build a Walrus registerBlob transaction for on-chain blob registration
 * This is the synchronous version - use buildRegisterBlobTransactionAsync if you need coin fetching.
 *
 * Requires a WAL coin to be provided for the write_payment parameter.
 */
export function buildRegisterBlobTransaction(params: RegisterBlobParams): Transaction {
  const { blobId, size, encodingType, storageId, deletable = true, rootHash, walCoinId } = params;
  const { packageId, systemObject } = getWalrusConfig();

  const tx = new Transaction();

  if (!walCoinId) {
    throw new Error(
      '[Walrus] WAL coin ID is required. ' +
      'Either provide walCoinId directly or use buildRegisterBlobTransactionAsync() to fetch it automatically.'
    );
  }

  console.log('[Walrus] Building registerBlob transaction:', {
    packageId,
    systemObject,
    blobId,
    size,
    encodingType,
    storageId,
    deletable,
    rootHash: rootHash ? '(provided)' : '(missing - using 0x0)',
  });

  // Convert the base64url blobId to a BigInt for the Move call
  const blobIdBigInt = base64UrlToBigInt(blobId);
  console.log('[Walrus] Converted blob ID to BigInt:', blobIdBigInt.toString());

  // Convert encoding type string to u8
  const encodingTypeU8 = encodingTypeToU8(encodingType);
  console.log('[Walrus] Encoding type u8:', encodingTypeU8);

  // Convert root hash to BigInt (default to blobId if not provided)
  let rootHashBigInt = blobIdBigInt;
  if (rootHash) {
    try {
      rootHashBigInt = base64UrlToBigInt(rootHash);
      console.log('[Walrus] Converted root hash to BigInt:', rootHashBigInt.toString());
    } catch (err) {
      console.error('[Walrus] Failed to convert root hash:', err);
      throw new Error(`Invalid root hash format: ${rootHash}`);
    }
  } else {
    console.log('[Walrus] No root hash provided, using blobId as root hash.');
  }

  if (!storageId) {
    console.warn('[Walrus] No storage ID provided. Storage ID from HTTP response is required.');
  }

  // Call walrus::system::register_blob
  tx.moveCall({
    target: `${packageId}::system::register_blob`,
    arguments: [
      tx.object(systemObject), // self: &mut System
      storageId ? tx.object(storageId) : tx.object(systemObject), // storage: Storage (fallback to system object - this will likely fail)
      tx.pure.u256(blobIdBigInt), // blob_id: u256
      tx.pure.u256(rootHashBigInt), // root_hash: u256
      tx.pure.u64(size), // size: u64
      tx.pure.u8(encodingTypeU8), // encoding_type: u8
      tx.pure.bool(deletable), // deletable: bool
      tx.object(walCoinId), // write_payment: &mut Coin<WAL>
    ],
  });

  console.log('[Walrus] Transaction built successfully');
  return tx;
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
}

/**
 * Build a batch transaction to register both blobs and submit to marketplace
 */
export async function buildBatchRegisterAndSubmitTransactionAsync(params: BatchRegisterAndSubmitParams): Promise<Transaction> {
  let resolvedWalCoinId = params.walCoinId;

  // If no coin ID provided, fetch one from the sponsor address
  if (!resolvedWalCoinId && params.sponsorAddress && params.suiClient) {
    console.log('[Walrus] Fetching WAL coin for sponsor:', params.sponsorAddress);
    const walCoinType = `${process.env.NEXT_PUBLIC_WAL_TOKEN_PACKAGE}::wal::WAL`;

    try {
      const coinsResult = await collectCoinsForAmount(
        params.suiClient,
        params.sponsorAddress,
        walCoinType,
        1n // Minimum 1 unit needed
      );

      if (coinsResult.coins.length === 0) {
        throw new Error(
          'No WAL coins found in sponsor wallet. Please ensure you have WAL tokens to pay for blob storage.'
        );
      }

      resolvedWalCoinId = coinsResult.coins[0].coinObjectId;
      console.log('[Walrus] Found WAL coin:', resolvedWalCoinId);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch WAL coins';
      throw new Error(`[Walrus] Could not obtain WAL payment coin: ${errorMsg}`);
    }
  }

  if (!resolvedWalCoinId) {
    throw new Error(
      '[Walrus] WAL coin ID not provided and unable to fetch. ' +
      'Either provide walCoinId or provide sponsorAddress with suiClient.'
    );
  }

  return buildBatchRegisterAndSubmitTransaction({ ...params, walCoinId: resolvedWalCoinId });
}

export function buildBatchRegisterAndSubmitTransaction(params: BatchRegisterAndSubmitParams): Transaction {
  const { mainBlob, previewBlob, submission, walCoinId } = params;
  const { packageId, systemObject } = getWalrusConfig();
  const sonarPackageId = process.env.NEXT_PUBLIC_PACKAGE_ID;

  if (!sonarPackageId) {
    throw new Error('NEXT_PUBLIC_PACKAGE_ID is not defined');
  }
  if (!walCoinId) {
    throw new Error('WAL coin ID is required');
  }

  const tx = new Transaction();

  // Helper to prepare blob args
  const prepareBlobArgs = (blobParams: RegisterBlobParams) => {
    const blobIdBigInt = base64UrlToBigInt(blobParams.blobId);
    const encodingTypeU8 = encodingTypeToU8(blobParams.encodingType);
    let rootHashBigInt = blobIdBigInt;
    if (blobParams.rootHash) {
      try {
        rootHashBigInt = base64UrlToBigInt(blobParams.rootHash);
      } catch (err) {
        console.error('[Walrus] Failed to convert root hash:', err);
        throw new Error(`Invalid root hash format: ${blobParams.rootHash}`);
      }
    }

    if (!blobParams.storageId) {
      throw new Error(`Storage ID missing for blob ${blobParams.blobId}`);
    }

    return {
      storage: tx.object(blobParams.storageId),
      blobId: tx.pure.u256(blobIdBigInt),
      rootHash: tx.pure.u256(rootHashBigInt),
      size: tx.pure.u64(blobParams.size),
      encodingType: tx.pure.u8(encodingTypeU8),
      deletable: tx.pure.bool(blobParams.deletable ?? true),
      blobIdStr: tx.pure.string(blobParams.blobId)
    };
  };

  const mainArgs = prepareBlobArgs(mainBlob);
  const previewArgs = prepareBlobArgs(previewBlob);

  // Prepare submission args
  let previewHashBytes: Uint8Array = new Uint8Array();
  if (submission.previewBlobHash) {
    // Convert hex string to bytes
    const hex = submission.previewBlobHash.startsWith('0x') ? submission.previewBlobHash.slice(2) : submission.previewBlobHash;
    previewHashBytes = new Uint8Array(Buffer.from(hex, 'hex'));
  }

  // Handle SUI payment (0.25 SUI)
  let suiPaymentCoin;
  if (submission.suiPaymentCoinId && submission.suiPaymentCoinId !== 'GAS_COIN_PLACEHOLDER') {
    suiPaymentCoin = tx.object(submission.suiPaymentCoinId);
  } else {
    // Split from gas
    const [coin] = tx.splitCoins(tx.gas, [250_000_000]); // 0.25 SUI
    suiPaymentCoin = coin;
  }

  tx.moveCall({
    target: `${sonarPackageId}::blob_manager::batch_register_blobs`,
    arguments: [
      tx.object(systemObject),

      // Main Blob
      mainArgs.storage,
      mainArgs.blobId,
      mainArgs.rootHash,
      mainArgs.size,
      mainArgs.encodingType,
      mainArgs.deletable,
      mainArgs.blobIdStr,

      // Preview Blob
      previewArgs.storage,
      previewArgs.blobId,
      previewArgs.rootHash,
      previewArgs.size,
      previewArgs.encodingType,
      previewArgs.deletable,
      previewArgs.blobIdStr,

      // Metadata
      tx.pure.string(submission.sealPolicyId),
      tx.pure(previewHashBytes),
      tx.pure.u64(submission.durationSeconds),

      // Payments
      tx.object(walCoinId),
      suiPaymentCoin,
    ],
  });

  return tx;
}
