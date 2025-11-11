/**
 * Dataset types shared between frontend and backend
 */

export type Format = 'mp3' | 'wav' | 'm4a' | 'ogg' | 'mp4' | 'webm';
export type MediaType = 'audio' | 'video' | 'text';

/**
 * Client-facing dataset type (no blob IDs)
 * Used for marketplace display and dataset detail pages
 */
export interface Dataset {
  id: string;
  creator: string;
  quality_score: number;
  price: bigint;
  listed: boolean;
  duration_seconds: number;
  languages: string[];
  formats: Format[];
  media_type: MediaType;
  created_at: number;
  title: string;
  description: string;
  total_purchases?: number;
}

/**
 * Server-side only type with blob IDs
 * NEVER send to client
 */
export interface DatasetWithBlobs extends Dataset {
  preview_blob_id: string;
  full_blob_id: string;
}

/**
 * Database model for storing blob mappings
 */
export interface DatasetBlobMapping {
  id: string;
  dataset_id: string;
  preview_blob_id: string;
  full_blob_id: string;
  mime_type: string;
  preview_mime_type?: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Purchase record
 */
export interface Purchase {
  id: string;
  user_address: string;
  dataset_id: string;
  price: bigint;
  tx_digest: string;
  timestamp: Date;
}

/**
 * Access log for audit trail
 */
export interface AccessLog {
  id: string;
  user_address: string;
  dataset_id: string;
  action: 'ACCESS_GRANTED' | 'STREAM_STARTED' | 'DOWNLOAD_COMPLETED' | 'ACCESS_DENIED';
  ip_address?: string;
  user_agent?: string;
  timestamp: Date;
}
