/**
 * Blockchain Dataset Indexer
 * 
 * Syncs AudioSubmission objects from Sui blockchain to PostgreSQL for fast queries.
 * Generates embeddings for semantic search using pgvector.
 * 
 * Architecture:
 * 1. Poll blockchain for new AudioSubmission objects
 * 2. Upsert to Dataset table
 * 3. Generate embeddings from title + description
 * 4. Store in PostgreSQL (pgvector)
 * 
 * Usage:
 * - Run as cron job: `node dist/services/blockchain-indexer.js sync`
 * - Backfill: `node dist/services/blockchain-indexer.js backfill --limit 100`
 */

import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../lib/db';
import { suiClient, SONAR_PACKAGE_ID } from '../lib/sui/client';
import { logger } from '../lib/logger';

interface BlockchainDataset {
  id: string;
  creator: string;
  quality_score: number;
  price: string;
  listed: boolean;
  duration_seconds: number;
  languages: string[];
  formats: string[];
  media_type: string;
  title: string;
  description: string;
  total_purchases: number;
  file_count?: number;
  total_duration?: number;
  bundle_discount_bps?: number;
}

export class BlockchainIndexer {
  private prisma: PrismaClient;
  private openrouterApiKey: string;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || defaultPrisma;
    this.openrouterApiKey = process.env.OPENROUTER_API_KEY || '';
    
