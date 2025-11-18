import { Transaction } from '@mysten/sui/transactions';

// Get env vars lazily to support testing
function getWalrusConfig() {
  const packageId = process.env.NEXT_PUBLIC_WALRUS_PACKAGE_ID?.trim();
  const systemObject = process.env.NEXT_PUBLIC_WALRUS_SYSTEM_OBJECT?.trim();

  if (!packageId) {
    console.error('Missing NEXT_PUBLIC_WALRUS_PACKAGE_ID');
  }
  if (!systemObject) {
    console.error('Missing NEXT_PUBLIC_WALRUS_SYSTEM_OBJECT');
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
  walCoinId: string; // WAL coin for write payment
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
 * This transaction will be used with sponsored execution pattern
 *
 * Requires a WAL coin to be provided for the write_payment parameter.
 */
export function buildRegisterBlobTransaction(params: RegisterBlobParams): Transaction {
  const { blobId, size, encodingType, storageId, deletable = true, rootHash, walCoinId } = params;
  const { packageId, systemObject } = getWalrusConfig();

  const tx = new Transaction();

  if (!packageId) {
    throw new Error('WALRUS_PACKAGE_ID is not defined');
  }
  if (!systemObject) {
    throw new Error('WALRUS_SYSTEM_OBJECT is not defined');
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
