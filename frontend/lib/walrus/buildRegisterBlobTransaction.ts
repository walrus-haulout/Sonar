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
 * Build a Walrus registerBlob transaction for on-chain blob registration
 * This transaction will be used with sponsored execution pattern
 */
export function buildRegisterBlobTransaction(params: RegisterBlobParams): Transaction {
  const { blobId, size, epochs, deletable = true, ownerAddress } = params;

  const tx = new Transaction();

  // Call walrus::blob::register_blob
  tx.moveCall({
    target: `${WALRUS_PACKAGE_ID}::blob::register_blob`,
    arguments: [
      tx.object(WALRUS_SYSTEM_OBJECT), // &System object
      tx.pure.u256(blobId), // blob_id
      tx.pure.u64(size), // size
      tx.pure.u32(epochs), // epochs
      tx.pure.bool(deletable), // deletable
      tx.pure.address(ownerAddress), // owner
    ],
  });

  return tx;
}
