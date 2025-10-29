/**
 * Walrus storage integration types
 */

/**
 * Access grant returned by backend after purchase verification
 */
export interface AccessGrant {
  seal_policy_id: string;
  download_url: string;
  blob_id: string;
  expires_at: number;
}

/**
 * Blob metadata from Walrus
 */
export interface BlobMetadata {
  blob_id: string;
  size: number;
  encoding: 'Blob' | 'Encoded';
  certified: boolean;
}

/**
 * Streaming options for Walrus blob download
 */
export interface StreamOptions {
  blobId: string;
  range?: {
    start: number;
    end?: number;
  };
}

/**
 * Download progress tracking
 */
export interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  percentage: number;
  speedMBps: number;
  estimatedTimeRemaining: number; // in seconds
}

/**
 * Error types from Walrus
 */
export interface WalrusError {
  code: string;
  message: string;
  details?: unknown;
}
