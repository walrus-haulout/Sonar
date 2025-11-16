/**
 * Vector Analytics API Routes
 * Provides insights into search patterns, clustering, and vector data analytics
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/db';
import { logger } from '../lib/logger';

interface SearchAnalytics {
  total_searches: number;
  avg_results_per_search: number;
  popular_queries: Array<{ query: string; count: number }>;
  avg_similarity_threshold: number;
  search_timestamp_distribution: Record<string, number>;
}

interface DatasetAnalytics {
  total_datasets: number;
  datasets_with_embeddings: number;
  embedding_coverage: number;
  languages: Record<string, number>;
  quality_score_distribution: Record<string, number>;
  average_quality_score: number;
}

interface VectorAnalytics {
  index_stats: Record<string, any>;
  total_vector_count: number;
  dimension: number;
  namespaces: Record<string, any>;
}

/**
 * GET /api/analytics/search
 * Get search analytics and patterns
 */
async function getSearchAnalytics(
  _request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    // In production, this would query actual search logs
    const analytics: SearchAnalytics = {
      total_searches: 0,
      avg_results_per_search: 0,
      popular_queries: [],
      avg_similarity_threshold: 0.7,
      search_timestamp_distribution: {},
    };

    return reply.send({
      timestamp: new Date().toISOString(),
      analytics,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get search analytics');
    return reply.code(500).send({
      error: 'ANALYTICS_FAILED',
      message: 'Failed to compute search analytics',
    });
  }
}

/**
 * GET /api/analytics/datasets
 * Get dataset analytics
 */
async function getDatasetAnalytics(
  _request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const totalDatasets = await prisma.dataset.count();

    // Count datasets with embeddings (would need to track this)
    // For now, estimate based on completed verifications

    const analytics: DatasetAnalytics = {
      total_datasets: totalDatasets,
      datasets_with_embeddings: 0,
      embedding_coverage: 0,
      languages: {},
      quality_score_distribution: {},
      average_quality_score: 0,
    };

    // Fetch language distribution
    const allDatasets = await prisma.dataset.findMany({
      select: { languages: true, quality_score: true },
    });

    const languageMap: Record<string, number> = {};
    let totalQuality = 0;
    let qualityBucket: Record<string, number> = {
      '0-20': 0,
      '21-40': 0,
      '41-60': 0,
      '61-80': 0,
      '81-100': 0,
    };

    for (const dataset of allDatasets) {
      for (const lang of dataset.languages || []) {
        languageMap[lang] = (languageMap[lang] || 0) + 1;
      }
      totalQuality += dataset.quality_score;

      const score = dataset.quality_score;
      if (score <= 20) qualityBucket['0-20']++;
      else if (score <= 40) qualityBucket['21-40']++;
      else if (score <= 60) qualityBucket['41-60']++;
      else if (score <= 80) qualityBucket['61-80']++;
      else qualityBucket['81-100']++;
    }

    analytics.languages = languageMap;
    analytics.quality_score_distribution = qualityBucket;
    analytics.average_quality_score =
      allDatasets.length > 0 ? totalQuality / allDatasets.length : 0;

    return reply.send({
      timestamp: new Date().toISOString(),
      analytics,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get dataset analytics');
    return reply.code(500).send({
      error: 'ANALYTICS_FAILED',
      message: 'Failed to compute dataset analytics',
    });
  }
}

/**
 * GET /api/analytics/vectors
 * Get vector database analytics
 */
async function getVectorAnalytics(
  _request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const analytics: VectorAnalytics = {
      index_stats: {},
      total_vector_count: 0,
      dimension: 1536,
      namespaces: {
        default: { vector_count: 0 },
        'audio-features': { vector_count: 0 },
      },
    };

    // In production, this would fetch from Pinecone
    // For now, estimate from database

    return reply.send({
      timestamp: new Date().toISOString(),
      analytics,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get vector analytics');
    return reply.code(500).send({
      error: 'ANALYTICS_FAILED',
      message: 'Failed to compute vector analytics',
    });
  }
}

/**
 * GET /api/analytics/trending
 * Get trending datasets and topics
 */
async function getTrendingAnalytics(
  request: FastifyRequest<{
    Querystring: { days?: string };
  }>,
  reply: FastifyReply
) {
  try {
    const days = parseInt(request.query.days || '7', 10);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Get recently created datasets (proxy for trending)
    const trendingDatasets = await prisma.dataset.findMany({
      where: {
        created_at: { gte: cutoffDate },
      },
      select: {
        id: true,
        title: true,
        creator: true,
        total_purchases: true,
        quality_score: true,
        created_at: true,
      },
      orderBy: { total_purchases: 'desc' },
      take: 10,
    });

    return reply.send({
      timestamp: new Date().toISOString(),
      period_days: days,
      trending_datasets: trendingDatasets,
      count: trendingDatasets.length,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get trending analytics');
    return reply.code(500).send({
      error: 'ANALYTICS_FAILED',
      message: 'Failed to compute trending analytics',
    });
  }
}

/**
 * GET /api/analytics/summary
 * Get overall analytics summary
 */
async function getAnalyticsSummary(
  _request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const [
      totalDatasets,
      totalCreators,
      totalPurchases,
      avgQualityScore,
    ] = await Promise.all([
      prisma.dataset.count(),
      prisma.dataset.findMany({
        select: { creator: true },
        distinct: ['creator'],
      }),
      prisma.purchase.count(),
      prisma.dataset.aggregate({
        _avg: { quality_score: true },
      }),
    ]);

    const creatorsCount = totalCreators.length || 1;
    const datasetsCount = totalDatasets || 1;

    return reply.send({
      timestamp: new Date().toISOString(),
      summary: {
        total_datasets: totalDatasets,
        total_creators: totalCreators.length,
        total_purchases: totalPurchases,
        average_quality_score: avgQualityScore._avg.quality_score || 0,
        marketplace_health: {
          datasets_per_creator: (totalDatasets / creatorsCount).toFixed(2),
          purchases_per_dataset: (totalPurchases / datasetsCount).toFixed(2),
        },
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get analytics summary');
    return reply.code(500).send({
      error: 'ANALYTICS_FAILED',
      message: 'Failed to compute analytics summary',
    });
  }
}

export async function registerAnalyticsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { days?: string } }>(
    '/api/analytics/search',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              timestamp: { type: 'string' },
              analytics: { type: 'object' },
            },
          },
        },
      },
    },
    getSearchAnalytics
  );

  fastify.get(
    '/api/analytics/datasets',
    {},
    getDatasetAnalytics
  );

  fastify.get(
    '/api/analytics/vectors',
    {},
    getVectorAnalytics
  );

  fastify.get<{ Querystring: { days?: string } }>(
    '/api/analytics/trending',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            days: { type: 'string' },
          },
        },
      },
    },
    getTrendingAnalytics
  );

  fastify.get(
    '/api/analytics/summary',
    {},
    getAnalyticsSummary
  );

  logger.info('Analytics routes registered');
}
