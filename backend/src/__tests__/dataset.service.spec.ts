import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.SUI_RPC_URL = process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io';
process.env.SONAR_PACKAGE_ID = process.env.SONAR_PACKAGE_ID || '0x1';
process.env.WALRUS_AGGREGATOR_URL = process.env.WALRUS_AGGREGATOR_URL || 'https://walrus.test';

const prismaPlaceholder = {
  dataset: { findUnique: async () => null },
  datasetBlob: { findUnique: async () => null },
  purchase: { findFirst: async () => null },
  accessLog: { create: async () => undefined },
} as const;

mock.module('../lib/db', () => ({ prisma: prismaPlaceholder }));

const walrusCalls: Array<[string, { range?: { start: number; end?: number } } | undefined]> = [];

async function streamBlobFromWalrusStub(
  blobId: string,
  options?: { range?: { start: number; end?: number } }
) {
  walrusCalls.push([blobId, options]);
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': '3',
    },
  });
}

mock.module('../lib/walrus/client', () => ({
  streamBlobFromWalrus: streamBlobFromWalrusStub,
}));

type DatasetRecord = {
  id: string;
  title: string;
  description: string;
  creator: string;
  quality_score: number;
  price: bigint;
  listed: boolean;
  duration_seconds: number;
  media_type: string;
  languages: string[];
  formats: string[];
  seal_policy_id?: string | null;
};

type DatasetBlobRecord = {
  dataset_id: string;
  preview_blob_id: string;
  full_blob_id: string;
};

type PurchaseRecord = {
  id: string;
  user_address: string;
  dataset_id: string;
  tx_digest: string;
  price: bigint;
};

type AccessLogRecord = {
  user_address: string;
  dataset_id: string;
  action: string;
  ip_address: string;
  user_agent?: string;
};

function createPrismaStub() {
  const datasets = new Map<string, DatasetRecord>();
  const datasetBlobs = new Map<string, DatasetBlobRecord>();
  const purchases = new Map<string, PurchaseRecord>();
  const accessLogs: AccessLogRecord[] = [];

  return {
    dataset: {
      create: async ({ data }: { data: DatasetRecord }) => {
        datasets.set(data.id, data);
        return data;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const record = datasets.get(where.id);
        if (!record) return null;
        const blobs = datasetBlobs.get(where.id) ?? null;
        return {
          ...record,
          blobs,
        };
      },
    },
    datasetBlob: {
      create: async ({ data }: { data: DatasetBlobRecord }) => {
        datasetBlobs.set(data.dataset_id, data);
        return data;
      },
      findUnique: async ({ where }: { where: { dataset_id: string } }) => {
        return datasetBlobs.get(where.dataset_id) ?? null;
      },
    },
    purchase: {
      create: async ({ data }: { data: PurchaseRecord }) => {
        purchases.set(data.id, data);
        return data;
      },
      findFirst: async ({ where }: { where: { user_address: string; dataset_id: string } }) => {
        for (const record of purchases.values()) {
          if (record.user_address === where.user_address && record.dataset_id === where.dataset_id) {
            return record;
          }
        }
        return null;
      },
    },
    accessLog: {
      create: async ({ data }: { data: AccessLogRecord }) => {
        accessLogs.push(data);
        return data;
      },
      findMany: async ({ where }: { where: Partial<AccessLogRecord> }) => {
        return accessLogs.filter((entry) => {
          if (where.dataset_id && entry.dataset_id !== where.dataset_id) {
            return false;
          }
          if (where.user_address && entry.user_address !== where.user_address) {
            return false;
          }
          return true;
        });
      },
    },
    reset() {
      datasets.clear();
      datasetBlobs.clear();
      purchases.clear();
      accessLogs.length = 0;
    },
  };
}

const prisma = createPrismaStub();

const { createDatasetAccessGrant, getDatasetAudioStream, getDatasetPreviewStream } = await import('../services/dataset-service');
const { HttpError } = await import('../lib/errors');

beforeEach(() => {
  prisma.reset();
});

afterEach(() => {
  walrusCalls.length = 0;
});

function seedDataset(id: string) {
  return prisma.dataset.create({
    data: {
      id,
      title: 'Test Dataset',
      description: 'Test description',
      creator: '0xcreator',
      quality_score: 90,
      price: 1_000_000_000n,
      listed: true,
      duration_seconds: 120,
      media_type: 'audio/mpeg',
      languages: ['en'],
      formats: ['wav'],
      seal_policy_id: 'seal-policy',
    },
  });
}

function seedBlob(datasetId: string) {
  return prisma.datasetBlob.create({
    data: {
      dataset_id: datasetId,
      preview_blob_id: 'preview-blob',
      full_blob_id: 'full-blob',
    },
  });
}

function seedPurchase(datasetId: string, userAddress: string, id: string) {
  return prisma.purchase.create({
    data: {
      id,
      user_address: userAddress,
      dataset_id: datasetId,
      tx_digest: 'digest',
      price: 1_000_000_000n,
    },
  });
}

describe('dataset service', () => {
  test('creates access grant when purchase exists', async () => {
    await seedDataset('dataset-1');
    await seedBlob('dataset-1');
    await seedPurchase('dataset-1', '0xuser', 'purchase-1');

    const grant = await createDatasetAccessGrant({
      datasetId: 'dataset-1',
      userAddress: '0xuser',
      metadata: {
        ip: '127.0.0.1',
        userAgent: 'bun-test',
        logger: console as any,
      },
      prismaClient: prisma as any,
      ownershipVerifier: async () => true,
    });

    expect(grant.blob_id).toBe('full-blob');
    expect(grant.download_url).toBe('/api/datasets/dataset-1/stream');
    expect(grant.seal_policy_id).toBe('seal-policy');

    const logs = await prisma.accessLog.findMany({
      where: {
        dataset_id: 'dataset-1',
        user_address: '0xuser',
      },
    });
    expect(logs.some((log) => log.action === 'ACCESS_GRANTED')).toBe(true);
  });

  test('throws HttpError when user lacks purchase', async () => {
    await seedDataset('dataset-2');
    await seedBlob('dataset-2');

    await expect(
      createDatasetAccessGrant({
        datasetId: 'dataset-2',
        userAddress: '0xunauthorized',
        metadata: {
          ip: '127.0.0.1',
          userAgent: 'bun-test',
          logger: console as any,
        },
        prismaClient: prisma as any,
        ownershipVerifier: async () => false,
      })
    ).rejects.toBeInstanceOf(HttpError);
  });

  test('streams audio with range header', async () => {
    await seedDataset('dataset-3');
    await seedBlob('dataset-3');
    await seedPurchase('dataset-3', '0xuser', 'purchase-3');

    const response = await getDatasetAudioStream({
      datasetId: 'dataset-3',
      userAddress: '0xuser',
      range: { start: 0, end: 100 },
      metadata: {
        ip: '127.0.0.1',
        userAgent: 'bun-test',
        logger: console as any,
      },
      prismaClient: prisma as any,
      ownershipVerifier: async () => true,
    });

    expect(response.status).toBe(200);
    expect(walrusCalls[0]?.[0]).toBe('full-blob');
    expect(walrusCalls[0]?.[1]).toEqual({ range: { start: 0, end: 100 } });
  });

  test('streams preview audio', async () => {
    await seedDataset('dataset-4');
    await seedBlob('dataset-4');

    const response = await getDatasetPreviewStream({
      datasetId: 'dataset-4',
      logger: console as any,
      prismaClient: prisma as any,
    });

    expect(response.status).toBe(200);
    expect(walrusCalls[0]?.[0]).toBe('preview-blob');
  });
});
