/**
 * Walrus aggregator HTTP client
 * Handles blob fetching and streaming with Range request support
 */

import { logger } from '../logger';
import type { BlobMetadata } from '@sonar/shared';

const WALRUS_AGGREGATOR_URL = process.env.WALRUS_AGGREGATOR_URL!;
const MOCK_WALRUS = process.env.MOCK_WALRUS === 'true';

if (!WALRUS_AGGREGATOR_URL) {
  throw new Error('WALRUS_AGGREGATOR_URL environment variable is required');
}

/**
 * Fetch blob metadata from Walrus
 */
export async function fetchBlobMetadata(blobId: string): Promise<BlobMetadata | null> {
  if (MOCK_WALRUS) {
    logger.debug({ blobId }, 'Mock: Returning blob metadata');
    return {
      blob_id: blobId,
      size: 5242880, // 5MB mock size
      encoding: 'Blob',
      certified: true,
    };
  }

  try {
    const url = `${WALRUS_AGGREGATOR_URL}/v1/${blobId}`;
    const response = await fetch(url, {
      method: 'HEAD',
    });

    if (!response.ok) {
      logger.warn({ blobId, status: response.status }, 'Blob not found on Walrus');
      return null;
    }

    // Parse metadata from headers
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
 * Verify blob hash against expected value
 * Used for integrity verification
 */
export async function verifyBlobHash(
  blobId: string
): Promise<boolean> {
  if (MOCK_WALRUS) {
    logger.debug({ blobId }, 'Mock: Blob hash verified');
    return true;
  }

  try {
    const metadata = await fetchBlobMetadata(blobId);
    if (!metadata) {
      return false;
    }

    // In production, would fetch blob and compute hash
    // For now, rely on Walrus certification
    return metadata.certified;
  } catch (error) {
    logger.error({ error, blobId }, 'Failed to verify blob hash');
    return false;
  }
}

/**
 * Stream blob from Walrus with Range request support
 * Forwards Range headers from client to Walrus aggregator
 * Returns response that can be piped directly to client
 */
export async function streamBlobFromWalrus(
  blobId: string,
  options?: {
    range?: { start: number; end?: number };
  }
): Promise<Response> {
  if (MOCK_WALRUS) {
    logger.debug({ blobId, range: options?.range }, 'Mock: Streaming blob');
    // Return mock response
    const mockData = Buffer.alloc(options?.range ? 1024 : 5242880);
    mockData.fill(0x7b); // '{' character as placeholder
    return new Response(mockData, {
      status: options?.range ? 206 : 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': mockData.length.toString(),
        'Accept-Ranges': 'bytes',
      },
    });
  }

  const url = `${WALRUS_AGGREGATOR_URL}/v1/${blobId}`;
  const headers: HeadersInit = {
    'Accept': 'audio/mpeg',
  };

  // Add Range header if requested
  if (options?.range) {
    const { start, end } = options.range;
    headers['Range'] = `bytes=${start}${end !== undefined ? `-${end}` : '-'}`;
  }

  try {
    const response = await fetch(url, {
      headers,
    });

    if (!response.ok) {
      logger.error(
        { blobId, status: response.status, range: options?.range },
        'Failed to stream blob from Walrus'
      );
      throw new Error(`Walrus error: ${response.statusText}`);
    }

    return response;
  } catch (error) {
    logger.error({ error, blobId, range: options?.range }, 'Stream failed');
    throw error;
  }
}

/**
 * Check if Walrus is available
 * Used for health checks
 */
export async function isWalrusAvailable(): Promise<boolean> {
  if (MOCK_WALRUS) {
    return true;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(WALRUS_AGGREGATOR_URL, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok || response.status === 404; // 404 is ok, means service is up
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      logger.warn('Walrus health check timeout');
      return false;
    }
    return false;
  }
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
