import { NextRequest, NextResponse } from 'next/server';

// Mark as Edge Runtime
export const runtime = 'edge';

const WALRUS_AGGREGATOR_URL =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL ||
  'https://aggregator.walrus.space';

/**
 * Edge Function: Walrus Blob Proxy
 * Proxies audio blob streaming from Walrus with CDN caching
 *
 * GET /api/edge/walrus/proxy/[blobId]
 * Returns: Streaming audio response with cache headers
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ blobId: string }> }
) {
  const { blobId } = await params;

  if (!blobId) {
    return NextResponse.json({ error: 'Missing blobId' }, { status: 400 });
  }

  try {
    // Fetch from Walrus aggregator
    const response = await fetch(`${WALRUS_AGGREGATOR_URL}/v1/blobs/${blobId}`);

    if (!response.ok) {
      console.error(`[WalrusProxy] Failed to fetch blob ${blobId}:`, response.statusText);
      return NextResponse.json(
        { error: 'Failed to fetch from Walrus', details: response.statusText },
        { status: response.status }
      );
    }

    // Stream response with CDN cache headers
    return new NextResponse(response.body, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400, immutable', // 24h CDN cache
        'Access-Control-Allow-Origin': '*', // CORS for audio playback
        'X-Blob-Id': blobId,
      },
    });
  } catch (error) {
    console.error('[WalrusProxy] Error fetching blob:', error);
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
 * OPTIONS handler for CORS
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
