import { walrus } from "@mysten/walrus";
import { suiClient as defaultSuiClient, NETWORK } from "@/lib/sui/client";

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

const WALRUS_AGGREGATORS = [
  "https://walrus-mainnet.blockberry.one",
  "https://wal-aggregator-mainnet.staketab.org",
  "https://aggregator-mainnet.walrus.space",
];

export async function verifyBlobExists(
  blobId: string,
  maxRetries: number = 3,
  delayMs: number = 2000,
): Promise<{ exists: boolean; aggregator?: string; error?: string }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(
      `[Walrus] Verifying blob ${blobId} (attempt ${attempt}/${maxRetries})`,
    );

    for (const aggregator of WALRUS_AGGREGATORS) {
      try {
        const url = `${aggregator}/v1/${blobId}`;
        const response = await fetch(url, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          console.log(`[Walrus] Blob verified on ${aggregator}`);
          return { exists: true, aggregator };
        }
      } catch (error) {
        console.warn(
          `[Walrus] Failed to check ${aggregator}:`,
          error instanceof Error ? error.message : error,
        );
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
