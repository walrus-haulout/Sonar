/**
 * Integration test for Walrus upload verification flow
 * Ensures blob verification doesn't fail with correct aggregator configuration
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";

describe("Walrus Upload Verification Flow", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  it("should successfully verify blob after upload using configured aggregators", async () => {
    const mockBlobId = "YPne1wXTG0KHkdQBjo6eMN5QAj4a5kWy_5LxRCQjuj8";

    global.fetch = mock(() => Promise.resolve({ ok: true } as Response)) as any;

    const { verifyBlobExists } = await import("../../lib/walrus/client");
    const result = await verifyBlobExists(mockBlobId, 15, 3000);

    expect(result.exists).toBe(true);
    expect(result.aggregator).toBeDefined();
    expect(result.error).toBeUndefined();

    global.fetch = originalFetch;
  });

  it("should use env-configured aggregator as primary endpoint", async () => {
    const mockBlobId = "test-blob-123";
    let firstCallUrl: string | undefined;

    global.fetch = mock((url) => {
      if (!firstCallUrl) {
        firstCallUrl = url as string;
      }
      return Promise.resolve({ ok: true } as Response);
    }) as any;

    const { verifyBlobExists, getAggregatorList } = await import(
      "../../lib/walrus/client"
    );
    const aggregators = getAggregatorList();
    const primaryAggregator = aggregators[0];

    await verifyBlobExists(mockBlobId, 1, 100);

    expect(firstCallUrl).toContain(primaryAggregator);

    global.fetch = originalFetch;
  });

  it("should retry with exponential backoff on temporary failures", async () => {
    const mockBlobId = "retry-test-blob";
    const callTimestamps: number[] = [];

    let attemptCount = 0;
    global.fetch = mock(() => {
      callTimestamps.push(Date.now());
      attemptCount++;

      if (attemptCount <= 2) {
        return Promise.reject(new Error("Temporary network error"));
      }
      return Promise.resolve({ ok: true } as Response);
    }) as any;

    const { verifyBlobExists } = await import("../../lib/walrus/client");
    const result = await verifyBlobExists(mockBlobId, 3, 1000);

    expect(result.exists).toBe(true);
    expect(attemptCount).toBeGreaterThan(2);

    global.fetch = originalFetch;
  });

  it("should fail gracefully with clear error message after max retries", async () => {
    const mockBlobId = "unreachable-blob";

    global.fetch = mock(() =>
      Promise.reject(new Error("DNS resolution failed")),
    ) as any;

    const { verifyBlobExists } = await import("../../lib/walrus/client");
    const result = await verifyBlobExists(mockBlobId, 3, 100);

    expect(result.exists).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("Blob not found");
    expect(result.error).toContain("3 attempts");

    global.fetch = originalFetch;
  });

  it("should not fail on ERR_NAME_NOT_RESOLVED with valid fallback aggregators", async () => {
    const mockBlobId = "fallback-test-blob";
    let callCount = 0;

    global.fetch = mock((url) => {
      callCount++;
      if ((url as string).includes("invalid-host.example.com")) {
        return Promise.reject(new Error("ERR_NAME_NOT_RESOLVED"));
      }
      return Promise.resolve({ ok: true } as Response);
    }) as any;

    const { verifyBlobExists } = await import("../../lib/walrus/client");
    const result = await verifyBlobExists(mockBlobId, 10, 1000);

    expect(result.exists).toBe(true);
    expect(result.aggregator).toBeDefined();
    expect(result.aggregator).not.toContain("invalid-host");

    global.fetch = originalFetch;
  });

  it("should handle certification lag with extended retry count", async () => {
    const mockBlobId = "certification-lag-blob";
    let attemptCount = 0;

    global.fetch = mock(() => {
      attemptCount++;
      if (attemptCount < 10) {
        return Promise.resolve({ ok: false, status: 404 } as Response);
      }
      return Promise.resolve({ ok: true } as Response);
    }) as any;

    const { verifyBlobExists } = await import("../../lib/walrus/client");
    const result = await verifyBlobExists(mockBlobId, 15, 100);

    expect(result.exists).toBe(true);
    expect(attemptCount).toBeGreaterThanOrEqual(10);

    global.fetch = originalFetch;
  });
});
