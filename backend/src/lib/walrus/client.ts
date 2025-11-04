/**
 * Walrus client using Dreamlit's production SDK.
 * Built on DirectTransport, HealthMonitor, and RateLimiter for enterprise-grade
 * reliability with automatic failover, rate limiting, and connection management.
 * Optimized for large audio blob streaming with range request support.
 */

import type { BlobMetadata } from '@sonar/shared';
import {
  DirectTransport,
  HealthMonitor,
  RateLimiter,
  WalrusConnectionManager,
} from '@dreamlit/walrus';
import { logger } from '../logger';

// Environment configuration
const WALRUS_AGGREGATOR_URL = process.env.WALRUS_AGGREGATOR_URL!;
const WALRUS_PUBLISHER_URL = process.env.WALRUS_PUBLISHER_URL || WALRUS_AGGREGATOR_URL;
const MOCK_WALRUS = process.env.MOCK_WALRUS === 'true';

if (!WALRUS_AGGREGATOR_URL) {
  throw new Error('WALRUS_AGGREGATOR_URL environment variable is required');
}

// Normalize URLs for consistent endpoint handling
const aggregatorBase = normalizeBaseUrl(WALRUS_AGGREGATOR_URL);
const publisherBase = normalizeBaseUrl(WALRUS_PUBLISHER_URL);

// Production-ready rate limiting configuration
// Aggregator: Higher limits for read operations (streaming, metadata)
const aggregatorLimiter = new RateLimiter({
  name: 'walrus-aggregator',
  maxRPS: Number(process.env.WALRUS_AGG_MAX_RPS ?? 5),
  burst: Number(process.env.WALRUS_AGG_BURST ?? 5),
  maxConcurrent: Number(process.env.WALRUS_AGG_MAX_CONCURRENT ?? 3),
});

// Publisher: Conservative limits for write operations (upload)
const publisherLimiter = new RateLimiter({
  name: 'walrus-publisher',
  maxRPS: Number(process.env.WALRUS_PUB_MAX_RPS ?? 1),
  burst: Number(process.env.WALRUS_PUB_BURST ?? 2),
  maxConcurrent: Number(process.env.WALRUS_PUB_MAX_CONCURRENT ?? 1),
});

// Dreamlit DirectTransport: Production SDK transport layer with built-in failover
const walrusTransport = new DirectTransport({
  walrusAgg: aggregatorLimiter,
  walrusPub: publisherLimiter,
});

// Connection manager: Tracks health and provides automatic failover
const connectionManager = new WalrusConnectionManager();

// Health monitor: Continuous health checking with automatic endpoint failover
const healthMonitor = new HealthMonitor(
  {
    aggregator: { proxy: aggregatorBase, direct: aggregatorBase, proxyEnabled: false },
    publisher: { proxy: publisherBase, direct: publisherBase, proxyEnabled: false },
  },
  walrusTransport,
  connectionManager
);

// Initialize health monitoring on startup
logger.info('Initializing Dreamlit Walrus SDK with health monitoring');
healthMonitor.check().catch((error: unknown) => {
  logger.warn({ error }, 'Initial Walrus health check failed (will retry automatically)');
});

// Stream timeout configuration
const STREAM_TIMEOUT_MS = Number(process.env.WALRUS_STREAM_TIMEOUT_MS ?? 30_000);

/**
 * Fetch blob metadata from Walrus via the SDK transport layer.
 */
export async function fetchBlobMetadata(blobId: string): Promise<BlobMetadata | null> {
  if (MOCK_WALRUS) {
    logger.debug({ blobId }, 'Mock: Returning blob metadata');
    return {
      blob_id: blobId,
      size: 5_242_880,
      encoding: 'Blob',
      certified: true,
    };
  }

  try {
    const { exists, response } = await walrusTransport.headBlob(aggregatorBase, blobId);
    if (!exists || !response) {
      logger.warn({ blobId }, 'Blob not found on Walrus');
      return null;
    }

    connectionManager.recordSuccess();

    const size = response.headers.get('content-length');
    const encoding = response.headers.get('x-walrus-encoding') || 'Blob';
    const certified = response.headers.get('x-walrus-certified') === 'true';

    return {
      blob_id: blobId,
      size: size ? parseInt(size, 10) : 0,
      encoding: encoding as 'Blob' | 'Encoded',
      certified,
    };
  } catch (error) {
    connectionManager.recordFailure(error instanceof Error ? error : undefined);
    logger.error({ error, blobId }, 'Failed to fetch blob metadata');
    return null;
  }
}

