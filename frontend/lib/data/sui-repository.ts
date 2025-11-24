import type { Dataset, ProtocolStats, DatasetFilter, PaginatedResponse } from '@/types/blockchain';
import type { LeaderboardResponse, UserRankInfo, LeaderboardFilter, LeaderboardEntry } from '@/types/leaderboard';
import { DataRepository, parseDataset, parseProtocolStats } from './repository';
import { suiClient, graphqlClients, DATASET_TYPE, STATS_OBJECT_ID } from '@/lib/sui/client';
import { GET_DATASETS, GET_DATASET, GET_PROTOCOL_STATS } from '@/lib/sui/queries';
import { logger } from '@/lib/logger';
import { toastInfo, toastError } from '@/lib/toast';
import { graphqlCircuitBreaker } from '@/lib/sui/circuit-breaker';

/**
 * Retry Configuration
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 8000, // 8 seconds max
  jitterFactor: 0.2, // ±20% randomization
};

/**
 * Add jitter to delay to prevent thundering herd problem
 *
 * @param delay - Base delay in milliseconds
 * @param jitterFactor - Percentage of randomization (0.2 = ±20%)
 * @returns Delay with jitter applied
 */
function addJitter(delay: number, jitterFactor: number = RETRY_CONFIG.jitterFactor): number {
  const jitter = delay * jitterFactor * (Math.random() * 2 - 1); // Random value between -jitterFactor and +jitterFactor
  return Math.round(delay + jitter);
}

/**
 * Calculate exponential backoff delay with jitter and ceiling
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param baseDelay - Base delay in milliseconds
 * @param maxDelay - Maximum delay cap
 * @returns Delay with exponential backoff, jitter, and ceiling applied
 */
function getBackoffDelay(attempt: number, baseDelay: number = RETRY_CONFIG.baseDelay, maxDelay: number = RETRY_CONFIG.maxDelay): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  return addJitter(cappedDelay);
}

/**
 * Enhanced retry utility with exponential backoff, jitter, and user notifications
 *
 * @param fn - Function to retry
 * @param maxRetries - Maximum number of retry attempts
 * @param showUserFeedback - Whether to show toast notifications
 * @param context - Context string for logging (e.g., endpoint name)
 * @returns Result of the function
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = RETRY_CONFIG.maxRetries,
  showUserFeedback: boolean = false,
  context?: string
): Promise<T> {
  let lastError: Error | undefined;
  let showedSlowWarning = false;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries - 1) {
        const delay = getBackoffDelay(attempt);
        logger.retry(attempt + 1, maxRetries, delay, lastError.message);

        // Show toast after first retry (connection seems slow)
        if (showUserFeedback && attempt === 0 && !showedSlowWarning) {
          const contextMsg = context ? ` (${context})` : '';
          toastInfo('Connection slow, retrying...', `Attempting to reconnect${contextMsg}`);
          showedSlowWarning = true;
        }

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Sui Blockchain Repository
 *
 * Queries real on-chain data with multi-endpoint GraphQL resilience:
 * - Primary: Beta GraphQL endpoint (graphql.{network}.sui.io)
 * - Secondary: Legacy GraphQL endpoint (sui-{network}.mystenlabs.com)
 * - Automatic fallback with circuit breaker pattern
 * - RPC used only for single-object reads (getDataset, getStats)
 *
 * Why No RPC Fallback for List Queries:
 * The suix_queryObjects RPC method does not exist on public Sui RPC nodes
 * (verified 2025-01-05, returns -32601 "Method not found" error).
 * Alternative RPC methods like suix_getOwnedObjects require an owner address
 * and cannot query all objects by type alone.
 *
 * The multi-endpoint GraphQL strategy with circuit breaker provides
 * sufficient resilience for list queries without needing RPC fallback.
 */
export class SuiRepository implements DataRepository {
  /**
   * Get all datasets with optional filtering
   * Uses multi-endpoint GraphQL with automatic fallback
   *
   * @param filter - Optional filter criteria
   * @returns Array of datasets
   */
  async getDatasets(filter?: DatasetFilter): Promise<Dataset[]> {
    return this.queryWithMultiEndpoint(
      (client) => this.getDatasetsViaGraphQL(client, filter),
      'getDatasetsViaGraphQL'
    );
  }

  /**
   * Get a single dataset by ID
   * Uses RPC for reliable single-object reads
   *
   * @param id - Dataset object ID
   * @returns Dataset object
   */
  async getDataset(id: string): Promise<Dataset> {
    // Always use RPC for critical single-object reads (more reliable)
    const obj = await suiClient.getObject({
      id,
      options: { showContent: true },
    });

    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
      throw new Error(`Dataset not found: ${id}`);
    }

