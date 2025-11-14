import { NextRequest, NextResponse } from 'next/server';
import { buildVerifierUrl } from '@/lib/config/verifier';

/**
 * Server-side proxy for audio-verifier service polling
 *
 * SECURITY: Keeps VERIFIER_AUTH_TOKEN server-side.
 */

// Explicitly set Node.js runtime for server-side operations
export const runtime = 'nodejs';

const VERIFIER_AUTH_TOKEN = process.env.VERIFIER_AUTH_TOKEN;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!VERIFIER_AUTH_TOKEN) {
    return NextResponse.json(
      { error: 'VERIFIER_AUTH_TOKEN not configured on server' },
      { status: 500 }
    );
  }

  const { id } = await params;

  try {
    // Forward to audio-verifier service with server-side auth token
    const response = await fetch(buildVerifierUrl(`verify/${id}`), {
      headers: {
        'Authorization': `Bearer ${VERIFIER_AUTH_TOKEN}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      return NextResponse.json(
        { error: error.detail || 'Failed to get verification status' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('Failed to get verification status:', error);
    
    // Provide more detailed error information
    const errorMessage = error.message || 'Failed to get verification status';
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
