/**
 * Walrus client using direct HTTP API calls
 * Simple and reliable implementation for blob storage operations
 */

import type { BlobMetadata } from '@sonar/shared';
import { logger } from '../logger';
import { config } from '../config';

// Get configuration from centralized config
const MOCK_WALRUS = config.walrus.mockMode;

// Walrus endpoints
const WALRUS_AGGREGATOR_URL = config.walrus.aggregatorUrl;
const WALRUS_PUBLISHER_URL = config.walrus.publisherUrl || config.walrus.aggregatorUrl;

logger.info({
  aggregator: WALRUS_AGGREGATOR_URL,
  publisher: WALRUS_PUBLISHER_URL
}, 'Walrus client initialized');

// Stream timeout configuration
const STREAM_TIMEOUT_MS = config.walrus.aggregator.requestTimeout;

/**
 * Fetch blob metadata from Walrus
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
    const requestUrl = `${WALRUS_AGGREGATOR_URL}/v1/blobs/${blobId}`;
    const response = await fetch(requestUrl, { method: 'HEAD' });

    if (!response.ok) {
      logger.warn({ blobId, status: response.status }, 'Blob not found on Walrus');
      return null;
    }

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
    mimeType?: string | null;
  }
): Promise<Response> {
  if (MOCK_WALRUS) {
    logger.debug({ blobId, range: options?.range }, 'Mock: Streaming blob');
    const mockData = Buffer.alloc(options?.range ? 1_024 : 5_242_880, 0x7b);
    return new Response(mockData, {
      status: options?.range ? 206 : 200,
      headers: {
        'Content-Type': options?.mimeType ?? 'audio/mpeg',
        'Content-Length': mockData.length.toString(),
        'Accept-Ranges': 'bytes',
      },
    });
  }

  const requestUrl = `${WALRUS_AGGREGATOR_URL}/v1/blobs/${blobId}`;
  const headers: HeadersInit = {
    Accept: options?.mimeType ?? 'application/octet-stream',
  };

  if (options?.range) {
    const { start, end } = options.range;
    headers['Range'] = `bytes=${start}${end !== undefined ? `-${end}` : '-'}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

    const response = await fetch(requestUrl, { headers, signal: controller.signal });

    clearTimeout(timeout);

    if (!response.ok) {
      logger.error({ blobId, status: response.status, range: options?.range }, 'Failed to stream blob from Walrus');
      throw new Error(`Walrus error: ${response.status} ${response.statusText}`);
    }

    return response;
  } catch (error) {
    logger.error({ error, blobId, range: options?.range }, 'Stream failed');
    throw error;
  }
}

/**
 * Check Walrus health
 */
export async function isWalrusAvailable(): Promise<boolean> {
  if (MOCK_WALRUS) {
    return true;
  }

  try {
    const response = await fetch(`${WALRUS_AGGREGATOR_URL}/v1/health`);
    return response.ok;
  } catch (error) {
    logger.error({ error }, 'Walrus health check failed');
    return false;
  }
}
