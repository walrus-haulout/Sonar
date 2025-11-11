import { NextRequest, NextResponse } from 'next/server';

// Mark as Edge Runtime
export const runtime = 'edge';

const WALRUS_PUBLISHER_URL =
  process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL ||
  'https://publisher.walrus-testnet.walrus.space';

const WALRUS_AGGREGATOR_URL =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL ||
  'https://aggregator.walrus-testnet.walrus.space';

const BLOCKBERRY_API_KEY = process.env.BLOCKBERRY_API_KEY || '';

/**
 * Edge Function: Walrus Preview Upload
 * Uploads a smaller preview blob (public, unencrypted)
 *
 * POST /api/edge/walrus/preview
 * Body: FormData with 'file' field (preview audio - first 30s)
 *                        'epochs' field (optional) - number of epochs to store
 * Returns: { previewBlobId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const epochsParam = formData.get('epochs');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: 'No file provided or invalid file' },
        { status: 400 }
      );
    }

    // Preview should be smaller (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `Preview file too large. Maximum size is ${maxSize / (1024 * 1024)}MB` },
        { status: 400 }
      );
    }

    // Build Walrus URL with optional epochs parameter
    const epochs = epochsParam ? parseInt(epochsParam.toString(), 10) : null;
    const walrusUrl = epochs && epochs > 0
      ? `${WALRUS_PUBLISHER_URL}/v1/blobs?epochs=${epochs}`
      : `${WALRUS_PUBLISHER_URL}/v1/blobs`;

    // Upload to Walrus
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
    };

    // Add Blockberry API key if configured
    if (BLOCKBERRY_API_KEY) {
      headers['X-API-Key'] = BLOCKBERRY_API_KEY;
    }

    const uploadResponse = await fetch(walrusUrl, {
      method: 'PUT',
      body: file,
      headers,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('Walrus preview upload failed:', errorText);
      return NextResponse.json(
        {
          error: 'Failed to upload preview to Walrus',
          details: errorText,
        },
        { status: uploadResponse.status }
      );
    }

    const walrusResult = await uploadResponse.json();

    // Extract blobId
    let previewBlobId: string;

    if (walrusResult.newlyCreated) {
      previewBlobId = walrusResult.newlyCreated.blobObject.blobId;
    } else if (walrusResult.alreadyCertified) {
      previewBlobId = walrusResult.alreadyCertified.blobId;
    } else {
      return NextResponse.json(
        { error: 'Unexpected Walrus response format' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      previewBlobId,
      fileSize: file.size,
    });
  } catch (error) {
    console.error('Walrus preview upload error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
