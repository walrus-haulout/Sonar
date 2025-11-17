import { NextRequest, NextResponse } from 'next/server';

// Mark as Edge Runtime
export const runtime = 'edge';
export const maxDuration = 300; // Vercel Pro max timeout

const WALRUS_PUBLISHER_URL =
  process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL ||
  'https://publisher.walrus-testnet.walrus.space';

const WALRUS_AGGREGATOR_URL =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL ||
  'https://aggregator.walrus-testnet.walrus.space';

const BLOCKBERRY_API_KEY = process.env.BLOCKBERRY_API_KEY || '';
const DEFAULT_EPOCHS = parseInt(process.env.NEXT_PUBLIC_WALRUS_DEFAULT_EPOCHS || '26', 10);

/**
 * Retry fetch with progressive delays
 * @param maxRetries Maximum number of retry attempts
 * @returns Fetch response with retry metadata
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 10
): Promise<{ response: Response; attempt: number }> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout per attempt

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { response, attempt };
      }

      // Non-200 response, retry if not the last attempt
      if (attempt < maxRetries) {
        const delayMs = attempt * 2000; // Progressive: 2s, 4s, 6s, 8s...
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }

      return { response, attempt };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // If last attempt, throw error
      if (attempt === maxRetries) {
        throw lastError;
      }

      // Retry with progressive delay
      const delayMs = attempt * 2000; // Progressive: 2s, 4s, 6s, 8s...
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError || new Error('Upload failed after all retry attempts');
}

/**
 * Edge Function: Walrus Upload Proxy
 * Streams encrypted audio blob to Walrus aggregator
 *
 * POST /api/edge/walrus/upload
 * Body: FormData with:
 *   - file: encrypted blob
 *   - seal_policy_id: Seal identity for decryption
 *   - epochs: (optional) Number of epochs to store (default: Walrus default)
 * Returns: { blobId: string, certifiedEpoch: number, retryAttempt: number }
 */
export async function POST(request: NextRequest) {
  try {
    // Parse the form data
    const formData = await request.formData();
    const file = formData.get('file');
    const sealPolicyId = formData.get('seal_policy_id');
    const epochsParam = formData.get('epochs');
    const metadataParam = formData.get('metadata'); // JSON string

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: 'No file provided or invalid file' },
        { status: 400 }
      );
    }

    if (!sealPolicyId) {
      return NextResponse.json(
        { error: 'Missing seal_policy_id' },
        { status: 400 }
      );
    }

    // Parse metadata if provided
    let metadata = null;
    if (metadataParam) {
      try {
        metadata = JSON.parse(metadataParam.toString());
      } catch (e) {
        console.warn('Failed to parse metadata:', e);
      }
    }

    // Validate file size (max 13 GiB - Walrus maximum)
    const maxSize = 13 * 1024 * 1024 * 1024; // 13 GiB
    if (file.size > maxSize) {
      const fileSizeGB = (file.size / (1024 * 1024 * 1024)).toFixed(2);
      return NextResponse.json(
        { error: `File too large (${fileSizeGB} GiB). Maximum size is 13 GiB (Walrus limit)` },
        { status: 400 }
      );
    }

    // Build Walrus URL with epochs parameter (default: 1 year = 26 epochs)
    const epochs = epochsParam ? parseInt(epochsParam.toString(), 10) : DEFAULT_EPOCHS;
    const walrusUrl = `${WALRUS_PUBLISHER_URL}/v1/blobs?epochs=${epochs}`;

    // Upload to Walrus (PUT request as per Walrus HTTP API)
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
    };

    // Add Blockberry API key if configured
    if (BLOCKBERRY_API_KEY) {
      headers['X-API-Key'] = BLOCKBERRY_API_KEY;
    }

    const { response: uploadResponse, attempt: retryAttempt } = await fetchWithRetry(
      walrusUrl,
      {
        method: 'PUT',
        body: file,
        headers,
      },
      10 // Max 10 retries
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error(`Walrus upload failed on attempt ${retryAttempt}:`, errorText);
      return NextResponse.json(
        {
          error: 'Failed to upload to Walrus',
          details: errorText,
          retryAttempt,
        },
        { status: uploadResponse.status }
      );
    }

    const walrusResult = await uploadResponse.json();

    // Walrus returns: { newlyCreated: { blobObject: { id, ... }, ... } }
    // or { alreadyCertified: { blobId, ... } }
    let blobId: string;
    let certifiedEpoch: number | undefined;

    if (walrusResult.newlyCreated) {
      blobId = walrusResult.newlyCreated.blobObject.blobId;
      certifiedEpoch = walrusResult.newlyCreated.blobObject.certifiedEpoch;
    } else if (walrusResult.alreadyCertified) {
      blobId = walrusResult.alreadyCertified.blobId;
      certifiedEpoch = walrusResult.alreadyCertified.certifiedEpoch;
    } else {
      return NextResponse.json(
        { error: 'Unexpected Walrus response format' },
        { status: 500 }
      );
    }

    // Return blobId and metadata to client
    return NextResponse.json({
      blobId,
      certifiedEpoch,
      fileSize: file.size,
      seal_policy_id: sealPolicyId,
      strategy: 'blockberry', // Current upload strategy
      retryAttempt, // Include which attempt succeeded
      ...(metadata && { metadata }), // Include metadata if provided
    });
  } catch (error) {
    console.error('Walrus upload error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET method for health check
 */
export async function GET() {
  try {
    // Check if Walrus aggregator is accessible
    const response = await fetch(`${WALRUS_AGGREGATOR_URL}/v1/health`, {
      method: 'GET',
    });

    if (response.ok) {
      return NextResponse.json({
        status: 'healthy',
        aggregator: WALRUS_AGGREGATOR_URL,
      });
    }

    return NextResponse.json(
      {
        status: 'unhealthy',
        aggregator: WALRUS_AGGREGATOR_URL,
      },
      { status: 503 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
