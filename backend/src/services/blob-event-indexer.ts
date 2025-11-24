/**
 * Blob Event Indexer
 *
 * Listens for BlobsSubmitted events from the blob_manager module.
 * These events are emitted when users submit blobs via the single-transaction flow.
 *
 * Event structure:
 * {
 *   uploader: address,
 *   main_blob_id: String,
 *   preview_blob_id: String,
 *   seal_policy_id: String,
 *   duration_seconds: u64,
 *   fee_paid_sui: u64
 * }
 *
 * Unlike the object-based indexer, this polls for events and creates Dataset records
 * directly from event data (no on-chain object to query).
 *
 * Usage:
 * - Run as cron job: `node dist/services/blob-event-indexer.js sync`
 * - Backfill: `node dist/services/blob-event-indexer.js backfill --limit 100`
 */

import type { PrismaClient } from "@prisma/client";
import type { EventId } from "@mysten/sui.js/client";
import { prisma as defaultPrisma } from "../lib/db";
import { suiClient } from "../lib/sui/client";
import { config } from "../lib/config";
import { logger } from "../lib/logger";

interface BlobSubmittedEvent {
  uploader: string;
  main_blob_id: string;
  preview_blob_id: string;
  seal_policy_id: string;
  duration_seconds: string | number;
  fee_paid_sui: string | number;
}

interface BlobEventData {
  id: {
    txDigest: string;
    eventSeq: string;
  };
  packageId: string;
  transactionModule: string;
  sender: string;
  type: string;
  parsedJson: BlobSubmittedEvent;
  bcs: string;
  timestampMs: string;
}

export class BlobEventIndexer {
  private prisma: PrismaClient;
  private packageId: string;
  private eventType: string;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || defaultPrisma;
    this.packageId = config.sui.packageId;

    if (!this.packageId || this.packageId === "0x0") {
      throw new Error("SONAR_PACKAGE_ID must be configured for event indexing");
    }

    this.eventType = `${this.packageId}::blob_manager::BlobsSubmitted`;
    logger.info({ eventType: this.eventType }, "BlobEventIndexer initialized");
  }

  /**
   * Query BlobsSubmitted events from blockchain
   */
  private async queryBlobEvents(
    cursor?: EventId | null,
    limit: number = 50,
  ): Promise<{
    events: BlobEventData[];
    hasMore: boolean;
    nextCursor?: EventId | null;
  }> {
    try {
      const response = await suiClient.queryEvents({
        query: {
          MoveEventType: this.eventType,
        },
        cursor: cursor || null,
        limit,
        order: "ascending",
      });

      const events = response.data as unknown as BlobEventData[];

      return {
        events,
        hasMore: response.hasNextPage,
        nextCursor: response.nextCursor,
      };
    } catch (error) {
      logger.error(
        { error, eventType: this.eventType },
        "Failed to query blob events",
      );
      return { events: [], hasMore: false };
    }
  }

  /**
   * Process a single BlobsSubmitted event and create/update Dataset
   */
  private async processEvent(event: BlobEventData): Promise<boolean> {
    try {
      const { parsedJson, id, timestampMs } = event;
      const {
        uploader,
        main_blob_id,
        preview_blob_id,
        seal_policy_id,
        duration_seconds,
        fee_paid_sui,
      } = parsedJson;

      // Use main_blob_id as the dataset ID (unique identifier)
      const datasetId = main_blob_id;

      // Convert duration to number
      const durationSec =
        typeof duration_seconds === "string"
          ? parseInt(duration_seconds)
          : duration_seconds;

      // Convert fee to number (in MIST, will store as bigint)
      const feeMist =
        typeof fee_paid_sui === "string"
          ? BigInt(fee_paid_sui)
          : BigInt(fee_paid_sui);

      // Check if already indexed
      const existing = await this.prisma.dataset.findUnique({
        where: { id: datasetId },
        select: { id: true },
      });

      if (existing) {
        logger.debug({ datasetId }, "Dataset already indexed, skipping");
        return true;
      }

      // Create dataset record
      await this.prisma.dataset.create({
        data: {
          id: datasetId,
          creator: uploader,
          quality_score: 70, // Default score, can be updated later
          price: feeMist, // Use fee as initial price
          listed: true,
          duration_seconds: durationSec,
          languages: ["en"], // Default, can be updated
          formats: ["audio/mpeg"], // Default, can be updated
          media_type: "audio",
          title: `Audio Dataset ${main_blob_id.substring(0, 8)}...`, // Default title
          description: `Submitted via blob_manager at ${new Date(parseInt(timestampMs)).toISOString()}`,
          total_purchases: 0,
          file_count: 1, // Single file submission
          total_duration: durationSec,
          bundle_discount_bps: 0,
          blockchain_synced_at: new Date(parseInt(timestampMs)),
          indexed_at: new Date(),
          // Store reference data in existing JSON fields
          per_file_metadata: [{
            blob_id: main_blob_id,
            preview_blob_id: preview_blob_id,
            seal_policy_id: seal_policy_id,
            tx_digest: id.txDigest,
            event_seq: id.eventSeq,
          }],
        },
      });

      logger.info(
        {
          datasetId,
          uploader,
          txDigest: id.txDigest,
          feeSui: Number(feeMist) / 1_000_000_000,
        },
        "Indexed BlobsSubmitted event",
      );

      return true;
    } catch (error) {
      logger.error(
        { error, eventId: event.id },
        "Failed to process BlobsSubmitted event",
      );
      return false;
    }
  }

  /**
   * Sync all blob events from blockchain
   */
  async syncAll(options: { limit?: number } = {}): Promise<{
    processed: number;
    failed: number;
    total: number;
  }> {
    logger.info("Starting blob event sync...");

    let processed = 0;
    let failed = 0;
    let cursor: EventId | null = null;
    const limit = options.limit || Number.MAX_SAFE_INTEGER;

    while (processed + failed < limit) {
      const { events, hasMore, nextCursor } = await this.queryBlobEvents(
        cursor,
        50,
      );

      if (events.length === 0) {
        break;
      }

      for (const event of events) {
        if (processed + failed >= limit) break;

        const success = await this.processEvent(event);
        if (success) {
          processed++;
        } else {
          failed++;
        }
      }

      if (!hasMore) break;
      cursor = nextCursor || null;
    }

    const total = processed + failed;
    logger.info({ processed, failed, total }, "Blob event sync complete");

    return { processed, failed, total };
  }

  /**
   * Sync events since last checkpoint
   * Uses database to track last processed event
   */
  async syncRecent(): Promise<{ processed: number; failed: number }> {
    logger.info("Syncing recent blob events...");

    // Get last checkpoint from database
    // For now, sync last 100 events (can be optimized with checkpoint storage)
    const result = await this.syncAll({ limit: 100 });

    return { processed: result.processed, failed: result.failed };
  }

  /**
   * Get event type being indexed
   */
  getEventType(): string {
    return this.eventType;
  }
}

/**
 * CLI usage:
 * npx tsx src/services/blob-event-indexer.ts sync [--limit 100]
 * npx tsx src/services/blob-event-indexer.ts backfill [--limit 100]
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const limitArg = args.find((arg) => arg.startsWith("--limit"));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;

  const indexer = new BlobEventIndexer();

  if (command === "sync" || command === "backfill") {
    await indexer.syncAll({ limit });
  } else {
    console.log(
      "Usage: npx tsx src/services/blob-event-indexer.ts <sync|backfill> [--limit=N]",
    );
    console.log(`Event type: ${indexer.getEventType()}`);
    process.exit(1);
  }
  process.exit(0);
}

// Run if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}
