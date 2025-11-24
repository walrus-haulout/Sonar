import { NextRequest, NextResponse } from "next/server";
import { buildVerifierUrl } from "@/lib/config/verifier";

/**
 * Server-side proxy for audio-verifier service polling
 *
 * SECURITY: Keeps VERIFIER_AUTH_TOKEN server-side.
 */

// Explicitly set Node.js runtime for server-side operations
export const runtime = "nodejs";

// Force dynamic rendering to ensure route is always treated as a serverless function
export const dynamic = "force-dynamic";
export const revalidate = 0;

const VERIFIER_AUTH_TOKEN = process.env.VERIFIER_AUTH_TOKEN;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    console.log(`[${requestId}] [GET] /api/verify/[id] - Request received`, {
      url: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
    });

    if (!VERIFIER_AUTH_TOKEN) {
      console.error(`[${requestId}] VERIFIER_AUTH_TOKEN not configured`, {
        nodeEnv: process.env.NODE_ENV,
        envKeys: Object.keys(process.env).filter(
          (k) => k.includes("VERIFIER") || k.includes("AUDIO"),
        ),
      });

      return NextResponse.json(
        {
          error: "VERIFIER_AUTH_TOKEN not configured on server",
          requestId,
          timestamp: new Date().toISOString(),
        },
        { status: 500 },
      );
    }

    console.log(`[${requestId}] Extracting params`);
    const { id } = await params;
    console.log(`[${requestId}] Verification ID: ${id}`);

    if (!id) {
      console.error(`[${requestId}] Missing verification ID in params`);
      return NextResponse.json(
        {
          error: "Missing verification ID",
          requestId,
          timestamp: new Date().toISOString(),
        },
        { status: 400 },
      );
    }

    const verifierUrl = buildVerifierUrl(`verify/${id}`);
    console.log(`[${requestId}] Fetching from verifier service`, {
      id,
    });

    // Forward to audio-verifier service with server-side auth token
    const fetchStartTime = Date.now();
    const response = await fetch(verifierUrl, {
      headers: {
        Authorization: `Bearer ${VERIFIER_AUTH_TOKEN}`,
      },
    });

    const fetchDuration = Date.now() - fetchStartTime;
    console.log(`[${requestId}] Verifier service response received`, {
      status: response.status,
      ok: response.ok,
      fetchDuration,
    });

    if (!response.ok) {
      let errorData;
      try {
        const text = await response.text();
        console.log(`[${requestId}] Error response body:`, text);
        errorData = JSON.parse(text);
      } catch (parseError) {
        console.error(`[${requestId}] Failed to parse error response`, {
          parseError:
            parseError instanceof Error ? parseError.message : "Unknown",
        });
        errorData = {
          detail: "Unknown error",
          rawResponse: await response.text().catch(() => ""),
        };
      }

      console.error(`[${requestId}] Verifier service returned error`, {
        status: response.status,
        errorData,
        duration: Date.now() - startTime,
      });

      return NextResponse.json(
        {
          error:
            errorData.detail ||
            errorData.error ||
            "Failed to get verification status",
          requestId,
          status: response.status,
          timestamp: new Date().toISOString(),
        },
        { status: response.status },
      );
    }

    console.log(`[${requestId}] Parsing successful response`);
    const data = await response.json();
    console.log(`[${requestId}] [GET] /api/verify/[id] - Response sent`, {
      status: 200,
      hasData: !!data,
      dataKeys: data ? Object.keys(data) : [],
      duration: Date.now() - startTime,
    });

    return NextResponse.json(data);
  } catch (error: any) {
    const errorDetails = {
      requestId,
      error: {
        message: error.message || "Unknown error",
        name: error.name || "Error",
        stack: error.stack,
        cause: error.cause,
      },
      request: {
        url: request.url,
        method: request.method,
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
      },
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };

    console.error(
      `[${requestId}] [GET] /api/verify/[id] - Request failed`,
      errorDetails,
    );

    // Provide more detailed error information
    const errorMessage = error.message || "Failed to get verification status";
    const errorResponse = {
      error: errorMessage,
      detail: errorMessage,
      requestId,
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV === "development"
        ? {
            stack: error.stack,
            name: error.name,
            cause: error.cause,
          }
        : {}),
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}
