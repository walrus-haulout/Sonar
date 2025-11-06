/**
 * SONAR Protocol TypeScript Type Definitions
 * These types match the Move contract structures
 */

// Media types supported by the platform
export type MediaType = 'audio' | 'video';

// Audio/video format types
export type Format = 'mp3' | 'wav' | 'm4a' | 'ogg' | 'mp4' | 'webm';

// Voting statistics for community curation
export interface VotingStats {
  upvotes: bigint;
  downvotes: bigint;
  voters: string[];  // Array of voter addresses
  net_score: bigint;  // upvotes - downvotes
}

// Dataset object (client-facing, NO blob IDs exposed)
export interface Dataset {
  id: string;  // Can be database ID (e.g., Freesound) or on-chain Sui object ID (0x...)
  creator: string;
  quality_score: number;
  price: bigint;
  listed: boolean;
  duration_seconds: number;
  sample_count: number;
  storage_size: number;
  verified: boolean;
  languages: string[];
  formats: Format[];
  media_type: MediaType;
  created_at: number;
  updated_at: number;
  title: string;
  description: string;
  total_purchases?: number;
  previewUrl?: string; // Optional direct preview URL (e.g., from Freesound)
  voting_stats?: VotingStats;  // Optional voting data for testnet submissions
  bundled_clips?: Dataset[];  // Optional array of clips for bundle datasets
}

// Server-side only type (includes blob IDs for backend API routes)
export interface DatasetWithBlobs extends Dataset {
  preview_blob_id: string;
  blob_id: string;
}

// Protocol statistics (economic tier data)
export interface ProtocolStats {
  circulating_supply: bigint;
  initial_supply: bigint;
  total_burned: bigint;
  current_tier: 1 | 2 | 3 | 4;
  burn_rate: number;
  liquidity_rate: number;
  uploader_rate: number;
  total_datasets: number;
  total_purchases: number;
  active_creators: number;
  total_volume: bigint;
}

// Tier configuration (matches contract tiers)
export interface TierConfig {
  name: string;
  burn: number;
  liquidity: number;
  uploader: number;
  threshold: bigint;
}

// Purchase breakdown for UI display
export interface PurchaseBreakdown {
  total_price: bigint;
  burn_amount: bigint;
  liquidity_amount: bigint;
  uploader_amount: bigint;
  treasury_amount: bigint;
}

// Events emitted by the contract
export interface DatasetPurchasedEvent {
  dataset_id: string;
  buyer: string;
  price: string;
  tier: number;
}

export interface DatasetSubmittedEvent {
  dataset_id: string;
  creator: string;
  quality_score: number;
}

export interface DatasetListedEvent {
  dataset_id: string;
  price: string;
}

// Access grant response from backend API
// Matches @sonar/shared AccessGrant from packages/shared/src/types/walrus.ts
export interface AccessGrant {
  seal_policy_id: string;
  download_url: string;
  blob_id: string;
  expires_at: number;
}

// Filter options for marketplace
export interface DatasetFilter {
  media_type?: MediaType;
  languages?: string[];
  formats?: Format[];
  min_quality?: number;
  max_price?: bigint;
  creator?: string;
}

// Pagination response
export interface PaginatedResponse<T> {
  data: T[];
  cursor?: string;
  hasMore: boolean;
}

// Transaction result
export interface TransactionResult {
  digest: string;
  success: boolean;
  error?: string;
}

// User balance info
export interface UserBalance {
  total: bigint;
  coins: Array<{
    id: string;
    balance: bigint;
  }>;
}

// Vesting schedule (for future implementation)
export interface VestingSchedule {
  total_amount: bigint;
  vested_amount: bigint;
  release_time: number;
}
