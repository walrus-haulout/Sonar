
import { beforeEach, describe, expect, mock, test } from 'bun:test';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:memory:?cache=shared';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.SUI_RPC_URL = process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io';
process.env.SONAR_PACKAGE_ID = process.env.SONAR_PACKAGE_ID || '0x1';
process.env.SONAR_MARKETPLACE_ID = process.env.SONAR_MARKETPLACE_ID || '0x0';

const prismaPlaceholder = {
  kioskReserve: {
    findFirst: async () => null,
    create: async () => null,
    upsert: async () => null,
  },
  priceHistory: {
    findMany: async () => [],
  },
  kioskPurchase: {
    aggregate: async () => ({ _sum: { sonar_amount: 0n }, _count: { id: 0 } }),
    count: async () => 0,
    findFirst: async () => null,
  },
  dataset: {
    findUnique: async () => null,
  },
  accessLog: {
    create: async () => undefined,
  },
} as const;

mock.module('../lib/db', () => ({ prisma: prismaPlaceholder }));

mock.module('../lib/sui/client', () => ({
  SONAR_MARKETPLACE_ID: process.env.SONAR_MARKETPLACE_ID || '0x0',
  SONAR_PACKAGE_ID: process.env.SONAR_PACKAGE_ID || '0x1',
  suiClient: {
    async getObject() {
      throw new Error('suiClient.getObject not mocked in kiosk.service.spec');
    },
    async queryEvents() {
      return { data: [] };
    },
  },
  suiQueryExecutor: {
    async execute<T>(fn: () => Promise<T>) {
      return fn();
    },
  },
}));

type AnyFn = (...args: any[]) => any;

function createMockFn(defaultImpl: AnyFn = () => undefined) {
  let impl = defaultImpl;
  const queue: AnyFn[] = [];
  const calls: any[][] = [];

  const fn: AnyFn & {
    mock: { calls: any[][] };
    mockClear: () => void;
    mockImplementation: (nextImpl: AnyFn) => typeof fn;
    mockImplementationOnce: (nextImpl: AnyFn) => typeof fn;
    mockResolvedValue: (value: any) => typeof fn;
    mockResolvedValueOnce: (value: any) => typeof fn;
    mockCallCount: () => number;
  } = ((...args: any[]) => {
    calls.push(args);
    if (queue.length > 0) {
      return queue.shift()!(...args);
    }
    return impl(...args);
  }) as any;

  fn.mock = { calls };
  fn.mockClear = () => {
    calls.length = 0;
    queue.length = 0;
  };
  fn.mockImplementation = (nextImpl: AnyFn) => {
    impl = nextImpl;
    return fn;
  };
  fn.mockImplementationOnce = (nextImpl: AnyFn) => {
    queue.push(nextImpl);
    return fn;
  };
  fn.mockResolvedValue = (value: any) => fn.mockImplementation(() => Promise.resolve(value));
  fn.mockResolvedValueOnce = (value: any) => fn.mockImplementationOnce(() => Promise.resolve(value));
  fn.mockCallCount = () => calls.length;

  return fn;
}

const logger = {
  debug: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  info: () => undefined,
};

function createPrismaMock() {
  const kioskReserveFindFirst = createMockFn(async () => null);
  const kioskReserveCreate = createMockFn(async (args?: any) => ({
    id: 'kiosk_1',
    sonar_balance: args?.data?.sonar_balance ?? 0n,
    sui_balance: args?.data?.sui_balance ?? 0n,
    current_price: args?.data?.current_price ?? 1_000_000_000n,
    current_tier: args?.data?.current_tier ?? 1,
    circulating_supply: args?.data?.circulating_supply ?? 0n,
    price_override: args?.data?.price_override ?? null,
    last_synced_at: new Date('2025-01-01T00:00:00Z'),
  }));
  const priceHistoryFindMany = createMockFn(async () => []);
  const kioskPurchaseAggregate = createMockFn(async () => ({
    _sum: { sonar_amount: 0n },
    _count: { id: 0 },
  }));
  const kioskPurchaseCount = createMockFn(async () => 0);
  const kioskPurchaseFindFirst = createMockFn(async () => null);
  const datasetFindUnique = createMockFn(async () => null);
  const accessLogCreate = createMockFn(async () => undefined);

  const prisma = {
    kioskReserve: {
      findFirst: kioskReserveFindFirst,
      create: kioskReserveCreate,
    },
    priceHistory: {
      findMany: priceHistoryFindMany,
    },
    kioskPurchase: {
      aggregate: kioskPurchaseAggregate,
      count: kioskPurchaseCount,
      findFirst: kioskPurchaseFindFirst,
    },
    dataset: {
      findUnique: datasetFindUnique,
    },
    accessLog: {
      create: accessLogCreate,
    },
  };

  return {
    prisma,
    kioskReserveFindFirst,
    kioskReserveCreate,
    priceHistoryFindMany,
    kioskPurchaseAggregate,
    kioskPurchaseCount,
    kioskPurchaseFindFirst,
    datasetFindUnique,
    accessLogCreate,
  };
}

function setAggregatorEnv(value: string | null | 'inherit') {
  if (value === 'inherit') {
    return;
  }

  if (value === null) {
    (process.env as Record<string, string | undefined>).WALRUS_AGGREGATOR_URL = undefined;
  } else {
    process.env.WALRUS_AGGREGATOR_URL = value;
  }
}

