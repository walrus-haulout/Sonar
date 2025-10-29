import type { Dataset, ProtocolStats, DatasetFilter, PaginatedResponse } from '@/types/blockchain';

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
}

/**
 * Parser helpers for transforming raw data to typed objects
 */
export function parseDataset(raw: any): Dataset {
  return {
    id: raw.id || raw.address,
    creator: raw.creator,
    quality_score: Number(raw.quality_score),
    price: BigInt(raw.price),
    listed: Boolean(raw.listed),
    duration_seconds: Number(raw.duration_seconds),
    languages: raw.languages || [],
    formats: raw.formats || [],
    media_type: raw.media_type,
    created_at: Number(raw.created_at),
    title: raw.title || 'Untitled',
    description: raw.description || '',
    total_purchases: raw.total_purchases ? Number(raw.total_purchases) : 0,
    sample_count: raw.sample_count ? Number(raw.sample_count) : 0,
    storage_size: raw.storage_size ? Number(raw.storage_size) : 0,
    verified: Boolean(raw.verified),
    updated_at: raw.updated_at ? Number(raw.updated_at) : Number(raw.created_at),
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
