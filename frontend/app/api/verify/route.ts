import { NextRequest, NextResponse } from 'next/server';
import { proxyVerifyRequest } from '@/lib/server/verifyProxy';

/**
 * Server-side proxy for audio-verifier service
 *
 * SECURITY: Keeps VERIFIER_AUTH_TOKEN server-side and never exposes it to the browser.
 * The browser calls this endpoint, which then proxies to the audio-verifier service
 * with the auth token.
 */

// Explicitly set Node.js runtime for server-side operations
export const runtime = 'nodejs';

// Force dynamic rendering to ensure route is always treated as a serverless function
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    // Check if request is JSON (encrypted blob flow) or FormData (legacy flow)
    if (contentType.includes('application/json')) {
      // New encrypted blob flow - JSON payload
      const payload = await request.json();
      const result = await proxyVerifyRequest({
        body: {
          mode: 'json',
          payload,
        },
      });
      return NextResponse.json(result.data, { status: result.status });

    } else {
      // Legacy FormData flow (for backwards compatibility)
      const formData = await request.formData();
      const result = await proxyVerifyRequest({
        body: {
          mode: 'formData',
          payload: formData,
        },
      });
      return NextResponse.json(result.data, { status: result.status });
    }

  } catch (error: any) {
    console.error('Failed to proxy verification request:', error);
    
    // Provide more detailed error information
    const errorMessage = error.message || 'Failed to start verification';
    const errorDetails = error.cause ? { cause: error.cause } : {};
    
    return NextResponse.json(
      { 
        error: errorMessage,
        detail: errorMessage,
        ...errorDetails
      },
      { status: 500 }
    );
  }
}
