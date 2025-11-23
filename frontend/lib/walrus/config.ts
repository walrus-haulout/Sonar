import { NETWORK } from "@/lib/sui/client";

/**
 * Walrus network configuration
 * Dynamically determines Walrus endpoints based on NEXT_PUBLIC_NETWORK
 *
 * Environment variables can override defaults:
 * - NEXT_PUBLIC_WALRUS_PUBLISHER_URL
 * - NEXT_PUBLIC_WALRUS_AGGREGATOR_URL
 */

export const WALRUS_PUBLISHER_URL =
  process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL ||
  `https://publisher.walrus-${NETWORK}.walrus.space`;

export const WALRUS_AGGREGATOR_URL =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL ||
  `https://aggregator.walrus-${NETWORK}.walrus.space`;

// Log configuration on startup (only in development)
if (process.env.NODE_ENV === "development") {
  console.log("[Walrus Config]", {
    network: NETWORK,
    publisher: WALRUS_PUBLISHER_URL,
    aggregator: WALRUS_AGGREGATOR_URL,
  });
}
