import { NextRequest, NextResponse } from 'next/server';
import { proxyVerifyRequest } from '@/lib/server/verifyProxy';

/**
 * Server-side proxy for audio-verifier service
 *
 * SECURITY: Keeps VERIFIER_AUTH_TOKEN server-side and never exposes it to the browser.
 * The browser calls this endpoint, which then proxies to the audio-verifier service
 * with the auth token.
 */

// Use Edge runtime for better performance and compatibility
export const runtime = 'edge';

// Force dynamic rendering to ensure route is always treated as a serverless function
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Health check endpoint
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    console.log(`[${requestId}] [GET] /api/verify - Health check requested`, {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      timestamp: new Date().toISOString(),
    });

    const response = NextResponse.json(
      {
        status: 'ok',
        route: '/api/verify',
        requestId,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );

    console.log(`[${requestId}] [GET] /api/verify - Health check completed`, {
      status: 200,
      duration: Date.now() - startTime,
    });

    return response;
  } catch (error: any) {
    console.error(`[${requestId}] [GET] /api/verify - Health check failed`, {
      error: error.message,
      stack: error.stack,
      name: error.name,
      cause: error.cause,
      duration: Date.now() - startTime,
    });

    return NextResponse.json(
      {
        error: 'Health check failed',
        detail: error.message,
        requestId,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    console.log(`[${requestId}] [POST] /api/verify - Request received`, {
      url: request.url,
      method: request.method,
      headers: {
        'content-type': request.headers.get('content-type'),
        'user-agent': request.headers.get('user-agent'),
        'origin': request.headers.get('origin'),
        'referer': request.headers.get('referer'),
      },
      timestamp: new Date().toISOString(),
      runtime: 'nodejs',
      hasVerifierToken: !!process.env.VERIFIER_AUTH_TOKEN,
      verifierUrl: process.env.AUDIO_VERIFIER_URL || 'default',
    });

    const contentType = request.headers.get('content-type') || '';
    console.log(`[${requestId}] Content-Type: ${contentType}`);

    // Check if request is JSON (encrypted blob flow) or FormData (legacy flow)
    if (contentType.includes('application/json')) {
      console.log(`[${requestId}] Processing JSON payload flow`);

      try {
        const payload = await request.json();
        console.log(`[${requestId}] JSON payload parsed successfully`, {
          hasWalrusBlobId: !!payload.walrusBlobId,
          hasSealIdentity: !!payload.sealIdentity,
          hasEncryptedObjectBcsHex: !!payload.encryptedObjectBcsHex,
          hasMetadata: !!payload.metadata,
          payloadKeys: Object.keys(payload),
        });

        console.log(`[${requestId}] Calling proxyVerifyRequest with JSON mode`);
        const result = await proxyVerifyRequest({
          body: {
            mode: 'json',
            payload,
          },
        });

        console.log(`[${requestId}] proxyVerifyRequest completed`, {
          status: result.status,
          ok: result.ok,
          hasData: !!result.data,
          dataKeys: result.data ? Object.keys(result.data) : [],
          duration: Date.now() - startTime,
        });

        const response = NextResponse.json(result.data, { status: result.status });
        console.log(`[${requestId}] [POST] /api/verify - Response sent`, {
          status: result.status,
          duration: Date.now() - startTime,
        });

        return response;

      } catch (jsonError: any) {
        console.error(`[${requestId}] JSON parsing/proxy error`, {
          error: jsonError.message,
          stack: jsonError.stack,
          name: jsonError.name,
          cause: jsonError.cause,
          duration: Date.now() - startTime,
        });
        throw jsonError;
      }

    } else {
      console.log(`[${requestId}] Processing FormData payload flow`);

      try {
        const formData = await request.formData();
        const formDataKeys = Array.from(formData.keys());
        console.log(`[${requestId}] FormData parsed successfully`, {
          keys: formDataKeys,
          hasFile: formData.has('file'),
          hasMetadata: formData.has('metadata'),
        });

        console.log(`[${requestId}] Calling proxyVerifyRequest with FormData mode`);
        const result = await proxyVerifyRequest({
          body: {
            mode: 'formData',
            payload: formData,
          },
        });

        console.log(`[${requestId}] proxyVerifyRequest completed`, {
          status: result.status,
          ok: result.ok,
          hasData: !!result.data,
          duration: Date.now() - startTime,
        });

        const response = NextResponse.json(result.data, { status: result.status });
        console.log(`[${requestId}] [POST] /api/verify - Response sent`, {
          status: result.status,
          duration: Date.now() - startTime,
        });

        return response;

      } catch (formDataError: any) {
        console.error(`[${requestId}] FormData parsing/proxy error`, {
          error: formDataError.message,
          stack: formDataError.stack,
          name: formDataError.name,
          cause: formDataError.cause,
          duration: Date.now() - startTime,
        });
        throw formDataError;
      }
    }

  } catch (error: any) {
    const errorDetails = {
      requestId,
      error: {
        message: error.message || 'Unknown error',
        name: error.name || 'Error',
        stack: error.stack,
        cause: error.cause,
      },
      request: {
        url: request.url,
        method: request.method,
        contentType: request.headers.get('content-type'),
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        hasVerifierToken: !!process.env.VERIFIER_AUTH_TOKEN,
        verifierUrl: process.env.AUDIO_VERIFIER_URL || 'default',
      },
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };

    console.error(`[${requestId}] [POST] /api/verify - Request failed`, errorDetails);

    // Provide more detailed error information
    const errorMessage = error.message || 'Failed to start verification';
    const errorResponse = {
      error: errorMessage,
      detail: errorMessage,
      requestId,
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV === 'development' ? {
        stack: error.stack,
        name: error.name,
        cause: error.cause,
      } : {}),
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}