    return parseDataset({
      id: obj.data.objectId,
      ...obj.data.content.fields,
    });
  }

  /**
   * Get protocol statistics
   * Uses RPC for reliable single-object reads
   * Queries QualityMarketplace object which contains all stats
   *
   * @returns Protocol statistics object
   */
  async getStats(): Promise<ProtocolStats> {
    // Use marketplace object for stats (it contains all economic data)
    const { CHAIN_CONFIG } = await import('@/lib/sui/client');

    if (!CHAIN_CONFIG.marketplaceId) {
      throw new Error('Marketplace ID is not configured.');
    }

    const obj = await suiClient.getObject({
      id: CHAIN_CONFIG.marketplaceId,
      options: { showContent: true },
    });

    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
      throw new Error('Marketplace not found');
    }

    return parseProtocolStats(obj.data.content.fields);
  }

  /**
   * Get paginated datasets with cursor-based pagination
   * Uses multi-endpoint GraphQL with automatic fallback
   *
   * Note: Pagination requires GraphQL - cursors are not supported via RPC
   * If all GraphQL endpoints fail, this method will throw an error
   *
   * @param filter - Optional filter criteria
   * @param cursor - Pagination cursor from previous response
   * @returns Paginated response with datasets and cursor
   */
  async getDatasetsPaginated(
    filter?: DatasetFilter,
    cursor?: string
  ): Promise<PaginatedResponse<Dataset>> {
    return this.queryWithMultiEndpoint(
      (client) => this.getDatasetsPaginatedViaGraphQL(client, filter, cursor),
      'getDatasetsPaginatedViaGraphQL'
    );
  }

  /**
   * Query GraphQL with multi-endpoint fallback and circuit breaker
   *
   * Iterates through available GraphQL endpoints:
   * 1. Check circuit breaker state (skip OPEN circuits)
   * 2. Attempt query with retry logic
   * 3. Record success/failure for circuit breaker
   * 4. Fallback to next endpoint on failure
   *
   * @param queryFn - Function that executes the GraphQL query
   * @param operationName - Operation name for logging and user feedback
   * @returns Query result
   * @throws Error if all endpoints fail
   */
  private async queryWithMultiEndpoint<T>(
    queryFn: (client: typeof graphqlClients[0]['client']) => Promise<T>,
    operationName: string
  ): Promise<T> {
    const errors: Array<{ endpoint: string; error: Error }> = [];
    let showedUserFeedback = false;

    // Log endpoint configuration for debugging
    logger.debug(`Starting ${operationName} with ${graphqlClients.length} configured GraphQL endpoints`, {
      endpoints: graphqlClients
        .filter(item => item && item.endpoint)
        .map(item => ({ name: item?.endpoint?.name ?? 'unknown', url: item?.endpoint?.url ?? 'unknown' })),
    });

    // Try each GraphQL endpoint in priority order
    for (const item of graphqlClients) {
      // Validate endpoint configuration exists
      if (!item || !item.client || !item.endpoint) {
        logger.warn('Skipping invalid GraphQL client configuration', {
          operation: operationName,
          hasItem: !!item,
          hasClient: !!item?.client,
          hasEndpoint: !!item?.endpoint,
        });
        continue;
      }

      const { client, endpoint } = item;

      // Check circuit breaker - skip if OPEN
      if (!graphqlCircuitBreaker.canAttempt(endpoint.name)) {
        logger.warn(`Skipping ${endpoint.name} endpoint (circuit OPEN)`, {
          url: endpoint.url,
          operation: operationName,
        });
        continue;
      }

      try {
        // Attempt query with retry logic
        const result = await retryWithBackoff(
          () => queryFn(client),
          RETRY_CONFIG.maxRetries,
          !showedUserFeedback, // Only show feedback for first endpoint
          endpoint.name
        );

        // Success! Record for circuit breaker and return
        graphqlCircuitBreaker.recordSuccess(endpoint.name);

        // If we fell back to a secondary endpoint, notify user
        if (errors.length > 0 && !showedUserFeedback) {
          toastInfo(`Connected via ${endpoint.name} endpoint`, 'Using backup connection');
          showedUserFeedback = true;
        }

        logger.info(`GraphQL query succeeded via ${endpoint.name}`, {
          operation: operationName,
          url: endpoint.url,
          attemptedEndpoints: errors.length + 1,
        });

        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        // Record failure for circuit breaker
        graphqlCircuitBreaker.recordFailure(endpoint.name, err);

        // Log and store error
        errors.push({ endpoint: endpoint.name, error: err });
        logger.error(`GraphQL query failed via ${endpoint.name}`, err, {
          operation: operationName,
          url: endpoint.url,
        });

        // Continue to next endpoint
        continue;
      }
    }

    // All endpoints failed
    const errorMsg = `All GraphQL endpoints failed for ${operationName}`;
    const configuredEndpoints = graphqlClients
      .filter(item => item && item.endpoint)
      .map(item => ({ name: item?.endpoint?.name ?? 'unknown', url: item?.endpoint?.url ?? 'unknown' }));

    logger.error(errorMsg, undefined, {
      operation: operationName,
      totalConfiguredEndpoints: configuredEndpoints.length,
      attemptedEndpoints: errors.length,
      configuredEndpoints,
      errors: errors.map(e => ({ endpoint: e.endpoint, message: e.error.message })),
    });

    // Show user-friendly error
    toastError('Unable to load data', 'All connection endpoints failed. Please try again later.');

    // Throw combined error
    const combinedError = new Error(errorMsg);
    (combinedError as any).endpointErrors = errors;
    throw combinedError;
  }

  /**
   * Get datasets via GraphQL
   *
   * @param client - GraphQL client to use
   * @param filter - Optional filter criteria
   * @returns Array of datasets
   */
  private async getDatasetsViaGraphQL(
    client: typeof graphqlClients[0]['client'],
    filter?: DatasetFilter
  ): Promise<Dataset[]> {
    const response = await client.request(GET_DATASETS, {
      type: DATASET_TYPE,
      cursor: null,
    });

    const datasets = response.objects.nodes
      .filter((node: any) => node.asMoveObject?.contents?.json) // Null check on asMoveObject
      .map((node: any) => {
        const jsonData = node.asMoveObject.contents.json;
        const content = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
        return parseDataset({
          id: node.address,
          ...content,
        });
      });

    // Apply filters client-side (Move contracts don't support complex filters yet)
    return this.applyFilters(datasets, filter);
  }

  /**
   * Get paginated datasets via GraphQL
   *
   * @param client - GraphQL client to use
   * @param filter - Optional filter criteria
   * @param cursor - Pagination cursor from previous response
   * @returns Paginated response with datasets and cursor
   */
  private async getDatasetsPaginatedViaGraphQL(
    client: typeof graphqlClients[0]['client'],
    filter?: DatasetFilter,
    cursor?: string
  ): Promise<PaginatedResponse<Dataset>> {
    const response = await client.request(GET_DATASETS, {
      type: DATASET_TYPE,
      cursor: cursor || null,
    });

    const datasets = response.objects.nodes
      .filter((node: any) => node.asMoveObject?.contents?.json) // Null check on asMoveObject
      .map((node: any) => {
        const jsonData = node.asMoveObject.contents.json;
        const content = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
        return parseDataset({
          id: node.address,
          ...content,
        });
      });

    const filtered = this.applyFilters(datasets, filter);

    return {
      data: filtered,
      cursor: response.objects.pageInfo.endCursor,
      hasMore: response.objects.pageInfo.hasNextPage,
    };
  }

  /**
   * Apply client-side filters to dataset array
   *
   * Move contracts don't support complex query filters yet,
   * so we filter results client-side after fetching
   *
   * @param datasets - Array of datasets to filter
   * @param filter - Filter criteria
   * @returns Filtered array of datasets
   */
  private applyFilters(datasets: Dataset[], filter?: DatasetFilter): Dataset[] {
    // Filter out test datasets: unlisted AND price = 0
    let filtered = datasets.filter(d => {
      const isTestDataset = !d.listed && d.price === 0n;
      return !isTestDataset;
    });

    if (!filter) return filtered;

    if (filter.media_type) {
      filtered = filtered.filter(d => d.media_type === filter.media_type);
    }

    if (filter.languages && filter.languages.length > 0) {
      filtered = filtered.filter(d =>
        filter.languages!.some(lang => d.languages.includes(lang))
      );
    }

    if (filter.formats && filter.formats.length > 0) {
      filtered = filtered.filter(d =>
        filter.formats!.some(format => d.formats.includes(format))
      );
    }

    if (filter.min_quality !== undefined) {
      filtered = filtered.filter(d => d.quality_score >= filter.min_quality!);
    }

    if (filter.max_price !== undefined) {
      filtered = filtered.filter(d => d.price <= filter.max_price!);
    }

    if (filter.creator) {
      filtered = filtered.filter(d => d.creator === filter.creator);
    }

    return filtered;
  }

  /**
   * Get global leaderboard
   * Calls backend API for leaderboard data
   */
  async getLeaderboard(filter?: LeaderboardFilter): Promise<LeaderboardResponse> {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) {
      throw new Error('Backend URL not configured. Set NEXT_PUBLIC_BACKEND_URL environment variable.');
    }

    const params = new URLSearchParams();
    if (filter?.limit) params.append('limit', filter.limit.toString());
    if (filter?.offset) params.append('offset', filter.offset.toString());
    if (filter?.tier) params.append('tier', filter.tier);

    const response = await fetch(`${backendUrl}/api/leaderboard?${params}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch leaderboard: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get user's ranking and tier progress
   * Calls backend API for user-specific rank data
   */
  async getUserRank(walletAddress: string): Promise<UserRankInfo | null> {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) {
      throw new Error('Backend URL not configured. Set NEXT_PUBLIC_BACKEND_URL environment variable.');
    }

    const response = await fetch(`${backendUrl}/api/leaderboard/user/${walletAddress}`);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch user rank: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Search leaderboard by username or wallet address
   * Calls backend API for search results
   */
  async searchLeaderboard(query: string, limit: number = 20): Promise<LeaderboardEntry[]> {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) {
      throw new Error('Backend URL not configured. Set NEXT_PUBLIC_BACKEND_URL environment variable.');
    }

    const params = new URLSearchParams({
      q: query,
      limit: limit.toString(),
    });

    const response = await fetch(`${backendUrl}/api/leaderboard/search?${params}`);
    if (!response.ok) {
      throw new Error(`Failed to search leaderboard: ${response.statusText}`);
    }

    return response.json();
  }
}
