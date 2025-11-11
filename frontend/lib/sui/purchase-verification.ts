/**
 * Frontend Purchase Verification
 * Verifies dataset ownership by querying blockchain events directly
 */

import { SuiClient } from '@mysten/sui/client';

// In-memory cache with 5-minute TTL
interface CacheEntry {
  result: boolean;
  expiresAt: number;
}

const purchaseCache = new Map<string, CacheEntry>();

/**
 * Verify if a user owns/purchased a dataset
 * Queries blockchain DatasetPurchased events directly
 *
 * @param userAddress - Wallet address to check
 * @param datasetId - Dataset/submission ID (on-chain object ID)
 * @param suiClient - Sui blockchain client
 * @returns true if user purchased the dataset, false otherwise
 */
export async function verifyUserOwnsDataset(
  userAddress: string,
  datasetId: string,
  suiClient: SuiClient,
  packageId: string
): Promise<boolean> {
  const cacheKey = `${userAddress}:${datasetId}`;

  // Check in-memory cache (5min TTL)
  const cached = purchaseCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    console.log('[PurchaseVerification] Cache hit:', cacheKey);
    return cached.result;
  }

  try {
    // Query blockchain directly
    const owns = await queryPurchaseEvents(userAddress, datasetId, suiClient, packageId);

    // Cache result
    setCacheResult(cacheKey, owns);
    return owns;
  } catch (error) {
    console.error('[PurchaseVerification] Verification failed:', error);
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
  datasetId: string,
  suiClient: SuiClient,
  packageId: string
): Promise<boolean> {
  // Mock mode for dev (package ID not configured)
  if (!packageId || packageId === '0x0') {
    console.warn('[PurchaseVerification] Mock mode: allowing all purchases (PACKAGE_ID not configured)');
    return true;
  }

  try {
    // Query events from blockchain
    // Event type: {PACKAGE_ID}::marketplace::DatasetPurchased
    const events = await suiClient.queryEvents({
      query: {
        MoveEventType: `${packageId}::marketplace::DatasetPurchased`,
      },
      limit: 100,
    });

    console.log(`[PurchaseVerification] Queried ${events.data.length} purchase events`);

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
          console.log('[PurchaseVerification] Purchase verified on blockchain:', {
            buyer,
            datasetId: submissionId,
          });
          return true;
        }
      }
    }

    console.log('[PurchaseVerification] No purchase event found for:', {
      userAddress,
      datasetId,
    });
    return false;
  } catch (error) {
    console.error('[PurchaseVerification] Failed to query purchase events:', error);
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
 * Clear the purchase cache (useful for testing or after purchase)
 */
export function clearPurchaseCache(): void {
  purchaseCache.clear();
  console.log('[PurchaseVerification] Cache cleared');
}

/**
 * Clear cache for specific user/dataset
 */
export function clearPurchaseCacheEntry(userAddress: string, datasetId: string): void {
  const cacheKey = `${userAddress}:${datasetId}`;
  purchaseCache.delete(cacheKey);
  console.log('[PurchaseVerification] Cache entry cleared:', cacheKey);
}
