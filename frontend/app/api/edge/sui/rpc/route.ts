import { NextRequest, NextResponse } from "next/server";

// Mark as Edge Runtime for low latency
export const runtime = "edge";
export const maxDuration = 60; // 60 seconds max

// Server-side RPC URL (not exposed to browser)
const SUI_RPC_URL =
  process.env.SUI_RPC_URL || "https://fullnode.mainnet.sui.io:443";

/**
 * Edge Function: Sui RPC Proxy
 * Forwards JSON-RPC calls to Sui fullnode to avoid CORS issues in browser
 *
 * POST /api/edge/sui/rpc
 * Body: JSON-RPC request (e.g., { jsonrpc: "2.0", method: "sui_getTransactionBlock", params: [...], id: 1 })
 * Returns: JSON-RPC response from Sui fullnode
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    // Parse JSON-RPC request
    const body = await request.json();

    // Basic validation: must be valid JSON-RPC
    if (!body.jsonrpc || !body.method || body.id === undefined) {
      console.warn("[Sui RPC Proxy] Invalid JSON-RPC request:", {
        hasJsonrpc: !!body.jsonrpc,
        hasMethod: !!body.method,
        hasId: body.id !== undefined,
      });
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: body.id || null,
          error: {
            code: -32600,
            message: "Invalid JSON-RPC request",
          },
        },
        { status: 400 },
      );
    }

    console.log(`[Sui RPC Proxy] [${requestId}] Forwarding request:`, {
      method: body.method,
      id: body.id,
      hasParams: !!body.params,
      paramsLength: Array.isArray(body.params) ? body.params.length : 0,
    });

    // Forward to Sui RPC with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const rpcResponse = await fetch(SUI_RPC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log(`[Sui RPC Proxy] [${requestId}] Response received:`, {
      status: rpcResponse.status,
      ok: rpcResponse.ok,
      method: body.method,
    });

    if (!rpcResponse.ok) {
      const errorText = await rpcResponse.text();
      console.error(`[Sui RPC Proxy] [${requestId}] RPC error:`, {
        status: rpcResponse.status,
        error: errorText,
        method: body.method,
      });

      return NextResponse.json(
        {
          jsonrpc: "2.0",
          id: body.id,
          error: {
            code: rpcResponse.status,
            message: `RPC request failed: ${errorText}`,
          },
        },
        { status: rpcResponse.status },
      );
    }

    const rpcResult = await rpcResponse.json();

    // Return JSON-RPC response with CORS headers
    return NextResponse.json(rpcResult, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.name === "AbortError" ||
        error.message.includes("aborted") ||
        error.message.includes("timeout"));

    console.error(`[Sui RPC Proxy] [${requestId}] Error:`, {
      error: error instanceof Error ? error.message : String(error),
      isTimeout,
    });

    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: isTimeout ? -32603 : -32603,
          message: isTimeout
            ? "RPC request timeout"
            : error instanceof Error
              ? error.message
              : "Internal error",
        },
      },
      {
        status: isTimeout ? 504 : 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      },
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
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400", // 24 hours
    },
  });
}

/**
 * GET handler for health check
 */
export async function GET() {
  try {
    // Check if Sui RPC is accessible
    const response = await fetch(SUI_RPC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sui_getChainIdentifier",
        params: [],
      }),
    });

    if (response.ok) {
      const result = await response.json();
      return NextResponse.json({
        status: "healthy",
        rpcUrl: SUI_RPC_URL,
        chainId: result.result,
      });
    }

    return NextResponse.json(
      {
        status: "unhealthy",
        rpcUrl: SUI_RPC_URL,
        error: `RPC returned ${response.status}`,
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
