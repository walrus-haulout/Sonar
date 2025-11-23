import { NETWORK } from "@/lib/sui/client";

/**
 * Walrus network configuration
 *
 * Environment variables:
 * - NEXT_PUBLIC_WALRUS_PUBLISHER_URL
 * - NEXT_PUBLIC_WALRUS_AGGREGATOR_URL
 */

export const WALRUS_PUBLISHER_URL = (
  process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL || ""
).trim();
export const WALRUS_AGGREGATOR_URL = (
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL || ""
).trim();

if (!WALRUS_PUBLISHER_URL || !WALRUS_AGGREGATOR_URL) {
  console.warn(
    "[Walrus Config] Missing Walrus URLs. Set NEXT_PUBLIC_WALRUS_PUBLISHER_URL and NEXT_PUBLIC_WALRUS_AGGREGATOR_URL.",
  );
}

// Log configuration on startup
console.log("[Walrus Config]", {
  network: NETWORK,
  publisher: WALRUS_PUBLISHER_URL,
  aggregator: WALRUS_AGGREGATOR_URL,
});
