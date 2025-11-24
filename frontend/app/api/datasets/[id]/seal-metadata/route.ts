import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/datasets/[id]/seal-metadata
 * Proxy to backend for storing seal metadata after blockchain publish
 *
 * Backend route: POST /api/datasets/:id/seal-metadata (requires JWT auth)
 * Stores verification metadata, file blobs, and dataset metadata in PostgreSQL
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

  if (!backendUrl) {
    console.error("[seal-metadata] NEXT_PUBLIC_BACKEND_URL not configured");
    return NextResponse.json(
      {
        error: "BACKEND_NOT_CONFIGURED",
        message:
          "Backend URL is not configured. Set NEXT_PUBLIC_BACKEND_URL environment variable.",
      },
      { status: 500 },
    );
  }

  try {
    const datasetId = params.id;
    const body = await request.json();

    // Validate request body
    if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
      console.error(
        "[seal-metadata] Invalid request body: files array missing or empty",
      );
      return NextResponse.json(
        {
          error: "INVALID_REQUEST",
          message: "files array is required and cannot be empty",
        },
        { status: 400 },
      );
    }

    // Prepare headers for backend request
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    // Forward JWT token if present (for authenticated requests)
    const authHeader = request.headers.get("Authorization");
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    console.log(
      `[seal-metadata] Proxying to backend for dataset: ${datasetId}`,
      {
        fileCount: body.files.length,
        hasVerification: !!body.verification,
        hasMetadata: !!body.metadata,
        hasAuth: !!authHeader,
      },
    );

    // Forward request to backend
    const response = await fetch(
      `${backendUrl}/api/datasets/${datasetId}/seal-metadata`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
    );

    const data = await response.json();

    // 202 Accepted = queued for background processing (success)
    // 200 OK = processed immediately (success)
    if (!response.ok && response.status !== 202) {
      console.error("[seal-metadata] Backend error:", {
        status: response.status,
        statusText: response.statusText,
        data,
        datasetId,
      });
      return NextResponse.json(data, { status: response.status });
    }

    const isQueued = response.status === 202 || data.queued;
    console.log(
      `[seal-metadata] ✅ Metadata ${isQueued ? "queued" : "stored"} for ${datasetId}`,
      {
        fileCount: body.files.length,
        isQueued,
      },
    );

    // Forward the status code (202 for queued, 200 for immediate)
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[seal-metadata] Proxy error:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      datasetId: params.id,
    });

    return NextResponse.json(
      {
        error: "PROXY_ERROR",
        message: "Failed to store seal metadata",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
