/**
 * uploadWithSponsorship
 *
 * DEPRECATED: This file is kept for backward compatibility but all exports are deprecated.
 * The Blockberry HTTP API flow via edge routes has replaced sponsored transaction patterns.
 */

// Deprecated - no longer used
export interface WalrusHttpUploadResult {
  blobId: string;
  certifiedEpoch?: number;
  size: number;
  encodingType?: string;
  storageId?: string;
  deletable?: boolean;
}
