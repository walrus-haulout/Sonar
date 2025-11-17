import type { Transaction } from '@mysten/sui/transactions';
import type { EphemeralSubWallet } from '@/hooks/useSubWalletOrchestrator';
import { buildRegisterBlobTransaction } from './buildRegisterBlobTransaction';

const WALRUS_PUBLISHER_URL =
  process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL || 'https://publisher.walrus-mainnet.walrus.space';

export interface WalrusHttpUploadResult {
  blobId: string;
  certifiedEpoch?: number;
  size: number;
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

  if (result.newlyCreated) {
    blobId = result.newlyCreated.blobObject.blobId;
    certifiedEpoch = result.newlyCreated.blobObject.certifiedEpoch;
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
  };
}

/**
 * Build a registerBlob transaction for a sub-wallet
 * This transaction will be sponsored by the browser wallet
 */
export function buildSponsoredRegisterBlob(
  subWallet: EphemeralSubWallet,
  blobId: string,
  size: number,
  epochs: number = 26
): Transaction {
  return buildRegisterBlobTransaction({
    blobId,
    size,
    epochs,
    deletable: true,
    ownerAddress: subWallet.address,
  });
}