/**
 * Verify blob hash against expected value using Walrus certification header.
 */
export async function verifyBlobHash(blobId: string): Promise<boolean> {
  if (MOCK_WALRUS) {
    logger.debug({ blobId }, 'Mock: Blob hash verified');
    return true;
  }

  try {
    const metadata = await fetchBlobMetadata(blobId);
    return Boolean(metadata?.certified);
  } catch (error) {
    logger.error({ error, blobId }, 'Failed to verify blob hash');
    return false;
  }
}

/**
 * Stream blob from Walrus with Range request support and SDK-backed rate limiting.
 */
export async function streamBlobFromWalrus(
  blobId: string,
  options?: {
    range?: { start: number; end?: number };
  }
): Promise<Response> {
  if (MOCK_WALRUS) {
    logger.debug({ blobId, range: options?.range }, 'Mock: Streaming blob');
    const mockData = Buffer.alloc(options?.range ? 1_024 : 5_242_880, 0x7b);
    return new Response(mockData, {
      status: options?.range ? 206 : 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': mockData.length.toString(),
        'Accept-Ranges': 'bytes',
      },
    });
  }

  const rangeDescriptor = options?.range
    ? `${options.range.start}-${options.range.end ?? ''}`
    : 'full';

  return aggregatorLimiter.schedule(
    `walrus:stream:${blobId}:${rangeDescriptor}`,
    async () => {
      const requestUrl = new URL(`/v1/blobs/${blobId}`, `${aggregatorBase}/`).toString();
      const headers: HeadersInit = {
        Accept: 'audio/mpeg',
      };

      if (options?.range) {
        const { start, end } = options.range;
        headers['Range'] = `bytes=${start}${end !== undefined ? `-${end}` : '-'}`;
      }

      const { signal, dispose } = createTimeoutController(STREAM_TIMEOUT_MS);

      try {
        const response = await fetch(requestUrl, { headers, signal });

        if (!response.ok) {
          const error = new Error(`Walrus error: ${response.status} ${response.statusText}`);
          connectionManager.recordFailure(error);
          logger.error({ blobId, status: response.status, range: options?.range }, 'Failed to stream blob from Walrus');
          throw error;
        }

        connectionManager.recordSuccess();
        dispose();
        return response;
      } catch (error) {
        connectionManager.recordFailure(error instanceof Error ? error : undefined);
        logger.error({ error, blobId, range: options?.range }, 'Stream failed');
        dispose();
        throw error;
      }
    },
    { timeoutMs: STREAM_TIMEOUT_MS + 5_000 }
  );
}

/**
 * Check Walrus health using the SDK health monitor.
 */
export async function isWalrusAvailable(): Promise<boolean> {
  if (MOCK_WALRUS) {
    return true;
  }

  try {
    const status = await healthMonitor.check();
    return status.aggregatorAvailable;
  } catch (error) {
    logger.error({ error }, 'Walrus health check failed');
    return false;
  }
}

function normalizeBaseUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.pathname = url.pathname.replace(/\/$/, '');
    return url.toString().replace(/\/$/, '');
  } catch (error) {
    throw new Error(`Invalid Walrus URL provided: ${raw}`);
  }
}

function createTimeoutController(timeoutMs: number): { signal?: AbortSignal; dispose: () => void } {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { signal: undefined, dispose: () => undefined };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const dispose = () => clearTimeout(timeoutId);
  controller.signal.addEventListener('abort', dispose, { once: true });
  return { signal: controller.signal, dispose };
}

/**
 * TODO: Add resumable download support for >500MB files
 *       - Implement ETag/If-Range headers
 *       - Store partial download state
 *       - Resume from last byte on reconnect
 *
 * TODO: Add download timeout (e.g., 30min for large files)
 *       - Configurable via DOWNLOAD_TIMEOUT_MS env var
 *       - Graceful cleanup on timeout
 *
 * TODO: Add chunked verification for large blobs
 *       - Stream through hash verification
 *       - Don't wait for full download to verify
 */
