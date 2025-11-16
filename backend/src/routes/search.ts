/**
 * Semantic Search API Routes
 * Handles text-based and hybrid semantic search for datasets
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/db';
import { logger } from '../lib/logger';
import { vectorClient } from '../lib/vector/vector-client';

/**
 * Generate embedding for text query
 * Note: In production, this should call a dedicated embedding service
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://sonar-protocol.com',
        'X-Title': 'Sonar Audio Search',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
      }),
    });

    if (!response.ok) {
      logger.error({ status: response.status }, 'Embedding API error');
      return null;
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    logger.error({ error }, 'Failed to generate embedding');
    return null;
  }
}

/**
 * POST /api/search/semantic
 * Search for similar datasets using text query
 */
async function semanticSearch(
  request: FastifyRequest<{
    Body: {
      query: string;
      limit?: number;
      threshold?: number;
    };
  }>,
  reply: FastifyReply
) {
  const { query, limit = 10, threshold = 0.7 } = request.body;

  if (!query || query.trim().length === 0) {
    return reply.code(400).send({
      error: 'INVALID_INPUT',
      message: 'Query text is required',
    });
  }

  if (!vectorClient.isAvailable()) {
    return reply.code(503).send({
      error: 'SERVICE_UNAVAILABLE',
      message: 'Vector search service is not available',
    });
  }

  try {
    // Generate embedding for query
    const embedding = await generateEmbedding(query);
    if (!embedding) {
      return reply.code(500).send({
        error: 'EMBEDDING_FAILED',
        message: 'Failed to generate embedding for query',
      });
    }

    // Query Pinecone
    const results = await vectorClient.queryVectors(embedding, limit, threshold);

    // Fetch full dataset details for results
    const datasetIds = results
      .map((r) => r.metadata?.dataset_id)
      .filter((id) => id);

    let datasets: any[] = [];
    if (datasetIds.length > 0) {
      datasets = await prisma.dataset.findMany({
        where: {
          id: { in: datasetIds },
        },
        select: {
          id: true,
          title: true,
          description: true,
          creator: true,
          quality_score: true,
          price: true,
          languages: true,
          formats: true,
          created_at: true,
          total_purchases: true,
        },
      });
    }

    // Merge results with dataset details
    const enrichedResults = results.map((result) => {
      const dataset = datasets.find((d) => d.id === result.metadata?.dataset_id);
      return {
        similarity_score: result.similarity_score,
        dataset: dataset || null,
        metadata: result.metadata,
      };
    });

    return reply.send({
      query,
      results: enrichedResults,
      count: enrichedResults.length,
    });
  } catch (error) {
    logger.error({ error }, 'Semantic search failed');
    return reply.code(500).send({
      error: 'SEARCH_FAILED',
      message: 'Failed to perform semantic search',
    });
  }
}

/**
 * POST /api/search/hybrid
 * Combined keyword + semantic search
 */
