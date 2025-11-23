import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  const testUrl =
    "https://walrus-mainnet-publisher-1.staketab.org:443/v1/blobs?epochs=1";
  const startTime = Date.now();

  try {
    console.log("[Test] Attempting to reach Staketab...");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(testUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
      },
      body: "test",
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const duration = Date.now() - startTime;

    const result = await response.text();

    return NextResponse.json({
      success: true,
      status: response.status,
      duration,
      responsePreview: result.substring(0, 500),
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return NextResponse.json({
      success: false,
      error: error.message,
      duration,
      isTimeout: error.name === "AbortError",
    });
  }
}
