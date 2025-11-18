import type { Transaction } from '@mysten/sui/transactions';
import type { EphemeralSubWallet } from '@/hooks/useSubWalletOrchestrator';
import { buildRegisterBlobTransaction } from './buildRegisterBlobTransaction';

const WALRUS_PUBLISHER_URL =
  process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL || 'https://publisher.walrus-mainnet.walrus.space';

export interface WalrusHttpUploadResult {
  blobId: string;
  certifiedEpoch?: number;
  size: number;
  encodingType?: string;
  storageId?: string;
  deletable?: boolean;
}

/**
 * Upload blob to Walrus via HTTP and get blobId
 * The HTTP publisher handles encoding and storage node distribution
 */
export async function uploadBlobToPublisher(
  blob: Blob,
  epochs: number = 26
): Promise<WalrusHttpUploadResult> {
  const url = `${WALRUS_PUBLISHER_URL}/v1/blobs?epochs=${epochs}`;

  const response = await fetch(url, {
    method: 'PUT',
    body: blob,
    headers: {
      'Content-Type': 'application/octet-stream',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Walrus publisher upload failed: ${errorText}`);
  }

  const result = await response.json();

  let blobId: string;
  let certifiedEpoch: number | undefined;
  let encodingType: string | undefined;
  let storageId: string | undefined;
  let deletable: boolean | undefined;

  if (result.newlyCreated) {
    const blobObj = result.newlyCreated.blobObject;
    blobId = blobObj.blobId;
    certifiedEpoch = blobObj.certifiedEpoch;
    encodingType = blobObj.encodingType;
    storageId = blobObj.storage?.id;
    deletable = blobObj.deletable;
  } else if (result.alreadyCertified) {
    blobId = result.alreadyCertified.blobId;
    certifiedEpoch = result.alreadyCertified.certifiedEpoch;
  } else {
    throw new Error('Unexpected Walrus response format');
  }

  return {
    blobId,
    certifiedEpoch,
    size: blob.size,
    encodingType,
    storageId,
    deletable,
  };
}

/**
 * Build a registerBlob transaction for a sub-wallet
 * This transaction will be sponsored by the browser wallet
 */
export function buildSponsoredRegisterBlob(
  subWallet: EphemeralSubWallet,
  uploadResult: WalrusHttpUploadResult
): Transaction {
  return buildRegisterBlobTransaction({
    blobId: uploadResult.blobId,
    size: uploadResult.size,
    encodingType: uploadResult.encodingType,
    storageId: uploadResult.storageId,
    deletable: uploadResult.deletable ?? true,
  });
}