async function hybridSearch(
  request: FastifyRequest<{
    Body: {
      query: string;
      keywords?: string[];
      tags?: string[];
      languages?: string[];
      limit?: number;
      threshold?: number;
    };
  }>,
  reply: FastifyReply
) {
  const {
    query,
    tags = [],
    languages = [],
    limit = 10,
    threshold = 0.7,
  } = request.body;

  if (!query || query.trim().length === 0) {
    return reply.code(400).send({
      error: 'INVALID_INPUT',
      message: 'Query text is required',
    });
  }

  try {
    // Step 1: Semantic search
    const embedding = await generateEmbedding(query);
    if (!embedding) {
      return reply.code(500).send({
        error: 'EMBEDDING_FAILED',
        message: 'Failed to generate embedding',
      });
    }

    const semanticResults = await vectorClient.queryVectors(
      embedding,
      limit * 2,
      threshold
    );

    // Step 2: Keyword search
    const datasetIds = semanticResults
      .map((r) => r.metadata?.dataset_id)
      .filter((id) => id);

    const keywordQuery: any = {};
    if (datasetIds.length > 0) {
      keywordQuery.id = { in: datasetIds };
    }
    if (tags.length > 0) {
      // Tags are stored as array, check for overlap
    }
    if (languages.length > 0) {
      keywordQuery.languages = { hasSome: languages };
    }

    const keywordResults = await prisma.dataset.findMany({
      where: keywordQuery,
      select: {
        id: true,
        title: true,
        description: true,
        creator: true,
        quality_score: true,
        price: true,
        languages: true,
        formats: true,
        created_at: true,
        total_purchases: true,
      },
      take: limit,
    });

    // Step 3: Merge and rank results
    const resultMap = new Map<string, any>();

    for (const result of semanticResults) {
      const datasetId = result.metadata?.dataset_id;
      if (datasetId && !resultMap.has(datasetId)) {
        const dataset = keywordResults.find((d: typeof keywordResults[0]) => d.id === datasetId);
        resultMap.set(datasetId, {
          similarity_score: result.similarity_score,
          dataset,
          metadata: result.metadata,
          score: result.similarity_score,
        });
      }
    }

    // Bonus for keyword matches
    for (const dataset of keywordResults) {
      const entry = resultMap.get(dataset.id);
      if (entry) {
        let bonus = 0;
        if (dataset.title.toLowerCase().includes(query.toLowerCase())) {
          bonus += 0.1;
        }
        if (dataset.description?.toLowerCase().includes(query.toLowerCase())) {
          bonus += 0.05;
        }
        entry.score = Math.min(1, entry.score + bonus);
      } else {
        resultMap.set(dataset.id, {
          similarity_score: 0,
          dataset,
          metadata: {},
          score: 0.3, // Lower score for keyword-only matches
        });
      }
    }

    // Sort by combined score
    const results = Array.from(resultMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return reply.send({
      query,
      filters: { tags, languages },
      results,
      count: results.length,
    });
  } catch (error) {
    logger.error({ error }, 'Hybrid search failed');
    return reply.code(500).send({
      error: 'SEARCH_FAILED',
      message: 'Failed to perform hybrid search',
    });
  }
}

/**
 * GET /api/datasets/:id/similar
 * Find datasets similar to a specific dataset
 */
async function findSimilarDatasets(
  request: FastifyRequest<{
    Params: { id: string };
    Querystring: {
      limit?: string;
      threshold?: string;
    };
  }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const limit = parseInt(request.query.limit || '10', 10);
  const threshold = parseFloat(request.query.threshold || '0.7');

  try {
    // Find the dataset
    const dataset = await prisma.dataset.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        languages: true,
      },
    });

    if (!dataset) {
      return reply.code(404).send({
        error: 'NOT_FOUND',
        message: 'Dataset not found',
      });
    }

    // Generate embedding for this dataset
    const text = `${dataset.title} ${dataset.description || ''}`.trim();
    const embedding = await generateEmbedding(text);
    if (!embedding) {
      return reply.code(500).send({
        error: 'EMBEDDING_FAILED',
        message: 'Failed to generate embedding',
      });
    }

    // Query for similar vectors
    const results = await vectorClient.queryVectors(embedding, limit, threshold);

    // Fetch full dataset details
    const datasetIds = results
      .map((r) => r.metadata?.dataset_id)
      .filter((id) => id && id !== dataset.id);

    let similarDatasets: any[] = [];
    if (datasetIds.length > 0) {
      similarDatasets = await prisma.dataset.findMany({
        where: { id: { in: datasetIds } },
        select: {
          id: true,
          title: true,
          description: true,
          creator: true,
          quality_score: true,
          price: true,
          languages: true,
          created_at: true,
          total_purchases: true,
        },
      });
    }

    const enrichedResults = results
      .filter((r) => r.metadata?.dataset_id !== dataset.id)
      .map((result) => {
        const similarDataset = similarDatasets.find(
          (d) => d.id === result.metadata?.dataset_id
        );
        return {
          similarity_score: result.similarity_score,
          dataset: similarDataset,
        };
      })
      .slice(0, limit);

    return reply.send({
      dataset_id: id,
      dataset: {
        title: dataset.title,
        description: dataset.description,
      },
      similar_datasets: enrichedResults,
      count: enrichedResults.length,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to find similar datasets');
    return reply.code(500).send({
      error: 'SEARCH_FAILED',
      message: 'Failed to find similar datasets',
    });
  }
}

export async function registerSearchRoutes(fastify: FastifyInstance) {
  // Semantic search endpoint
  fastify.post<{ Body: { query: string; limit?: number; threshold?: number } }>(
    '/api/search/semantic',
    {
      schema: {
        body: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string' },
            limit: { type: 'number', default: 10 },
            threshold: { type: 'number', default: 0.7 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              results: { type: 'array' },
              count: { type: 'number' },
            },
          },
        },
      },
    },
    semanticSearch
  );

  // Hybrid search endpoint
  fastify.post<{
    Body: {
      query: string;
      keywords?: string[];
      tags?: string[];
      languages?: string[];
      limit?: number;
      threshold?: number;
    };
  }>(
    '/api/search/hybrid',
    {
      schema: {
        body: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string' },
            keywords: { type: 'array', items: { type: 'string' } },
            tags: { type: 'array', items: { type: 'string' } },
            languages: { type: 'array', items: { type: 'string' } },
            limit: { type: 'number', default: 10 },
            threshold: { type: 'number', default: 0.7 },
          },
        },
      },
    },
    hybridSearch
  );

  // Similar datasets endpoint
  fastify.get<{
    Params: { id: string };
    Querystring: { limit?: string; threshold?: string };
  }>(
    '/api/datasets/:id/similar',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'string' },
            threshold: { type: 'string' },
          },
        },
      },
    },
    findSimilarDatasets
  );

  logger.info('Search routes registered');
}
