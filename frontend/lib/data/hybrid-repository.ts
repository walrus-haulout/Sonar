/**
 * Hybrid Repository
 *
 * Combines blockchain data (source of truth for audio/metadata) with
 * backend database (transcript, AI analysis, tags).
 *
 * Architecture:
 * - Audio data: Blockchain/Walrus (immutable, decentralized)
 * - Display metadata (title, price, quality): Blockchain (source of truth)
 * - Transcript & AI analysis: Backend PostgreSQL (fast queries, searchable)
 */

import type { Dataset, ProtocolStats, DatasetFilter, PaginatedResponse } from '@/types/blockchain';
import type { LeaderboardResponse, UserRankInfo, LeaderboardFilter, LeaderboardEntry } from '@/types/leaderboard';
import { DataRepository } from './repository';
import { SuiRepository } from './sui-repository';
import { logger } from '@/lib/logger';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL;

/**
 * Hybrid Repository Implementation
 *
 * Primary data source: Sui blockchain (for core dataset data)
 * Secondary enrichment: Backend API (for transcript, analysis, tags)
 */
export class HybridRepository implements DataRepository {
  private suiRepository: SuiRepository;

  constructor() {
    this.suiRepository = new SuiRepository();
  }

  /**
   * Get all datasets from blockchain
   * Marketplace list doesn't need transcript (detail page only)
   */
  async getDatasets(filter?: DatasetFilter): Promise<Dataset[]> {
    // Use blockchain for list - no transcript needed for marketplace cards
    return this.suiRepository.getDatasets(filter);
  }

  /**
   * Get a single dataset by ID
   * Fetches from blockchain, then enriches with backend metadata (transcript, analysis)
   */
  async getDataset(id: string): Promise<Dataset> {
    // 1. Get core data from blockchain (source of truth)
    const blockchainDataset = await this.suiRepository.getDataset(id);

    // 2. Enrich with backend metadata (transcript, analysis, tags)
    const enrichedDataset = await this.enrichWithBackendMetadata(blockchainDataset);

    return enrichedDataset;
  }

  /**
   * Enrich blockchain dataset with backend metadata
   * Adds transcript, analysis, tags from PostgreSQL
   */
  private async enrichWithBackendMetadata(dataset: Dataset): Promise<Dataset> {
    if (!BACKEND_URL) {
      logger.debug('NEXT_PUBLIC_BACKEND_URL not configured, skipping backend enrichment');
      return dataset;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/datasets/${dataset.id}`);

      if (!response.ok) {
        // Backend might not have this dataset yet (newly created)
        if (response.status === 404) {
          logger.debug(`Dataset ${dataset.id} not in backend yet, using blockchain data only`);
          return dataset;
        }
        throw new Error(`Backend API error: ${response.status}`);
      }

      const data = await response.json();
      const backendData = data.dataset;

      // Merge: blockchain is base, backend enriches with metadata and AI analysis
      const enriched: Dataset = {
        ...dataset,
        // Override blockchain defaults with backend data when available
        title: backendData?.title || dataset.title,
        description: backendData?.description || dataset.description,
        // Use AI quality score if blockchain has default 0
        quality_score: dataset.quality_score === 0 && backendData?.analysis?.qualityScore
          ? Math.round(backendData.analysis.qualityScore * 10)
          : dataset.quality_score,
        // Use suggested price if blockchain has 0
        price: dataset.price === BigInt(0) && backendData?.analysis?.suggestedPrice
          ? BigInt(Math.floor(backendData.analysis.suggestedPrice * 1_000_000))
          : dataset.price,
        // Backend enrichment (transcript, analysis, tags)
        transcript: backendData?.transcript || undefined,
        transcript_length: backendData?.transcript_length || undefined,
        analysis: backendData?.analysis ? {
          qualityScore: backendData.analysis.qualityScore,
          suggestedPrice: backendData.analysis.suggestedPrice,
          safetyPassed: backendData.analysis.safetyPassed,
          overallSummary: backendData.analysis.overallSummary,
          insights: backendData.analysis.insights,
          concerns: backendData.analysis.concerns,
          priceAnalysis: backendData.analysis.priceAnalysis,
        } : undefined,
        tags: backendData?.tags || [],
      };

      logger.info(`Enriched dataset ${dataset.id} with backend metadata (transcript: ${!!enriched.transcript}, analysis: ${!!enriched.analysis})`);

      return enriched;
    } catch (error) {
      logger.warn(`Failed to enrich dataset ${dataset.id} with backend metadata: ${error}`);
      return dataset;
    }
  }

  /**
   * Get protocol statistics
   * Always uses blockchain (stats are on-chain)
   */
  async getStats(): Promise<ProtocolStats> {
    return this.suiRepository.getStats();
  }

  /**
   * Get paginated datasets with cursor-based pagination
   * Uses blockchain for list data
   */
  async getDatasetsPaginated(
    filter?: DatasetFilter,
    cursor?: string
  ): Promise<PaginatedResponse<Dataset>> {
    return this.suiRepository.getDatasetsPaginated(filter, cursor);
  }

  /**
   * Get global leaderboard
   */
  async getLeaderboard(filter?: LeaderboardFilter): Promise<LeaderboardResponse> {
    return this.suiRepository.getLeaderboard(filter);
  }

  /**
   * Get user's ranking and tier progress
   */
  async getUserRank(walletAddress: string): Promise<UserRankInfo | null> {
    return this.suiRepository.getUserRank(walletAddress);
  }

  /**
   * Search leaderboard by username or wallet address
   */
  async searchLeaderboard(query: string, limit?: number): Promise<LeaderboardEntry[]> {
    return this.suiRepository.searchLeaderboard(query, limit);
  }
}