async function loadServiceModule(envOverride: string | null = 'inherit') {
  setAggregatorEnv(envOverride);

  const label = envOverride === 'inherit' ? 'inherit' : encodeURIComponent(String(envOverride ?? 'none'));
  const specSuffix = `?scenario=${label}-${Date.now()}-${Math.random()}`;
  const module = await import(`../services/kiosk-service${specSuffix}`);
  return module;
}

describe('fetchKioskPrice', () => {
  beforeEach(() => {
    setAggregatorEnv(null);
  });

  test('returns kiosk price with override metadata', async () => {
    const { prisma, kioskReserveFindFirst } = createPrismaMock();
    kioskReserveFindFirst.mockResolvedValueOnce({
      current_price: 800_000_000n,
      sonar_balance: 4_200_000_000_000_000n,
      sui_balance: 3_300_000_000_000_000n,
      current_tier: 2,
      circulating_supply: 38_000_000_000_000_000n,
      price_override: 750_000_000n,
      last_synced_at: new Date('2025-01-01T00:00:00Z'),
    });

    const { fetchKioskPrice } = await loadServiceModule();
    const result = await fetchKioskPrice({ logger, prismaClient: prisma as any });

    expect(result).toEqual({
      sonar_price: '800000000',
      sui_price: '1000000000',
      reserve_balance: {
        sonar: '4200000000000000',
        sui: '3300000000000000',
      },
      current_tier: 2,
      circulating_supply: '38000000000000000',
      price_override: '750000000',
      override_active: true,
      last_synced_at: '2025-01-01T00:00:00.000Z',
    });
  });

  test('initializes kiosk snapshot when missing', async () => {
    const { prisma, kioskReserveFindFirst, kioskReserveCreate } = createPrismaMock();
    kioskReserveFindFirst.mockResolvedValueOnce(null);
    kioskReserveCreate.mockResolvedValueOnce({
      current_price: 1_000_000_000n,
      sonar_balance: 0n,
      sui_balance: 0n,
      current_tier: 1,
      circulating_supply: 0n,
      price_override: null,
      last_synced_at: new Date('2025-01-01T00:00:00Z'),
    });

    const { fetchKioskPrice } = await loadServiceModule();
    const result = await fetchKioskPrice({ logger, prismaClient: prisma as any });

    expect(kioskReserveCreate.mockCallCount()).toBe(1);
    expect(result.reserve_balance).toEqual({ sonar: '0', sui: '0' });
    expect(result.override_active).toBe(false);
  });
});

describe('issueKioskAccessGrant', () => {
  beforeEach(() => {
    setAggregatorEnv(null);
  });

  test('returns aggregator URL when configured', async () => {
    const {
      prisma,
      kioskPurchaseFindFirst,
      datasetFindUnique,
      accessLogCreate,
    } = createPrismaMock();

    kioskPurchaseFindFirst.mockResolvedValueOnce({
      id: 'purchase_1',
      dataset_id: 'dataset_1',
    });

    datasetFindUnique.mockResolvedValueOnce({
      id: 'dataset_1',
      seal_policy_id: 'seal_policy',
      blobs: { full_blob_id: 'blob_full' },
    });

    accessLogCreate.mockResolvedValue(undefined);

    const { issueKioskAccessGrant } = await loadServiceModule('https://aggregator.example');
    const grant = await issueKioskAccessGrant({
      datasetId: 'dataset_1',
      userAddress: '0xuser',
      metadata: { logger, ip: '127.0.0.1', userAgent: 'test' },
      prismaClient: prisma as any,
    });

    expect(grant.download_url).toBe('https://aggregator.example/blobs/blob_full');
    expect(grant.seal_policy_id).toBe('seal_policy');
    expect(accessLogCreate.mockCallCount()).toBe(1);
  });

  test('falls back to backend stream when aggregator missing', async () => {
    const {
      prisma,
      kioskPurchaseFindFirst,
      datasetFindUnique,
      accessLogCreate,
    } = createPrismaMock();

    kioskPurchaseFindFirst.mockResolvedValueOnce({
      id: 'purchase_1',
      dataset_id: 'dataset_1',
    });

    datasetFindUnique.mockResolvedValueOnce({
      id: 'dataset_1',
      seal_policy_id: 'seal_policy',
      blobs: { full_blob_id: 'blob_full' },
    });

    const { issueKioskAccessGrant } = await loadServiceModule(null);
    const grant = await issueKioskAccessGrant({
      datasetId: 'dataset_1',
      userAddress: '0xuser',
      metadata: { logger, ip: '127.0.0.1', userAgent: 'test' },
      prismaClient: prisma as any,
    });

    expect(grant.download_url).toBe('/api/datasets/dataset_1/stream');
    expect(accessLogCreate.mockCallCount()).toBe(1);
  });

  test('throws unauthorized error when purchase missing', async () => {
    const { prisma, kioskPurchaseFindFirst, accessLogCreate } = createPrismaMock();
    kioskPurchaseFindFirst.mockResolvedValueOnce(null);

    const { issueKioskAccessGrant } = await loadServiceModule(null);

    await expect(
      issueKioskAccessGrant({
        datasetId: 'dataset_1',
        userAddress: '0xuser',
        metadata: { logger, ip: '127.0.0.1', userAgent: 'test' },
        prismaClient: prisma as any,
      })
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(accessLogCreate.mockCallCount()).toBe(1);
  });
});
