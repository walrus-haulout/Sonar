import { Transaction } from '@mysten/sui/transactions';

const WALRUS_PACKAGE_ID = process.env.NEXT_PUBLIC_WALRUS_PACKAGE_ID!;
const WALRUS_SYSTEM_OBJECT = process.env.NEXT_PUBLIC_WALRUS_SYSTEM_OBJECT!;

export interface RegisterBlobParams {
  blobId: string;
  size: number;
  epochs: number;
  deletable?: boolean;
  ownerAddress: string;
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
 */
export function buildRegisterBlobTransaction(params: RegisterBlobParams): Transaction {
  const { blobId, size, epochs, deletable = true, ownerAddress } = params;

  const tx = new Transaction();

  // Convert the base64url blobId to a BigInt for the Move call
  const blobIdBigInt = base64UrlToBigInt(blobId);

  // Call walrus::blob::register_blob
  tx.moveCall({
    target: `${WALRUS_PACKAGE_ID}::blob::register_blob`,
    arguments: [
      tx.object(WALRUS_SYSTEM_OBJECT), // &System object
      tx.pure.u256(blobIdBigInt), // blob_id
      tx.pure.u64(size), // size
      tx.pure.u32(epochs), // epochs
      tx.pure.bool(deletable), // deletable
      tx.pure.address(ownerAddress), // owner
    ],
  });

  return tx;
}
