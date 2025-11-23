/**
 * Cron Job for Blockchain Dataset Indexing
 * 
 * Runs periodically to sync blockchain datasets to PostgreSQL.
 * Should be registered in main server startup.
 * 
 * Recommended schedule:
 * - Every 5 minutes for recent sync
 * - Daily for full backfill
 */

import { CronJob } from 'cron';
import { BlockchainIndexer } from './blockchain-indexer';
import { logger } from '../lib/logger';

export class DatasetIndexerCron {
  private recentSyncJob: CronJob | null = null;
  private backfillJob: CronJob | null = null;
  private indexer: BlockchainIndexer;

  constructor() {
    this.indexer = new BlockchainIndexer();
  }

  /**
   * Start cron jobs for dataset indexing
   */
  start() {
    // Sync recent datasets every 5 minutes
    this.recentSyncJob = new CronJob(
      '*/5 * * * *', // Every 5 minutes
      async () => {
        try {
          logger.info('Running scheduled dataset sync...');
          const result = await this.indexer.syncRecent();
          logger.info(result, 'Scheduled sync complete');
        } catch (error) {
          logger.error({ error }, 'Scheduled sync failed');
        }
      },
      null,
      true, // Start immediately
      'UTC'
    );

    // Backfill embeddings daily at 2 AM UTC
    this.backfillJob = new CronJob(
      '0 2 * * *', // Daily at 2 AM UTC
      async () => {
        try {
          logger.info('Running scheduled embedding backfill...');
          const indexed = await this.indexer.backfillEmbeddings(1000);
          logger.info({ indexed }, 'Scheduled backfill complete');
        } catch (error) {
          logger.error({ error }, 'Scheduled backfill failed');
        }
      },
      null,
      true,
      'UTC'
    );

    logger.info('Dataset indexer cron jobs started');
  }

  /**
   * Stop all cron jobs
   */
  stop() {
    if (this.recentSyncJob) {
      this.recentSyncJob.stop();
      this.recentSyncJob = null;
    }

    if (this.backfillJob) {
      this.backfillJob.stop();
      this.backfillJob = null;
    }

    logger.info('Dataset indexer cron jobs stopped');
  }

  /**
   * Run sync immediately (for testing)
   */
  async runNow() {
    logger.info('Running manual dataset sync...');
    const result = await this.indexer.syncRecent();
    logger.info(result, 'Manual sync complete');
    return result;
  }
}

// Singleton instance
let cronInstance: DatasetIndexerCron | null = null;

export function startDatasetIndexer() {
  if (!cronInstance) {
    cronInstance = new DatasetIndexerCron();
    cronInstance.start();
  }
  return cronInstance;
}

export function stopDatasetIndexer() {
  if (cronInstance) {
    cronInstance.stop();
    cronInstance = null;
  }
}

export function getDatasetIndexer() {
  if (!cronInstance) {
    throw new Error('Dataset indexer not started. Call startDatasetIndexer() first.');
  }
  return cronInstance;
}
