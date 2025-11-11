/**
 * Sui blockchain queries for purchase verification
 * Verifies if a user owns/purchased a dataset
 */

import { logger } from '../logger';
import { SONAR_PACKAGE_ID, SUI_RPC_URL, suiClient } from './client';

if (!SONAR_PACKAGE_ID || SONAR_PACKAGE_ID === '0x0') {
  logger.warn('SONAR_PACKAGE_ID not configured. Purchase verification will use mock data.');
}

// In-memory cache for purchase verification (5 min TTL)
const purchaseCache = new Map<
  string,
  { result: boolean; expiresAt: number }
>();

/**
 * Verify if a user owns/purchased a dataset
 * Checks database first (faster), then falls back to blockchain query
 */
export async function verifyUserOwnsDataset(
  userAddress: string,
  datasetId: string,
  checkPrisma?: (address: string, id: string) => Promise<boolean>
): Promise<boolean> {
  const cacheKey = `${userAddress}-${datasetId}`;

  // Check cache
  const cached = purchaseCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result;
  }

  try {
    // Check database first (faster)
    if (checkPrisma) {
      const isPurchased = await checkPrisma(userAddress, datasetId);
      if (isPurchased) {
        setCacheResult(cacheKey, true);
        return true;
      }
    }

    // Fall back to blockchain query
    const owns = await queryPurchaseEvents(userAddress, datasetId);

    setCacheResult(cacheKey, owns);
    return owns;
  } catch (error) {
    logger.error(
      { error, userAddress, datasetId },
      'Purchase verification failed'
    );
    // Default to false on error (deny access)
    return false;
  }
}

/**
 * Query DatasetPurchased events for a user and dataset
 * Returns true if purchase event found
 */
async function queryPurchaseEvents(
  userAddress: string,
  datasetId: string
): Promise<boolean> {
  // If package ID not configured, use mock data
  if (!SONAR_PACKAGE_ID || SONAR_PACKAGE_ID === '0x0') {
    logger.debug(
      { userAddress, datasetId },
      'Mock: User owns dataset (SONAR_PACKAGE_ID not configured)'
    );
    return true; // Allow all purchases in dev
  }

  try {
    // Query events from blockchain
    // Event type: {SONAR_PACKAGE_ID}::marketplace::DatasetPurchased
    const events = await suiClient.queryEvents({
      query: {
        MoveEventType: `${SONAR_PACKAGE_ID}::marketplace::DatasetPurchased`,
      },
      limit: 100,
    });

    // Check if any event matches user and dataset
    for (const event of events.data) {
      if (event.parsedJson) {
        const json = event.parsedJson as Record<string, unknown>;
        const buyer = json['buyer'] as string | undefined;
        const submissionId = json['submission_id'] as string | undefined;

        if (
          buyer?.toLowerCase() === userAddress.toLowerCase() &&
          submissionId === datasetId
        ) {
          logger.debug(
            { userAddress, datasetId },
            'Purchase verified on blockchain'
          );
          return true;
        }
      }
    }

    logger.debug(
      { userAddress, datasetId },
      'No purchase event found on blockchain'
    );
    return false;
  } catch (error) {
    logger.error(
      { error, userAddress, datasetId },
      'Failed to query purchase events'
    );
    throw error;
  }
}

/**
 * Set cache result with 5-minute TTL
 */
function setCacheResult(key: string, result: boolean, ttlMs = 5 * 60 * 1000): void {
  purchaseCache.set(key, {
    result,
    expiresAt: Date.now() + ttlMs,
  });

  // Auto-cleanup after TTL
  setTimeout(() => {
    purchaseCache.delete(key);
  }, ttlMs);
}

/**
 * Clear cache for a user-dataset pair
 * Used after purchase to invalidate cache
 */
export function invalidatePurchaseCache(userAddress: string, datasetId: string): void {
  const cacheKey = `${userAddress}-${datasetId}`;
  purchaseCache.delete(cacheKey);
}

/**
 * Get Sui RPC URL for frontend use (if needed)
 */
export function getSuiRpcUrl(): string {
  return SUI_RPC_URL;
}

/**
 * Get Sonar package ID for contract interactions
 */
export function getSonarPackageId(): string {
  return SONAR_PACKAGE_ID;
}
