/**
 * Dataset API Routes (PostgreSQL-backed)
 * 
 * Fast marketplace queries using pgvector semantic search.
 * Replaces slow blockchain GraphQL queries.
 * 
 * Endpoints:
 * - GET /api/datasets - List all datasets (with filters)
 * - GET /api/datasets/:id - Get single dataset
 * - GET /api/datasets/:id/similar - Find similar datasets
 * - GET /api/datasets/search - Semantic search
 * - GET /api/datasets/stats - Repository statistics
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DatasetRepository } from '../services/dataset-repository';

const repository = new DatasetRepository();

export async function registerDatasetRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/datasets
   * List datasets with optional filtering
   */
  fastify.get<{
    Querystring: {
      creator?: string;
      languages?: string;
      minQualityScore?: string;
      maxPrice?: string;
      listed?: string;
      cursor?: string;
      limit?: string;
    };
  }>('/api/datasets', async (request, reply) => {
    try {
      const { creator, languages, minQualityScore, maxPrice, listed, cursor, limit } =
        request.query;

      const filter: any = {};

      if (creator) filter.creator = creator;
      if (languages) filter.languages = languages.split(',');
      if (minQualityScore) filter.minQualityScore = parseInt(minQualityScore);
      if (maxPrice) filter.maxPrice = BigInt(maxPrice);
      if (listed !== undefined) filter.listed = listed === 'true';

      // Paginated query
      if (cursor !== undefined || limit !== undefined) {
        filter.cursor = cursor;
        filter.limit = limit ? parseInt(limit) : 20;

        const result = await repository.getDatasetsPaginated(filter);
        return reply.send(result);
      }

      // Non-paginated query
      const datasets = await repository.getDatasets(filter);
      return reply.send({ datasets });
    } catch (error) {
      request.log.error({ error }, 'Failed to fetch datasets');
      return reply.code(500).send({
        error: 'FETCH_FAILED',
        message: 'Failed to fetch datasets',
      });
    }
  });

  /**
   * GET /api/datasets/search
   * Semantic search using pgvector
   */
  fastify.get<{
    Querystring: {
      q: string;
      limit?: string;
      minSimilarity?: string;
    };
  }>('/api/datasets/search', async (request, reply) => {
    try {
      const { q, limit, minSimilarity } = request.query;

      if (!q || q.trim().length === 0) {
        return reply.code(400).send({
          error: 'INVALID_QUERY',
          message: 'Search query is required',
        });
      }

      const results = await repository.semanticSearch(q, {
        limit: limit ? parseInt(limit) : 20,
        minSimilarity: minSimilarity ? parseFloat(minSimilarity) : 0.7,
      });

      return reply.send({ query: q, results });
    } catch (error) {
      request.log.error({ error }, 'Semantic search failed');
      return reply.code(500).send({
        error: 'SEARCH_FAILED',
        message: 'Semantic search failed',
      });
    }
  });

  /**
   * GET /api/datasets/:id
   * Get single dataset
   */
  fastify.get<{
    Params: { id: string };
  }>('/api/datasets/:id', async (request, reply) => {
    try {
      const { id } = request.params;

      const dataset = await repository.getDataset(id);

      if (!dataset) {
        return reply.code(404).send({
          error: 'NOT_FOUND',
          message: 'Dataset not found',
        });
      }

      return reply.send({ dataset });
    } catch (error) {
      request.log.error({ error }, 'Failed to fetch dataset');
      return reply.code(500).send({
        error: 'FETCH_FAILED',
        message: 'Failed to fetch dataset',
      });
    }
  });

  /**
   * GET /api/datasets/:id/similar
   * Find similar datasets using pgvector
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { limit?: string };
  }>('/api/datasets/:id/similar', async (request, reply) => {
    try {
      const { id } = request.params;
      const { limit } = request.query;

      const similar = await repository.findSimilar(id, limit ? parseInt(limit) : 10);

      return reply.send({
        dataset_id: id,
        similar,
        count: similar.length,
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to find similar datasets');
      return reply.code(500).send({
        error: 'SEARCH_FAILED',
        message: 'Failed to find similar datasets',
      });
    }
  });

  /**
   * GET /api/datasets/stats
   * Get repository statistics
   */
  fastify.get('/api/datasets/stats', async (request, reply) => {
    try {
      const stats = await repository.getStats();
      return reply.send(stats);
    } catch (error) {
      request.log.error({ error }, 'Failed to get stats');
      return reply.code(500).send({
        error: 'STATS_FAILED',
        message: 'Failed to get statistics',
      });
    }
  });

  fastify.log.info('Dataset routes registered (PostgreSQL-backed)');
}
