import { NextRequest, NextResponse } from 'next/server';
import { buildVerifierUrl } from '@/lib/config/verifier';

/**
 * Server-side proxy for audio-verifier feedback submission
 *
 * SECURITY: Keeps VERIFIER_AUTH_TOKEN server-side.
 */

// Explicitly set Node.js runtime for server-side operations
export const runtime = 'nodejs';

// Force dynamic rendering to ensure route is always treated as a serverless function
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VERIFIER_AUTH_TOKEN = process.env.VERIFIER_AUTH_TOKEN;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    console.log(
      `[${requestId}] [POST] /api/verify/[id]/feedback - Request received`,
      {
        url: request.url,
        method: request.method,
        headers: {
          'user-agent': request.headers.get('user-agent'),
          'origin': request.headers.get('origin'),
          'referer': request.headers.get('referer'),
          'content-type': request.headers.get('content-type'),
        },
        timestamp: new Date().toISOString(),
        runtime: 'nodejs',
        hasVerifierToken: !!VERIFIER_AUTH_TOKEN,
        verifierUrl: process.env.AUDIO_VERIFIER_URL || 'default',
      }
    );

    if (!VERIFIER_AUTH_TOKEN) {
      console.error(`[${requestId}] VERIFIER_AUTH_TOKEN not configured`, {
        nodeEnv: process.env.NODE_ENV,
        envKeys: Object.keys(process.env).filter(
          (k) => k.includes('VERIFIER') || k.includes('AUDIO')
        ),
      });

      return NextResponse.json(
        {
          error: 'VERIFIER_AUTH_TOKEN not configured on server',
          requestId,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    console.log(`[${requestId}] Extracting params`);
    const { id } = await params;
    console.log(`[${requestId}] Verification ID: ${id}`);

    if (!id) {
      console.error(`[${requestId}] Missing verification ID in params`);
      return NextResponse.json(
        {
          error: 'Missing verification ID',
          requestId,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // Parse request body
    console.log(`[${requestId}] Parsing request body`);
    let feedbackData;
    try {
      feedbackData = await request.json();
    } catch (parseError) {
      console.error(`[${requestId}] Failed to parse request body`, {
        error: parseError instanceof Error ? parseError.message : 'Unknown',
      });
      return NextResponse.json(
        {
          error: 'Invalid request body',
          requestId,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    console.log(`[${requestId}] Feedback data received`, {
      hasVote: !!feedbackData.vote,
      hasFeedbackText: !!feedbackData.feedback_text,
      hasWalletAddress: !!feedbackData.wallet_address,
    });

    if (!feedbackData.vote || !feedbackData.wallet_address) {
      console.error(`[${requestId}] Missing required fields`, {
        vote: feedbackData.vote,
        wallet_address: feedbackData.wallet_address,
      });
      return NextResponse.json(
        {
          error: 'Missing required fields: vote and wallet_address',
          requestId,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const verifierUrl = buildVerifierUrl(`verify/${id}/feedback`);
    console.log(`[${requestId}] Forwarding to verifier service`, {
      url: verifierUrl,
      id,
      vote: feedbackData.vote,
      hasAuthToken: !!VERIFIER_AUTH_TOKEN,
    });

    // Forward to audio-verifier service with server-side auth token
    const fetchStartTime = Date.now();
    const response = await fetch(verifierUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VERIFIER_AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(feedbackData),
    });

    const fetchDuration = Date.now() - fetchStartTime;
    console.log(`[${requestId}] Verifier service response received`, {
      status: response.status,
      statusText: response.statusText,
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
            parseError instanceof Error ? parseError.message : 'Unknown',
        });
        errorData = {
          detail: 'Unknown error',
          rawResponse: await response.text().catch(() => ''),
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
            errorData.detail || errorData.error || 'Failed to submit feedback',
          requestId,
          status: response.status,
          timestamp: new Date().toISOString(),
        },
        { status: response.status }
      );
    }

    console.log(`[${requestId}] Parsing successful response`);
    const data = await response.json();
    console.log(`[${requestId}] [POST] /api/verify/[id]/feedback - Response sent`, {
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
        message: error.message || 'Unknown error',
        name: error.name || 'Error',
        stack: error.stack,
        cause: error.cause,
      },
      request: {
        url: request.url,
        method: request.method,
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        hasVerifierToken: !!VERIFIER_AUTH_TOKEN,
        verifierUrl: process.env.AUDIO_VERIFIER_URL || 'default',
      },
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };

    console.error(
      `[${requestId}] [POST] /api/verify/[id]/feedback - Request failed`,
      errorDetails
    );

    // Provide more detailed error information
    const errorMessage = error.message || 'Failed to submit feedback';
    const errorResponse = {
      error: errorMessage,
      detail: errorMessage,
      requestId,
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV === 'development'
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
