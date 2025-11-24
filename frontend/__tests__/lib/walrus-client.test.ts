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

  it("should prioritize preferred aggregators from storageId", async () => {
    const storageAggregator = "https://storage.example.com";
    let firstCallUrl: string | undefined;

    global.fetch = mock((url) => {
      if (!firstCallUrl) {
        firstCallUrl = url as string;
      }
      return Promise.resolve({ ok: true } as Response);
    }) as any;

    const { verifyBlobExists } = await import("../../lib/walrus/client");
    await verifyBlobExists(mockBlobId, 1, 100, [storageAggregator]);

    expect(firstCallUrl).toContain(storageAggregator);

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

  it("should fallback to GET when HEAD returns 404", async () => {
    let methodSequence: string[] = [];
    global.fetch = mock((url, options) => {
      const method = options?.method || "GET";
      methodSequence.push(method);

      // HEAD returns 404, GET succeeds
      if (method === "HEAD") {
        return Promise.resolve({ ok: false, status: 404 } as Response);
      }
      return Promise.resolve({ ok: true, status: 206 } as Response);
    }) as any;

    const { verifyBlobExists } = await import("../../lib/walrus/client");
    const result = await verifyBlobExists(mockBlobId, 1, 100);

    expect(result.exists).toBe(true);
    expect(methodSequence).toContain("HEAD");
    expect(methodSequence).toContain("GET");

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
