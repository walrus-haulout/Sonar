import { NextRequest, NextResponse } from "next/server";

// Mark as Edge Runtime
export const runtime = "edge";
export const maxDuration = 300; // Vercel Pro max timeout (5 minutes)

const WALRUS_PUBLISHER_URL = process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL!;
const WALRUS_AGGREGATOR_URL = process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL!;

if (!WALRUS_PUBLISHER_URL || !WALRUS_AGGREGATOR_URL) {
  throw new Error("Missing Walrus environment variables");
}

const BLOCKBERRY_API_KEY = process.env.BLOCKBERRY_API_KEY || "";
const DEFAULT_EPOCHS = parseInt(
  process.env.NEXT_PUBLIC_WALRUS_DEFAULT_EPOCHS || "26",
  10,
);

/**
 * Edge Function: Walrus Upload Proxy
 * Proxies encrypted audio blob uploads to Walrus publisher to bypass CORS restrictions
 *
 * POST /api/edge/walrus/upload
 * Body: FormData with:
 *   - file: encrypted blob
 *   - seal_policy_id: Seal identity for decryption
 *   - epochs: (optional) Number of epochs to store (default: 26)
 * Returns: { blobId: string, certifiedEpoch: number, size: number, encodingType: string, storageId: string, deletable: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    // Parse the form data
    const formData = await request.formData();
    const file = formData.get("file");
    const sealPolicyId = formData.get("seal_policy_id");
    const epochsParam = formData.get("epochs");
    const metadataParam = formData.get("metadata"); // JSON string

    // Log incoming request for debugging
    console.log("[Walrus Upload API] Received request:", {
      hasFile: !!file,
      isBlob: file instanceof Blob,
      fileSize: file instanceof Blob ? file.size : "N/A",
      fileSizeMB:
        file instanceof Blob ? (file.size / (1024 * 1024)).toFixed(2) : "N/A",
      hasSealPolicyId: !!sealPolicyId,
      sealPolicyIdPreview: sealPolicyId
        ? `${String(sealPolicyId).substring(0, 20)}...`
        : "N/A",
      epochs: epochsParam || "default",
      hasMetadata: !!metadataParam,
      walrusPublisherUrl: WALRUS_PUBLISHER_URL,
      hasBlockberryKey: !!BLOCKBERRY_API_KEY,
    });

    if (!file || !(file instanceof Blob)) {
      console.warn(
        "[Walrus Upload API] Validation failed: No file or invalid file type",
      );
      return NextResponse.json(
        { error: "No file provided or invalid file" },
        { status: 400 },
      );
    }

    if (!sealPolicyId) {
      console.warn(
        "[Walrus Upload API] Validation failed: Missing seal_policy_id",
      );
      return NextResponse.json(
        { error: "Missing seal_policy_id" },
        { status: 400 },
      );
    }

    // Parse metadata if provided
    let metadata = null;
    if (metadataParam) {
      try {
        metadata = JSON.parse(metadataParam.toString());
      } catch (e) {
        console.warn("[Walrus Upload API] Failed to parse metadata:", e);
      }
    }

    // Validate file size (1GB MVP limit)
    const maxSize = 1 * 1024 * 1024 * 1024; // 1 GiB
    if (file.size > maxSize) {
      const fileSizeGB = (file.size / (1024 * 1024 * 1024)).toFixed(2);
      console.warn("[Walrus Upload API] Validation failed: File too large", {
        actualSizeGB: fileSizeGB,
        maxSizeGB: "1",
      });
      return NextResponse.json(
        {
          error: `File too large (${fileSizeGB} GiB). Maximum size is 1 GiB for MVP`,
        },
        { status: 400 },
      );
    }

    console.log(
      "[Walrus Upload API] Validation passed, forwarding to Walrus publisher",
    );

    // Build Walrus URL with epochs parameter (default: 1 year = 26 epochs)
    const epochs = epochsParam
      ? parseInt(epochsParam.toString(), 10)
      : DEFAULT_EPOCHS;
    const walrusUrl = `${WALRUS_PUBLISHER_URL}/v1/blobs?epochs=${epochs}`;

    // Upload to Walrus (PUT request as per Walrus HTTP API)
    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
    };

    // Add Blockberry API key if configured
    if (BLOCKBERRY_API_KEY) {
      headers["X-API-Key"] = BLOCKBERRY_API_KEY;
    }

    // Single upload attempt with 240s timeout (4 minutes)
    // Client handles retries if this fails
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 240000); // 240s = 4 minutes

    console.log("[Walrus Upload] Starting upload with 240s timeout...", {
      url: walrusUrl.split("?")[0],
      size: file.size,
      epochs,
    });

    const uploadResponse = await fetch(walrusUrl, {
      method: "PUT",
      body: file,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();

      // Try to parse error as JSON for better diagnostics
      let parsedError: any = null;
      try {
        parsedError = JSON.parse(errorText);
      } catch {
        // Not JSON, use raw text
      }

      const errorDetails =
        parsedError?.error || parsedError?.details || errorText;

      // Extract response headers for debugging
      const responseHeaders: Record<string, string> = {};
      uploadResponse.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      console.error("[Walrus Upload] Failed:", {
        status: uploadResponse.status,
        statusText: uploadResponse.statusText,
        error: errorDetails,
        fullResponse: parsedError || errorText,
        walrusUrl: walrusUrl.split("?")[0],
        hasBlockberryKey: !!BLOCKBERRY_API_KEY,
        responseHeaders,
        fileSize: file.size,
        fileSizeMB: (file.size / (1024 * 1024)).toFixed(2),
      });

      return NextResponse.json(
        {
          error: "Failed to upload to Walrus",
          details: errorDetails,
          status: uploadResponse.status,
        },
        { status: uploadResponse.status },
      );
    }

    console.log(
      "[Walrus Upload] Successfully uploaded blob to Walrus publisher",
    );

    const walrusResult = await uploadResponse.json();

    // Walrus returns: { newlyCreated: { blobObject: { id, blobId, encodingType, storage: { id, ... }, deletable, ... }, ... } }
    // or { alreadyCertified: { blobId, ... } }
    let blobId: string;
    let certifiedEpoch: number | undefined;
    let encodingType: string | undefined;
    let storageId: string | undefined;
    let deletable: boolean | undefined;

    if (walrusResult.newlyCreated) {
      const blobObject = walrusResult.newlyCreated.blobObject;
      blobId = blobObject.blobId;
      certifiedEpoch = blobObject.certifiedEpoch;
      encodingType = blobObject.encodingType;
      storageId = blobObject.storage?.id;
      deletable = blobObject.deletable;

      console.log("[Walrus] Extracted blob metadata:", {
        blobId,
        encodingType,
        storageId,
        deletable,
        certifiedEpoch,
      });
    } else if (walrusResult.alreadyCertified) {
      blobId = walrusResult.alreadyCertified.blobId;
      certifiedEpoch = walrusResult.alreadyCertified.certifiedEpoch;
      console.log("[Walrus] Already certified blob, limited metadata");
    } else {
      return NextResponse.json(
        { error: "Unexpected Walrus response format" },
        { status: 500 },
      );
    }

    // Return blobId and complete metadata to client for sponsored transactions
    return NextResponse.json({
      blobId,
      certifiedEpoch,
      size: file.size,
      encodingType,
      storageId,
      deletable,
      seal_policy_id: sealPolicyId,
      strategy: "blockberry", // Current upload strategy
      ...(metadata && { metadata }), // Include metadata if provided
    });
  } catch (error) {
    const isTimeout = error instanceof Error &&
      (error.name === 'AbortError' ||
        error.message.includes('aborted') ||
        error.message.includes('timeout'));

    console.error("[Walrus Upload] Error:", {
      error: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : 'unknown',
      isTimeout,
    });

    return NextResponse.json(
      {
        error: isTimeout
          ? "Upload timeout - file may be too large or network is slow"
          : "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
        isTimeout,
      },
      { status: isTimeout ? 504 : 500 },
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
      method: "GET",
    });

    if (response.ok) {
      return NextResponse.json({
        status: "healthy",
        aggregator: WALRUS_AGGREGATOR_URL,
      });
    }

    return NextResponse.json(
      {
        status: "unhealthy",
        aggregator: WALRUS_AGGREGATOR_URL,
      },
      { status: 503 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
