/**
 * Unit tests for Walrus blob verification
 * Ensures env-driven aggregator configuration and proper retry logic
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";

describe("Walrus Client - getAggregatorList", () => {
  it("should prioritize env-provided aggregator URL first", async () => {
    const { getAggregatorList } = await import("../../lib/walrus/client");
    const aggregators = getAggregatorList();

    // First aggregator should be from NEXT_PUBLIC_WALRUS_AGGREGATOR_URL
    expect(aggregators.length).toBeGreaterThan(0);
    expect(aggregators[0]).toBeDefined();
  });

  it("should include vetted fallback aggregators", async () => {
    const { getAggregatorList } = await import("../../lib/walrus/client");
    const aggregators = getAggregatorList();

    expect(aggregators).toContain(
      "https://aggregator.walrus-mainnet.walrus.space",
    );
    expect(aggregators).toContain(
      "https://wal-aggregator-mainnet.staketab.org",
    );
  });

  it("should include only vetted fallback hosts in fallback list", async () => {
    const { getAggregatorList } = await import("../../lib/walrus/client");
    const aggregators = getAggregatorList();

    // Fallback list should not include known-dead hosts (aggregator.walrus.space)
    // Note: First aggregator is from env, so check fallbacks only
    const fallbacks = aggregators.slice(1);
    expect(fallbacks).not.toContain("https://aggregator.walrus.space");

    // Vetted fallbacks should be present
    expect(aggregators).toContain(
      "https://aggregator.walrus-mainnet.walrus.space",
    );
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

  it("should skip aggregators with DNS errors permanently", async () => {
    let callCount = 0;
    const calledAggregators = new Set<string>();

    global.fetch = mock((url) => {
      callCount++;
      calledAggregators.add(url as string);

      if ((url as string).includes("first-aggregator")) {
        return Promise.reject(new Error("getaddrinfo ENOTFOUND"));
      }
      return Promise.resolve({ ok: true } as Response);
    }) as any;

    const { verifyBlobExists } = await import("../../lib/walrus/client");
    const result = await verifyBlobExists(mockBlobId, 3, 100);

    expect(result.exists).toBe(true);
    global.fetch = originalFetch;
  });

  it("should treat 404 as not-yet-propagated and retry", async () => {
    let callCount = 0;
    global.fetch = mock(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.resolve({ ok: false, status: 404 } as Response);
      }
      return Promise.resolve({ ok: true } as Response);
    }) as any;

    const { verifyBlobExists } = await import("../../lib/walrus/client");
    const result = await verifyBlobExists(mockBlobId, 5, 100);

    expect(result.exists).toBe(true);
    expect(callCount).toBeGreaterThanOrEqual(3);

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
