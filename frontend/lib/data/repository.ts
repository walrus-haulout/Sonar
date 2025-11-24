import type { Dataset, ProtocolStats, DatasetFilter, PaginatedResponse } from '@/types/blockchain';
import type { LeaderboardResponse, UserRankInfo, LeaderboardFilter } from '@/types/leaderboard';

/**
 * Repository interface for data access
 * Abstracts data source (seed data vs. blockchain)
 * Allows seamless switching via environment variable
 */
export interface DataRepository {
  /**
   * Get all datasets with optional filtering
   */
  getDatasets(filter?: DatasetFilter): Promise<Dataset[]>;

  /**
   * Get a single dataset by ID
   */
  getDataset(id: string): Promise<Dataset>;

  /**
   * Get protocol statistics (tier, supply, rates)
   */
  getStats(): Promise<ProtocolStats>;

  /**
   * Get datasets with pagination
   */
  getDatasetsPaginated(
    filter?: DatasetFilter,
    cursor?: string
  ): Promise<PaginatedResponse<Dataset>>;

  /**
   * Get global leaderboard with optional filtering
   */
  getLeaderboard(filter?: LeaderboardFilter): Promise<LeaderboardResponse>;

  /**
   * Get user's ranking and tier progress
   */
  getUserRank(walletAddress: string): Promise<UserRankInfo | null>;

  /**
   * Search leaderboard by username or wallet
   */
  searchLeaderboard(query: string, limit?: number): Promise<any[]>;
}

/**
 * Parser helpers for transforming raw data to typed objects
 * Maps AudioSubmission contract fields to Dataset interface
 */
export function parseDataset(raw: any): Dataset {
  // Handle both AudioSubmission contract fields and seed data
  const creator = raw.uploader || raw.creator;
  const price = raw.dataset_price !== undefined ? BigInt(raw.dataset_price) : BigInt(raw.price || 0);
  const listed = raw.listed_for_sale !== undefined ? Boolean(raw.listed_for_sale) : Boolean(raw.listed);
  const totalPurchases = raw.purchase_count !== undefined ? Number(raw.purchase_count) : Number(raw.total_purchases || 0);
  const createdAt = raw.submitted_at_epoch !== undefined ? Number(raw.submitted_at_epoch) : Number(raw.created_at || 0);

  // Status: 0=pending, 1=approved, 2=rejected
  const verified = raw.status !== undefined ? raw.status === 1 : Boolean(raw.verified);

  return {
    id: (typeof raw.id === 'string' ? raw.id : raw.id?.id) || raw.address,
    creator,
    quality_score: Number(raw.quality_score || 0),
    price,
    listed,
    duration_seconds: Number(raw.duration_seconds || 0),
    languages: raw.languages || [],
    formats: raw.formats || ['mp3'],
    media_type: raw.media_type || 'audio',
    created_at: createdAt,
    title: raw.title || `Audio Dataset #${String((typeof raw.id === 'string' ? raw.id : raw.id?.id) || '').slice(0, 8)}`,
    description: raw.description || 'On-chain audio dataset with SEAL encryption',
    total_purchases: totalPurchases,
    sample_count: raw.sample_count ? Number(raw.sample_count) : 1,
    storage_size: raw.storage_size ? Number(raw.storage_size) : 0,
    verified,
    updated_at: raw.updated_at ? Number(raw.updated_at) : createdAt,
    previewUrl: raw.previewUrl, // Direct preview URL when available
    preview_blob_id: raw.preview_blob_id,
    walrus_blob_id: raw.walrus_blob_id,
    blob_id: raw.blob_id,
    seal_policy_id: raw.seal_policy_id,
    mime_type: raw.mime_type || raw.original_mime_type || 'audio/mpeg',
    preview_mime_type: raw.preview_mime_type ?? raw.mime_type ?? null,
  };
}

export function parseProtocolStats(raw: any): ProtocolStats {
  return {
    circulating_supply: BigInt(raw.circulating_supply),
    current_tier: raw.current_tier as 1 | 2 | 3 | 4,
    burn_rate: Number(raw.burn_rate),
    liquidity_rate: Number(raw.liquidity_rate),
    uploader_rate: Number(raw.uploader_rate),
    initial_supply: raw.initial_supply ? BigInt(raw.initial_supply) : BigInt(0),
    total_burned: raw.total_burned ? BigInt(raw.total_burned) : BigInt(0),
    total_datasets: raw.total_datasets ? Number(raw.total_datasets) : 0,
    total_purchases: raw.total_purchases ? Number(raw.total_purchases) : 0,
    active_creators: raw.active_creators ? Number(raw.active_creators) : 0,
    total_volume: raw.total_volume ? BigInt(raw.total_volume) : BigInt(0),
  };
}
