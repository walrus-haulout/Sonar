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
  "https://wal-aggregator-mainnet.staketab.org",
  "https://walrus-mainnet.blockberry.one",
  "https://aggregator-mainnet.walrus.space",
];

const WALRUS_PUBLISHERS = [
  "https://walrus.prostaking.com:9185",
  "https://eyl1.walrus.zeroservices.eu:9185",
  "https://walrus-mainnet-publisher-1.staketab.org:443",
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

export async function retryBlobUpload(
  blobData: Blob,
  epochs: number = 26,
  maxRetries: number = 3,
): Promise<{ success: boolean; blobId?: string; error?: string }> {
  const sizeKB = (blobData.size / 1024).toFixed(2);
  console.log(`[Walrus] Retrying blob upload to storage nodes (${sizeKB} KB)`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    for (const publisher of WALRUS_PUBLISHERS) {
      try {
        console.log(
          `[Walrus] Upload attempt ${attempt}/${maxRetries} to ${publisher}`,
        );

        const url = `${publisher}/v1/blobs?epochs=${epochs}`;
        const response = await fetch(url, {
          method: "PUT",
          headers: {
            "Content-Type": "application/octet-stream",
          },
          body: blobData,
          signal: AbortSignal.timeout(60000), // 60s timeout
        });

        if (response.ok) {
          const result = await response.json();
          const blobId =
            result.newlyCreated?.blobObject?.blobId ||
            result.alreadyCertified?.blobId;

          if (blobId) {
            console.log(
              `[Walrus] Blob uploaded successfully to ${publisher}:`,
              blobId,
            );
            return { success: true, blobId };
          }
        }

        console.warn(
          `[Walrus] Upload to ${publisher} failed: ${response.status}`,
        );
      } catch (error) {
        console.warn(
          `[Walrus] Upload to ${publisher} failed:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    if (attempt < maxRetries) {
      const delayMs = attempt * 2000;
      console.log(
        `[Walrus] All publishers failed, retrying in ${delayMs}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return {
    success: false,
    error: `Failed to upload blob to any publisher after ${maxRetries} attempts`,
  };
}
