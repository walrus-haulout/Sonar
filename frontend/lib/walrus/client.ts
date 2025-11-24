import { walrus } from "@mysten/walrus";
import { suiClient as defaultSuiClient, NETWORK } from "@/lib/sui/client";
import { WALRUS_AGGREGATOR_URL } from "./config";

let walrusClientInstance: ReturnType<typeof createWalrusClient> | null = null;

function createWalrusClient() {
  return defaultSuiClient.$extend(
    walrus({
      network: NETWORK === "testnet" ? "testnet" : "mainnet",
    }),
  );
}

export function getWalrusClient() {
  if (!walrusClientInstance) {
    walrusClientInstance = createWalrusClient();
  }
  return walrusClientInstance;
}

export function getAggregatorList(): string[] {
  const aggregators: string[] = [];

  // Priority 1: Use env-provided aggregator URL
  if (WALRUS_AGGREGATOR_URL) {
    aggregators.push(WALRUS_AGGREGATOR_URL);
  }

  // Priority 2: Add vetted fallbacks (verified to resolve)
  const fallbacks = [
    "https://aggregator.walrus-mainnet.walrus.space",
    "https://wal-aggregator-mainnet.staketab.org",
  ];

  for (const fallback of fallbacks) {
    if (!aggregators.includes(fallback)) {
      aggregators.push(fallback);
    }
  }

  if (aggregators.length === 0) {
    throw new Error(
      "No Walrus aggregator URLs configured. Set NEXT_PUBLIC_WALRUS_AGGREGATOR_URL.",
    );
  }

  return aggregators;
}

export async function verifyBlobExists(
  blobId: string,
  maxRetries: number = 3,
  delayMs: number = 2000,
): Promise<{ exists: boolean; aggregator?: string; error?: string }> {
  const aggregators = getAggregatorList();
  const deadAggregators = new Set<string>();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(
      `[Walrus] Verifying blob ${blobId} (attempt ${attempt}/${maxRetries})`,
    );

    for (const aggregator of aggregators) {
      // Skip aggregators that failed DNS resolution
      if (deadAggregators.has(aggregator)) {
        continue;
      }

      try {
        const url = `${aggregator}/v1/${blobId}`;
        const response = await fetch(url, {
          method: "HEAD",
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          console.log(`[Walrus] Blob verified on ${aggregator}`);
          return { exists: true, aggregator };
        }

        // 404 means blob not propagated yet - retry
        if (response.status === 404) {
          console.log(
            `[Walrus] Blob not found on ${aggregator} (404 - not propagated yet)`,
          );
          continue;
        }

        // Other non-OK statuses
        console.warn(
          `[Walrus] ${aggregator} returned ${response.status} ${response.statusText}`,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        // DNS errors mean the host is unreachable - skip it permanently
        if (
          errorMessage.includes("ERR_NAME_NOT_RESOLVED") ||
          errorMessage.includes("getaddrinfo") ||
          errorMessage.includes("ENOTFOUND")
        ) {
          console.error(
            `[Walrus] DNS failure for ${aggregator}, skipping permanently:`,
            errorMessage,
          );
          deadAggregators.add(aggregator);
          continue;
        }

        // Network errors or timeouts - retry
        console.warn(`[Walrus] Failed to check ${aggregator}:`, errorMessage);
      }
    }

    if (attempt < maxRetries) {
      console.log(`[Walrus] Blob not found, retrying in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return {
    exists: false,
    error: `Blob not found on any aggregator after ${maxRetries} attempts`,
  };
}

/**
 * DEPRECATED: Direct publisher uploads removed
 * All uploads now go through /api/edge/walrus/upload proxy
 * This avoids CORS issues and uses Blockberry API key authentication
 */
