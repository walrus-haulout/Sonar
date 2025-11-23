import { NextRequest, NextResponse } from "next/server";
import {
  WALRUS_PUBLISHER_URL,
  WALRUS_AGGREGATOR_URL,
} from "@/lib/walrus/config";

// Mark as Edge Runtime
export const runtime = "edge";

const BLOCKBERRY_API_KEY = process.env.BLOCKBERRY_API_KEY || "";

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
    const file = formData.get("file");
    const epochsParam = formData.get("epochs");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "No file provided or invalid file" },
        { status: 400 },
      );
    }

    // Preview should be smaller (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          error: `Preview file too large. Maximum size is ${maxSize / (1024 * 1024)}MB`,
        },
        { status: 400 },
      );
    }

    // Build Walrus URL with optional epochs parameter
    const epochs = epochsParam ? parseInt(epochsParam.toString(), 10) : null;
    const walrusUrl =
      epochs && epochs > 0
        ? `${WALRUS_PUBLISHER_URL}/v1/blobs?epochs=${epochs}`
        : `${WALRUS_PUBLISHER_URL}/v1/blobs`;

    // Upload to Walrus
    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
    };

    // Add Blockberry API key if configured
    if (BLOCKBERRY_API_KEY) {
      headers["X-API-Key"] = BLOCKBERRY_API_KEY;
    }

    const uploadResponse = await fetch(walrusUrl, {
      method: "PUT",
      body: file,
      headers,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("Walrus preview upload failed:", errorText);
      return NextResponse.json(
        {
          error: "Failed to upload preview to Walrus",
          details: errorText,
        },
        { status: uploadResponse.status },
      );
    }

    const walrusResult = await uploadResponse.json();

    // Extract blobId and metadata
    let previewBlobId: string;
    let blobObjectId: string | undefined; // On-chain Sui object ID
    let registeredEpoch: number | undefined;
    let storageId: string | undefined;
    let encodingType: string | undefined;
    let deletable: boolean | undefined;
    let certifiedEpoch: number | undefined;

    if (walrusResult.newlyCreated) {
      const blobObject = walrusResult.newlyCreated.blobObject;
      previewBlobId = blobObject.blobId;
      blobObjectId = blobObject.id; // On-chain object ID
      registeredEpoch = blobObject.registeredEpoch;
      storageId = blobObject.storage?.id;
      encodingType = blobObject.encodingType;
      deletable = blobObject.deletable;
      certifiedEpoch = blobObject.certifiedEpoch;
    } else if (walrusResult.alreadyCertified) {
      previewBlobId = walrusResult.alreadyCertified.blobId;
      blobObjectId = walrusResult.alreadyCertified.blobId; // For already certified, use blobId
      certifiedEpoch = walrusResult.alreadyCertified.certifiedEpoch;
    } else {
      return NextResponse.json(
        { error: "Unexpected Walrus response format" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      previewBlobId,
      blobObjectId, // On-chain Sui object ID for verification
      registeredEpoch, // Proof of on-chain registration
      fileSize: file.size,
      storageId,
      encodingType,
      deletable,
      certifiedEpoch,
    });
  } catch (error) {
    console.error("Walrus preview upload error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

/**
 * Edge Function: Walrus Preview Proxy
 * Streams preview audio blobs via CDN-friendly caching headers
 *
 * GET /api/edge/walrus/preview?blobId=<preview_blob_id>
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const blobId = searchParams.get("blobId");

  if (!blobId) {
    return NextResponse.json({ error: "Missing blobId" }, { status: 400 });
  }

  try {
    const walrusUrl = `${WALRUS_AGGREGATOR_URL}/v1/${blobId}`;
    const response = await fetch(walrusUrl);

    if (!response.ok || !response.body) {
      const details = response.statusText || `HTTP ${response.status}`;
      console.error(
        `[WalrusPreview] Failed to fetch blob ${blobId}: ${details}`,
      );
      return NextResponse.json(
        { error: "Failed to fetch preview from Walrus", details },
        { status: response.status },
      );
    }

    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "audio/mpeg",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=300",
        "Access-Control-Allow-Origin": "*",
        "X-Preview-Blob-Id": blobId,
      },
    });
  } catch (error) {
    console.error("[WalrusPreview] Error fetching blob:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
