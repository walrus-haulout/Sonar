/**
 * Metadata Queue Processor
 *
 * Processes pending metadata submissions in the background.
 * Handles RPC indexing lag by retrying with exponential backoff.
 */

import type { PrismaClient, PendingMetadata } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import { prisma as defaultPrisma } from "../lib/db";
import { storeSealMetadata, type FileSealMetadata } from "./dataset-service";
import { logger } from "../lib/logger";

// Exponential backoff delays in ms: 30s, 1m, 2m, 4m, 8m, 15m, 30m, 1h, 2h, 4h
const BACKOFF_DELAYS = [
  30_000, 60_000, 120_000, 240_000, 480_000, 900_000, 1_800_000, 3_600_000,
  7_200_000, 14_400_000,
];

const MAX_ATTEMPTS = 10;
const BATCH_SIZE = 20;

export class MetadataProcessor {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || defaultPrisma;
  }

  /**
   * Process all pending metadata items ready for retry
   */
  async processQueue(): Promise<{ processed: number; failed: number }> {
    const pending = await this.prisma.pendingMetadata.findMany({
      where: {
        status: { in: ["pending", "failed"] },
        next_retry_at: { lte: new Date() },
        attempts: { lt: MAX_ATTEMPTS },
      },
      take: BATCH_SIZE,
      orderBy: { next_retry_at: "asc" },
    });

    if (pending.length === 0) {
      return { processed: 0, failed: 0 };
    }

    logger.info({ count: pending.length }, "Processing metadata queue");

    let processed = 0;
    let failed = 0;

    for (const item of pending) {
      try {
        await this.processItem(item);
        processed++;
      } catch (error) {
        failed++;
        await this.markFailed(item, error);
      }
    }

    return { processed, failed };
  }

  /**
   * Process a single pending metadata item
   */
  private async processItem(item: PendingMetadata): Promise<void> {
    const attemptNumber = item.attempts + 1;

    logger.info(
      { datasetId: item.dataset_id, attempt: attemptNumber },
      "Processing pending metadata"
    );

    // Mark as processing
    await this.prisma.pendingMetadata.update({
      where: { id: item.id },
      data: { status: "processing", attempts: attemptNumber },
    });

    try {
      // Call existing storeSealMetadata (which handles blockchain fetching)
      await storeSealMetadata({
        datasetId: item.dataset_id,
        userAddress: item.user_address,
        files: item.files as unknown as FileSealMetadata[],
        verification: item.verification as any,
        metadata: item.metadata as any,
        logger: logger as unknown as FastifyBaseLogger,
      });

      // Mark as completed
      await this.prisma.pendingMetadata.update({
        where: { id: item.id },
        data: { status: "completed", completed_at: new Date() },
      });

      logger.info(
        { datasetId: item.dataset_id, attempt: attemptNumber },
        "Metadata processed successfully"
      );
    } catch (error) {
      // Re-throw to be handled by caller
      throw error;
    }
  }

  /**
   * Mark an item as failed and schedule next retry
   */
  private async markFailed(
    item: PendingMetadata,
    error: unknown
  ): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const nextRetryDelay = this.getBackoffDelay(item.attempts);
    const nextRetryAt = new Date(Date.now() + nextRetryDelay);

    const isMaxAttempts = item.attempts + 1 >= MAX_ATTEMPTS;

    await this.prisma.pendingMetadata.update({
      where: { id: item.id },
      data: {
        status: isMaxAttempts ? "failed" : "pending",
        last_error: errorMessage,
        next_retry_at: nextRetryAt,
      },
    });

    if (isMaxAttempts) {
      logger.error(
        { datasetId: item.dataset_id, error: errorMessage, attempts: item.attempts + 1 },
        "Metadata processing failed permanently after max attempts"
      );
    } else {
      logger.warn(
        {
          datasetId: item.dataset_id,
          error: errorMessage,
          attempt: item.attempts + 1,
          nextRetryAt,
        },
        "Metadata processing failed, will retry"
      );
    }
  }

  /**
   * Get backoff delay for given attempt number
   */
  private getBackoffDelay(attempts: number): number {
    return BACKOFF_DELAYS[Math.min(attempts, BACKOFF_DELAYS.length - 1)];
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    const [pending, processing, completed, failed] = await Promise.all([
      this.prisma.pendingMetadata.count({ where: { status: "pending" } }),
      this.prisma.pendingMetadata.count({ where: { status: "processing" } }),
      this.prisma.pendingMetadata.count({ where: { status: "completed" } }),
      this.prisma.pendingMetadata.count({
        where: { status: "failed", attempts: { gte: MAX_ATTEMPTS } },
      }),
    ]);

    return { pending, processing, completed, failed };
  }
}

/**
 * Queue metadata for background processing
 * Called from the seal-metadata endpoint
 */
export async function queueMetadataForProcessing(options: {
  datasetId: string;
  userAddress: string;
  files: FileSealMetadata[];
  verification?: any;
  metadata?: any;
  txDigest?: string;
  prismaClient?: PrismaClient;
}): Promise<void> {
  const prisma = options.prismaClient || defaultPrisma;

  await prisma.pendingMetadata.upsert({
    where: { dataset_id: options.datasetId },
    create: {
      dataset_id: options.datasetId,
      user_address: options.userAddress,
      files: options.files as any,
      verification: options.verification || null,
      metadata: options.metadata || null,
      tx_digest: options.txDigest,
      status: "pending",
      next_retry_at: new Date(),
    },
    update: {
      files: options.files as any,
      verification: options.verification || null,
      metadata: options.metadata || null,
      status: "pending",
      attempts: 0,
      last_error: null,
      next_retry_at: new Date(),
    },
  });

  logger.info(
    { datasetId: options.datasetId, userAddress: options.userAddress },
    "Metadata queued for background processing"
  );
}
