/**
 * Redis Caching Layer for Vector Search and Embeddings
 * Improves performance by caching query results and embeddings
 */

import { logger } from '../logger';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl_seconds: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hit_rate: number;
}

export class RedisCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private hits = 0;
  private misses = 0;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Don't start cleanup in constructor
  }

  /**
   * Start cleanup interval
   */
  start(): void {
    if (this.cleanupInterval) {
      logger.warn('Cleanup interval already started');
      return;
    }
    this.startCleanupInterval();
  }

  /**
   * Stop cleanup interval
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('Cache cleanup interval stopped');
    }
  }

  /**
   * Get cached value by key
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check if expired
    const age = (Date.now() - entry.timestamp) / 1000;
    if (age > entry.ttl_seconds) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.data as T;
  }

  /**
   * Set cache value with TTL
   */
  set<T>(key: string, value: T, ttl_seconds: number = 3600): void {
    this.cache.set(key, {
      data: value,
      timestamp: Date.now(),
      ttl_seconds,
    });

    // Basic eviction - remove oldest entry if cache gets too large
    if (this.cache.size > 10000) {
      const oldestKey = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      )[0][0];
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Cache query results with dataset context
   */
  cacheQueryResults<T>(
    query: string,
    results: T[],
    ttl_seconds: number = 3600
  ): void {
    const key = this.getQueryKey(query);
    this.set(key, results, ttl_seconds);
    logger.debug(`Cached query results: ${key}`);
  }

  /**
   * Get cached query results
   */
  getQueryResults<T>(query: string): T[] | null {
    const key = this.getQueryKey(query);
    return this.get<T[]>(key);
  }

  /**
   * Cache embedding vector
   */
  cacheEmbedding(
    text: string,
    embedding: number[],
    ttl_seconds: number = 86400
  ): void {
    const key = this.getEmbeddingKey(text);
    this.set(key, embedding, ttl_seconds);
  }

  /**
   * Get cached embedding
   */
  getEmbedding(text: string): number[] | null {
    const key = this.getEmbeddingKey(text);
    return this.get<number[]>(key);
  }

  /**
   * Cache dataset metadata
   */
  cacheDataset(
    dataset_id: string,
    data: any,
    ttl_seconds: number = 3600
  ): void {
    const key = this.getDatasetKey(dataset_id);
    this.set(key, data, ttl_seconds);
  }

  /**
   * Get cached dataset
   */
  getDataset(dataset_id: string): any | null {
    const key = this.getDatasetKey(dataset_id);
    return this.get(key);
  }

  /**
   * Invalidate query cache
   */
  invalidateQuery(query: string): void {
    const key = this.getQueryKey(query);
    this.cache.delete(key);
    logger.debug(`Invalidated query cache: ${key}`);
  }

  /**
   * Invalidate dataset cache
   */
  invalidateDataset(dataset_id: string): void {
    const key = this.getDatasetKey(dataset_id);
    this.cache.delete(key);
    logger.debug(`Invalidated dataset cache: ${dataset_id}`);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    logger.info('Cleared all cache entries');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      hit_rate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      const age = (now - entry.timestamp) / 1000;
      if (age > entry.ttl_seconds) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug(`Cleanup: removed ${removed} expired entries`);
    }
  }

  /**
   * Start cleanup interval (call after instance is ready)
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 10 * 60 * 1000); // Every 10 minutes
    logger.info('Cache cleanup interval started');
  }

  private getQueryKey(query: string): string {
    return `query:${Buffer.from(query).toString('base64')}`;
  }

  private getEmbeddingKey(text: string): string {
    return `embedding:${Buffer.from(text).toString('base64')}`;
  }

  private getDatasetKey(dataset_id: string): string {
    return `dataset:${dataset_id}`;
  }
}

export const redisCache = new RedisCache();