    if (!this.openrouterApiKey) {
      logger.warn('OPENROUTER_API_KEY not set. Embedding generation will be skipped.');
    }
  }

  /**
   * Generate text embedding using OpenRouter API
   */
  private async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.openrouterApiKey) {
      return null;
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.openrouterApiKey}`,
          'HTTP-Referer': 'https://sonar-protocol.com',
          'X-Title': 'Sonar Marketplace Indexer',
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
   * Fetch all datasets from blockchain via type-based query
   * 
   * Strategy: Query all AudioSubmission and DatasetSubmission objects by StructType,
   * regardless of owner. AudioSubmission/DatasetSubmission objects are owned by the
   * uploader's wallet (via transfer::transfer), so we can't use getOwnedObjects with
   * a fixed owner address.
   */
  private async fetchDatasetsFromBlockchain(cursor?: string): Promise<{
    datasets: BlockchainDataset[];
    hasMore: boolean;
    nextCursor?: string;
  }> {
    try {
      if (!SONAR_PACKAGE_ID) {
        logger.error('SONAR_PACKAGE_ID not configured');
        return { datasets: [], hasMore: false };
      }

      const datasets: BlockchainDataset[] = [];

      // Query AudioSubmission objects (single-file submissions)
      const audioSubmissionsResponse = await suiClient.queryObjects({
        filter: {
          StructType: `${SONAR_PACKAGE_ID}::marketplace::AudioSubmission`,
        },
        options: {
          showContent: true,
          showType: true,
          showOwner: true,
        },
        cursor,
        limit: 25,
      });

      logger.info({ 
        count: audioSubmissionsResponse.data.length,
        hasNextPage: audioSubmissionsResponse.hasNextPage,
      }, 'Fetched AudioSubmission objects');

      // Process AudioSubmission objects
      for (const obj of audioSubmissionsResponse.data) {
        try {
          if (obj.data?.content?.dataType === 'moveObject') {
            const fields = obj.data.content.fields as any;
            
            datasets.push({
              id: obj.data.objectId,
              creator: fields.uploader,
              quality_score: parseInt(fields.quality_score || '0'),
              price: fields.dataset_price || '0',
              listed: fields.listed_for_sale !== false,
              duration_seconds: parseInt(fields.duration_seconds || '0'),
              languages: [], // Metadata comes from backend API
              formats: ['audio/mpeg'],
              media_type: 'audio',
              title: 'Untitled Dataset',
              description: '',
              total_purchases: parseInt(fields.purchase_count || '0'),
              file_count: 1,
              total_duration: parseInt(fields.duration_seconds || '0'),
              bundle_discount_bps: 0,
            });
          }
        } catch (error) {
          logger.warn({ error, objectId: obj.data?.objectId }, 'Failed to process AudioSubmission');
        }
      }

      // Query DatasetSubmission objects (multi-file datasets)
      const datasetSubmissionsResponse = await suiClient.queryObjects({
        filter: {
          StructType: `${SONAR_PACKAGE_ID}::marketplace::DatasetSubmission`,
        },
        options: {
          showContent: true,
          showType: true,
          showOwner: true,
        },
        cursor,
        limit: 25,
      });

      logger.info({ 
        count: datasetSubmissionsResponse.data.length,
        hasNextPage: datasetSubmissionsResponse.hasNextPage,
      }, 'Fetched DatasetSubmission objects');

      // Process DatasetSubmission objects
      for (const obj of datasetSubmissionsResponse.data) {
        try {
          if (obj.data?.content?.dataType === 'moveObject') {
            const fields = obj.data.content.fields as any;
            
            datasets.push({
              id: obj.data.objectId,
              creator: fields.uploader,
              quality_score: parseInt(fields.quality_score || '0'),
              price: fields.dataset_price || '0',
              listed: fields.listed_for_sale !== false,
              duration_seconds: parseInt(fields.total_duration || '0'),
              languages: [],
              formats: ['audio/mpeg'],
              media_type: 'audio',
              title: 'Untitled Dataset',
              description: '',
              total_purchases: parseInt(fields.purchase_count || '0'),
              file_count: parseInt(fields.file_count || '1'),
              total_duration: parseInt(fields.total_duration || '0'),
              bundle_discount_bps: parseInt(fields.bundle_discount_bps || '0'),
            });
          }
        } catch (error) {
          logger.warn({ error, objectId: obj.data?.objectId }, 'Failed to process DatasetSubmission');
        }
      }

      logger.info({ total: datasets.length }, 'Total datasets fetched from blockchain');

      return {
        datasets,
        hasMore: audioSubmissionsResponse.hasNextPage || datasetSubmissionsResponse.hasNextPage,
        nextCursor: audioSubmissionsResponse.nextCursor || datasetSubmissionsResponse.nextCursor,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to fetch datasets from blockchain');
      return { datasets: [], hasMore: false };
    }
  }

  /**
   * Sync a single dataset to PostgreSQL with embedding
   */
  private async syncDataset(dataset: BlockchainDataset): Promise<boolean> {
    try {
      // Generate embedding from title + description
      const text = `${dataset.title} ${dataset.description}`.trim();
      const embedding = text ? await this.generateEmbedding(text) : null;

      // Upsert to PostgreSQL
      await this.prisma.dataset.upsert({
        where: { id: dataset.id },
        create: {
          id: dataset.id,
          creator: dataset.creator,
          quality_score: dataset.quality_score,
          price: BigInt(dataset.price),
          listed: dataset.listed,
          duration_seconds: dataset.duration_seconds,
          languages: dataset.languages,
          formats: dataset.formats,
          media_type: dataset.media_type,
          title: dataset.title,
          description: dataset.description,
          total_purchases: dataset.total_purchases,
          file_count: dataset.file_count || 1,
          total_duration: dataset.total_duration,
          bundle_discount_bps: dataset.bundle_discount_bps,
          blockchain_synced_at: new Date(),
          indexed_at: embedding ? new Date() : null,
        },
        update: {
          creator: dataset.creator,
          quality_score: dataset.quality_score,
          price: BigInt(dataset.price),
          listed: dataset.listed,
          duration_seconds: dataset.duration_seconds,
          languages: dataset.languages,
          formats: dataset.formats,
          media_type: dataset.media_type,
          title: dataset.title,
          description: dataset.description,
          total_purchases: dataset.total_purchases,
          file_count: dataset.file_count || 1,
          total_duration: dataset.total_duration,
          bundle_discount_bps: dataset.bundle_discount_bps,
          blockchain_synced_at: new Date(),
          indexed_at: embedding ? new Date() : null,
        },
      });

      // Update embedding separately (Prisma doesn't support vector type directly)
      if (embedding) {
        await this.prisma.$executeRaw`
          UPDATE "Dataset"
          SET embedding = ${embedding}::vector
          WHERE id = ${dataset.id}
        `;
      }

      logger.info({ datasetId: dataset.id }, 'Synced dataset from blockchain');
      return true;
    } catch (error) {
      logger.error({ error, datasetId: dataset.id }, 'Failed to sync dataset');
      return false;
    }
  }

  /**
   * Sync all datasets from blockchain to PostgreSQL
   */
  async syncAll(options: { limit?: number } = {}): Promise<{
    synced: number;
    failed: number;
    total: number;
  }> {
    logger.info('Starting blockchain dataset sync...');

    let synced = 0;
    let failed = 0;
    let cursor: string | undefined;
    const limit = options.limit || Number.MAX_SAFE_INTEGER;

    while (synced + failed < limit) {
      const { datasets, hasMore, nextCursor } = await this.fetchDatasetsFromBlockchain(cursor);

      if (datasets.length === 0) {
        break;
      }

      for (const dataset of datasets) {
        if (synced + failed >= limit) break;

        const success = await this.syncDataset(dataset);
        if (success) {
          synced++;
        } else {
          failed++;
        }
      }

      if (!hasMore) break;
      cursor = nextCursor;
    }

    const total = synced + failed;
    logger.info({ synced, failed, total }, 'Blockchain sync complete');

    return { synced, failed, total };
  }

  /**
   * Sync only datasets modified since last sync
   */
  async syncRecent(): Promise<{ synced: number; failed: number }> {
    logger.info('Syncing recent datasets...');

    // For now, sync all (blockchain doesn't have modified timestamps)
    // In production, maintain a cursor/checkpoint
    const result = await this.syncAll({ limit: 100 });

    return { synced: result.synced, failed: result.failed };
  }

  /**
   * Generate embeddings for datasets that don't have them
   */
  async backfillEmbeddings(limit: number = 100): Promise<number> {
    logger.info({ limit }, 'Backfilling embeddings...');

    const datasets = await this.prisma.dataset.findMany({
      where: { indexed_at: null },
      select: {
        id: true,
        title: true,
        description: true,
      },
      take: limit,
    });

    let indexed = 0;

    for (const dataset of datasets) {
      const text = `${dataset.title} ${dataset.description}`.trim();
      const embedding = text ? await this.generateEmbedding(text) : null;

      if (embedding) {
        await this.prisma.$executeRaw`
          UPDATE "Dataset"
          SET embedding = ${embedding}::vector,
              indexed_at = NOW()
          WHERE id = ${dataset.id}
        `;
        indexed++;
      }
    }

    logger.info({ indexed, total: datasets.length }, 'Embedding backfill complete');
    return indexed;
  }
}

/**
 * CLI usage:
 * node dist/services/blockchain-indexer.js sync [--limit 100]
 * node dist/services/blockchain-indexer.js backfill [--limit 100]
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  const limitArg = args.find(arg => arg.startsWith('--limit'));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;

  const indexer = new BlockchainIndexer();

  (async () => {
    if (command === 'sync') {
      await indexer.syncAll({ limit });
    } else if (command === 'backfill') {
      await indexer.backfillEmbeddings(limit || 100);
    } else {
      console.log('Usage: node blockchain-indexer.js <sync|backfill> [--limit=N]');
      process.exit(1);
    }
    process.exit(0);
  })();
}
