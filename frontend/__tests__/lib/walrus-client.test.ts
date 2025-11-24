/**
 * Unit tests for Walrus blob verification
 * Ensures env-driven aggregator configuration and proper retry logic
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";

describe("Walrus Client - getAggregatorList", () => {
  it("should include official fallback aggregators", async () => {
    const { getAggregatorList } = await import("../../lib/walrus/client");
    const aggregators = getAggregatorList();

    expect(aggregators).toContain("https://aggregator.walrus.space");
    expect(aggregators).toContain(
      "https://wal-aggregator-mainnet.staketab.org",
    );
  });

  it("should NOT include invalid Blockberry host", async () => {
    const { getAggregatorList } = await import("../../lib/walrus/client");
    const aggregators = getAggregatorList();

    expect(aggregators).not.toContain("https://walrus-mainnet.blockberry.one");
  });

  it("should deduplicate aggregators when env URL matches fallback", async () => {
    const { getAggregatorList } = await import("../../lib/walrus/client");
    const aggregators = getAggregatorList();

    const uniqueAggregators = [...new Set(aggregators)];
    expect(aggregators.length).toBe(uniqueAggregators.length);
  });
});

describe("Walrus Client - verifyBlobExists", () => {
  const mockBlobId = "test-blob-id-abc123";
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  it("should return exists:true on first successful aggregator", async () => {
    global.fetch = mock(() => Promise.resolve({ ok: true } as Response)) as any;

    const { verifyBlobExists } = await import("../../lib/walrus/client");
    const result = await verifyBlobExists(mockBlobId, 1, 100);

    expect(result.exists).toBe(true);
    expect(result.aggregator).toBeDefined();

    global.fetch = originalFetch;
  });

  it("should retry on failed aggregators", async () => {
    let callCount = 0;
    global.fetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error("DNS error"));
      }
      return Promise.resolve({ ok: true } as Response);
    }) as any;

    const { verifyBlobExists } = await import("../../lib/walrus/client");
    const result = await verifyBlobExists(mockBlobId, 3, 100);

    expect(result.exists).toBe(true);
    expect(callCount).toBeGreaterThanOrEqual(2);

    global.fetch = originalFetch;
  });

  it("should return exists:false after all retries exhausted", async () => {
    global.fetch = mock(() =>
      Promise.reject(new Error("Network error")),
    ) as any;

    const { verifyBlobExists } = await import("../../lib/walrus/client");
    const result = await verifyBlobExists(mockBlobId, 2, 100);

    expect(result.exists).toBe(false);
    expect(result.error).toContain("Blob not found");

    global.fetch = originalFetch;
  });

  it("should use HEAD method for verification", async () => {
    let capturedMethod: string | undefined;
    global.fetch = mock((url, options) => {
      capturedMethod = options?.method;
      return Promise.resolve({ ok: true } as Response);
    }) as any;

    const { verifyBlobExists } = await import("../../lib/walrus/client");
    await verifyBlobExists(mockBlobId, 1, 100);

    expect(capturedMethod).toBe("HEAD");

    global.fetch = originalFetch;
  });

  it("should construct correct aggregator URL path", async () => {
    let capturedUrl: string | undefined;
    global.fetch = mock((url) => {
      capturedUrl = url as string;
      return Promise.resolve({ ok: true } as Response);
    }) as any;

    const { verifyBlobExists } = await import("../../lib/walrus/client");
    await verifyBlobExists(mockBlobId, 1, 100);

    expect(capturedUrl).toContain(`/v1/${mockBlobId}`);

    global.fetch = originalFetch;
  });
});
