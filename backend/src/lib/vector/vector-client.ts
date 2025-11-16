/**
 * Vector Database Client
 * Wrapper around Qdrant for semantic search operations
 */

import { logger } from '../logger';

interface VectorMetadata {
  session_id: string;
  dataset_id?: string;
  title: string;
  tags?: string[];
  languages?: string[];
  created_at: string;
  [key: string]: any;
}

interface SearchResult {
  vector_id: string;
  similarity_score: number;
  metadata: VectorMetadata;
}

export class VectorClient {
  private baseUrl: string;
  private collectionName: string;
  private maxRetries = 3;
  private initialBackoffMs = 100;

  constructor() {
    this.baseUrl = process.env.QDRANT_URL || 'http://localhost:6333';
    this.collectionName = process.env.QDRANT_COLLECTION || 'sonar-audio-datasets';

    if (!this.baseUrl || this.baseUrl === 'http://localhost:6333') {
      logger.warn('QDRANT_URL not set, vector search will use localhost');
    }
  }

  /**
   * Retry logic with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    attempt: number = 0
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (attempt < this.maxRetries) {
        const backoffMs = this.initialBackoffMs * Math.pow(2, attempt);
        logger.warn(
          { error, attempt, backoffMs },
          'Query failed, retrying with backoff'
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        return this.retryWithBackoff(fn, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Query vectors by similarity with retry logic
   */
  async queryVectors(
    queryVector: number[],
    topK: number = 10,
    threshold: number = 0.7
  ): Promise<SearchResult[]> {
    if (!this.baseUrl) {
      logger.error('Vector search unavailable: QDRANT_URL not set');
      return [];
    }

    return this.retryWithBackoff(async () => {
      const response = await fetch(
        `${this.baseUrl}/collections/${this.collectionName}/points/search`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            vector: queryVector,
            limit: topK,
            score_threshold: threshold,
            with_payload: true,
            with_vectors: false,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Qdrant API error: ${response.statusText}`);
      }

      const data = await response.json();
      const results: SearchResult[] = [];

      for (const result of data.result || []) {
        results.push({
          vector_id: result.id,
          similarity_score: result.score,
          metadata: result.payload || {},
        });
      }

      return results;
    }).catch((error) => {
      logger.error({ error }, 'Failed to query vectors after retries');
      return [];
    });
  }

  /**
   * Get collection statistics
   */
  async getIndexStats(): Promise<any> {
    if (!this.baseUrl) {
      return null;
    }

    return this.retryWithBackoff(async () => {
      const response = await fetch(
        `${this.baseUrl}/collections/${this.collectionName}`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Qdrant API error: ${response.statusText}`);
      }

      return await response.json();
    }).catch((error) => {
      logger.error({ error }, 'Failed to get collection stats');
      return null;
    });
  }

  /**
   * Check if Qdrant is available
   */
  isAvailable(): boolean {
    return !!this.baseUrl;
  }
}

export const vectorClient = new VectorClient();
