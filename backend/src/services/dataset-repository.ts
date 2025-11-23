/**
 * Dataset Repository with pgvector Semantic Search
 * 
 * Fast PostgreSQL queries with semantic similarity search.
 * Replaces direct blockchain queries for 10-100x performance improvement.
 */

import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../lib/db';
import { logger } from '../lib/logger';

export interface DatasetFilter {
  creator?: string;
  languages?: string[];
  minQualityScore?: number;
  maxPrice?: bigint;
  listed?: boolean;
  searchQuery?: string; // Semantic search
}

export interface SemanticSearchResult {
  id: string;
  title: string;
  description: string;
  creator: string;
  quality_score: number;
  price: bigint;
  languages: string[];
  similarity_score: number; // 0-1 (pgvector cosine similarity)
}

export class DatasetRepository {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || defaultPrisma;
  }

  /**
   * Get all datasets with optional filtering
   * Blazing fast compared to blockchain GraphQL queries
   */
  async getDatasets(filter?: DatasetFilter) {
    const where: any = {};

    if (filter?.creator) {
      where.creator = filter.creator;
    }

    if (filter?.languages && filter.languages.length > 0) {
      where.languages = { hasSome: filter.languages };
    }

    if (filter?.minQualityScore !== undefined) {
      where.quality_score = { gte: filter.minQualityScore };
    }

    if (filter?.maxPrice !== undefined) {
      where.price = { lte: filter.maxPrice };
    }

    if (filter?.listed !== undefined) {
      where.listed = filter.listed;
    }

    // Semantic search using pgvector
    if (filter?.searchQuery) {
      return this.semanticSearch(filter.searchQuery, {
        limit: 50,
        minSimilarity: 0.7,
        additionalFilters: where,
      });
    }

    return this.prisma.dataset.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        blobs: true,
      },
    });
  }

  /**
   * Semantic search using pgvector
   * Finds datasets similar to search query
   */
  async semanticSearch(
    query: string,
    options: {
      limit?: number;
      minSimilarity?: number;
      additionalFilters?: any;
    } = {}
  ): Promise<SemanticSearchResult[]> {
    const { limit = 20, minSimilarity = 0.7 } = options;

    try {
      // Generate embedding for search query
      const embedding = await this.generateEmbedding(query);
      if (!embedding) {
        logger.warn('Failed to generate embedding for search query');
        return [];
      }

      // Query using pgvector cosine similarity
      // 1 - (embedding <=> query_embedding) = cosine similarity (0-1)
      const results = await this.prisma.$queryRaw<SemanticSearchResult[]>`
        SELECT 
          id,
          title,
          description,
          creator,
          quality_score,
          price,
          languages,
          1 - (embedding <=> ${embedding}::vector) AS similarity_score
        FROM "Dataset"
        WHERE embedding IS NOT NULL
        AND (1 - (embedding <=> ${embedding}::vector)) > ${minSimilarity}
        ORDER BY similarity_score DESC
        LIMIT ${limit}
      `;

      logger.info({ query, results: results.length }, 'Semantic search complete');
      return results;
    } catch (error) {
      logger.error({ error, query }, 'Semantic search failed');
      return [];
    }
  }

  /**
   * Find similar datasets to a given dataset (recommendations)
   */
  async findSimilar(datasetId: string, limit: number = 10) {
    try {
      const results = await this.prisma.$queryRaw<SemanticSearchResult[]>`
        SELECT 
          d2.id,
          d2.title,
          d2.description,
          d2.creator,
          d2.quality_score,
          d2.price,
          d2.languages,
          1 - (d2.embedding <=> d1.embedding) AS similarity_score
        FROM "Dataset" d1
        CROSS JOIN "Dataset" d2
        WHERE d1.id = ${datasetId}
        AND d2.id != ${datasetId}
        AND d1.embedding IS NOT NULL
        AND d2.embedding IS NOT NULL
        AND (1 - (d2.embedding <=> d1.embedding)) > 0.7
        ORDER BY similarity_score DESC
        LIMIT ${limit}
      `;

      return results;
    } catch (error) {
      logger.error({ error, datasetId }, 'Find similar failed');
      return [];
    }
  }

  /**
   * Get a single dataset by ID
   */
  async getDataset(id: string) {
    return this.prisma.dataset.findUnique({
      where: { id },
      include: {
        blobs: true,
      },
    });
  }

  /**
   * Get paginated datasets
   */
  async getDatasetsPaginated(filter: DatasetFilter & { cursor?: string; limit?: number }) {
    const { cursor, limit = 20, ...whereFilter } = filter;

    const where: any = {};

    if (whereFilter.creator) {
      where.creator = whereFilter.creator;
    }

    if (whereFilter.languages && whereFilter.languages.length > 0) {
      where.languages = { hasSome: whereFilter.languages };
    }

    if (whereFilter.minQualityScore !== undefined) {
      where.quality_score = { gte: whereFilter.minQualityScore };
    }

    if (whereFilter.maxPrice !== undefined) {
      where.price = { lte: whereFilter.maxPrice };
    }

    if (whereFilter.listed !== undefined) {
      where.listed = whereFilter.listed;
    }

    const datasets = await this.prisma.dataset.findMany({
      where,
      take: limit + 1, // Fetch one extra to check if there are more
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { created_at: 'desc' },
      include: {
        blobs: true,
      },
    });

    const hasMore = datasets.length > limit;
    const items = hasMore ? datasets.slice(0, limit) : datasets;
    const nextCursor = hasMore ? items[items.length - 1].id : undefined;

    return {
      items,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Get repository stats
   */
  async getStats() {
    const total = await this.prisma.dataset.count();
    const indexed = await this.prisma.dataset.count({
      where: { indexed_at: { not: null } },
    });
    const listed = await this.prisma.dataset.count({
      where: { listed: true },
    });

    return {
      total,
      indexed,
      unindexed: total - indexed,
      listed,
      indexingRate: total > 0 ? (indexed / total) * 100 : 0,
    };
  }

  /**
   * Generate embedding using OpenRouter API
   * (Copied from blockchain-indexer, could be extracted to shared util)
   */
  private async generateEmbedding(text: string): Promise<number[] | null> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return null;
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://sonar-protocol.com',
          'X-Title': 'Sonar Marketplace Search',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: text,
        }),
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      logger.error({ error }, 'Failed to generate embedding');
      return null;
    }
  }
}
