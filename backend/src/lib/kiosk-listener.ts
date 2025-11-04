/**
 * Kiosk Event Listener
 * Subscribes to blockchain events and syncs to database using Dreamlit's suiService
 * Events: SonarSold, DatasetPurchasedViaKiosk, KioskPriceUpdated
 */

import { createHash } from 'crypto';
import type { SuiEventFilter } from '@mysten/sui.js';
import { prisma } from './db';
import { logger } from './logger';
import { syncKioskSnapshotToDatabase } from './kiosk/state';
import { suiClient } from './sui/client';

interface SonarSoldEvent {
  buyer: string;
  sui_amount: string;
  sonar_amount: string;
}

interface DatasetPurchasedViaKioskEvent {
  buyer: string;
  dataset_id: string;
  sonar_amount: string;
}

interface KioskPriceUpdatedEvent {
  base_price: string;
  override_price: { Some: string } | { None: {} };
  tier: number;
}

/**
 * Hash event for idempotency: prevent duplicates on reorgs
 */
function hashEvent(txDigest: string, eventIndex: number): string {
  const hash = createHash('sha256');
  hash.update(`${txDigest}-${eventIndex}`);
  return hash.digest('hex').substring(0, 32); // 32-char signature
}

/**
 * Start listening to kiosk events using Dreamlit's suiClient
 */
export async function startKioskEventListener(
  packageId: string
): Promise<void> {
  logger.info(`Starting kiosk event listener for package ${packageId} using Dreamlit SDK`);

  try {
    // Subscribe to SonarSold events using Dreamlit's suiClient
    const unsubscribeSonarSold = await suiClient.subscribeEvent({
      filter: {
        module: `${packageId}::marketplace`,
        eventType: 'SonarSold',
      } as SuiEventFilter,
      onMessage: async (event: any) => {
        try {
          const parsedEvent = event.parsedJson as SonarSoldEvent;
          const eventSig = hashEvent(event.id.txDigest, event.id.eventSeq);

          logger.info(`SonarSold: ${parsedEvent.buyer} sold ${parsedEvent.sonar_amount} SONAR`);

          // Upsert (idempotent): use event_signature as unique key
          await prisma.kioskPurchase.upsert({
            where: { event_signature: eventSig },
            create: {
              user_address: parsedEvent.buyer,
              dataset_id: null, // Just SONAR trade, no dataset
              sonar_amount: BigInt(parsedEvent.sonar_amount),
              tx_digest: event.id.txDigest,
              event_signature: eventSig,
            },
            update: {}, // No-op if exists
          });

          // Update kiosk reserve cache (sum all events to get current balances)
          // For now, just log; in production, query blockchain for accurate state
          await syncKioskSnapshotToDatabase(prisma);
        } catch (error) {
          logger.error(error, `Failed to process SonarSold event`);
        }
      },
    });

    // Subscribe to DatasetPurchasedViaKiosk events using Dreamlit's suiClient
    const unsubscribeDatasetPurchase = await suiClient.subscribeEvent({
      filter: {
        module: `${packageId}::marketplace`,
        eventType: 'DatasetPurchasedViaKiosk',
      } as SuiEventFilter,
      onMessage: async (event: any) => {
        try {
          const parsedEvent = event.parsedJson as DatasetPurchasedViaKioskEvent;
          const eventSig = hashEvent(event.id.txDigest, event.id.eventSeq);

          logger.info(
            `DatasetPurchasedViaKiosk: ${parsedEvent.buyer} bought dataset ${parsedEvent.dataset_id}`
          );

          // Upsert kiosk purchase record
          await prisma.kioskPurchase.upsert({
            where: { event_signature: eventSig },
            create: {
              user_address: parsedEvent.buyer,
              dataset_id: parsedEvent.dataset_id,
              sonar_amount: BigInt(parsedEvent.sonar_amount),
              tx_digest: event.id.txDigest,
              event_signature: eventSig,
            },
            update: {
              dataset_id: parsedEvent.dataset_id, // Update if only sonar was recorded
            },
          });

          await syncKioskSnapshotToDatabase(prisma);
        } catch (error) {
          logger.error(error, `Failed to process DatasetPurchasedViaKiosk event`);
        }
      },
    });

    // Subscribe to KioskPriceUpdated events using Dreamlit's suiClient
    const unsubscribePriceUpdated = await suiClient.subscribeEvent({
      filter: {
        module: `${packageId}::marketplace`,
        eventType: 'KioskPriceUpdated',
      } as SuiEventFilter,
      onMessage: async (event: any) => {
        try {
          const parsedEvent = event.parsedJson as KioskPriceUpdatedEvent;

          logger.info(
            `KioskPriceUpdated: base=${parsedEvent.base_price}, tier=${parsedEvent.tier}`
          );

          // Record price history
          await prisma.priceHistory.create({
            data: {
              recorded_price: BigInt(parsedEvent.base_price),
              tier_at_time: parsedEvent.tier,
              admin_override: 'Some' in parsedEvent.override_price,
            },
          });

          await syncKioskSnapshotToDatabase(prisma);
        } catch (error) {
          logger.error(error, `Failed to process KioskPriceUpdated event`);
        }
      },
    });

    logger.info('Kiosk event listeners subscribed');

    // Handle cleanup
    process.on('SIGTERM', () => {
      logger.info('Closing kiosk event listeners');
      unsubscribeSonarSold();
      unsubscribeDatasetPurchase();
      unsubscribePriceUpdated();
    });
  } catch (error) {
    logger.error(error, 'Failed to start kiosk event listener');
    throw error;
  }
}

/**
 * Update kiosk reserve cache from blockchain (can be called periodically)
 */
export async function syncKioskReserveFromBlockchain(): Promise<void> {
  try {
    await syncKioskSnapshotToDatabase(prisma);
  } catch (error) {
    logger.error(error, 'Failed to sync kiosk reserve');
  }
}
