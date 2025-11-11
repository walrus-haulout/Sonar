import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { prisma as defaultPrisma } from '../lib/db';
import { streamBlobFromWalrus } from '../lib/walrus/client';
import { HttpError } from '../lib/errors';
import { ErrorCode, type AccessGrant } from '@sonar/shared';
import type { ByteRange } from '../lib/validators';
import { verifyUserOwnsDataset as defaultVerifyUserOwnsDataset } from '../lib/sui/queries';
import type { RequestMetadata } from './types';

interface DatasetStreamOptions {
  datasetId: string;
  userAddress: string;
  range?: ByteRange;
  metadata: RequestMetadata;
  prismaClient?: PrismaClient;
  ownershipVerifier?: typeof defaultVerifyUserOwnsDataset;
}

interface AccessGrantOptions {
  datasetId: string;
  userAddress: string;
  metadata: RequestMetadata;
  prismaClient?: PrismaClient;
  ownershipVerifier?: typeof defaultVerifyUserOwnsDataset;
}

interface PreviewOptions {
  datasetId: string;
  logger: FastifyBaseLogger;
  prismaClient?: PrismaClient;
}

export interface FileSealMetadata {
  file_index: number;
  seal_policy_id: string;
  blob_id: string;
  preview_blob_id?: string;
  duration_seconds: number;
  mime_type: string;
  preview_mime_type?: string;
  backup_key?: string;
}

interface StoreSealMetadataOptions {
  datasetId: string;
  files: FileSealMetadata[];
  logger: FastifyBaseLogger;
  prismaClient?: PrismaClient;
}

type DatasetPrismaClient = Pick<
  PrismaClient,
  'dataset' | 'datasetBlob' | 'purchase' | 'accessLog'
>;

type DatasetQueryResult = NonNullable<
  Awaited<
    ReturnType<
      DatasetPrismaClient['dataset']['findUnique']
    >
  >
>;

type BlobType = {
  id: string;
  dataset_id: string;
  file_index: number;
  preview_blob_id: string;
  full_blob_id: string;
  mime_type?: string;
  preview_mime_type?: string | null;
  duration_seconds: number;
  seal_policy_id: string | null;
  created_at: Date;
  updated_at: Date;
};

interface DatasetWithBlob {
  dataset: DatasetQueryResult & { blobs?: BlobType[] };
  blobs: BlobType[];
}

interface WalrusStreamResult {
  response: Response;
  mimeType: string | null;
}

function getPrismaClient(prismaClient?: DatasetPrismaClient | PrismaClient) {
  return (prismaClient ?? defaultPrisma) as PrismaClient;
}

async function fetchDatasetWithBlobs(
  prismaClient: PrismaClient,
  datasetId: string,
  logger: FastifyBaseLogger
): Promise<DatasetWithBlob> {
  const dataset = await prismaClient.dataset.findUnique({
    where: { id: datasetId },
    include: { blobs: true },
  });

  if (!dataset) {
    logger.warn({ datasetId }, 'Dataset not found');
    throw new HttpError(404, ErrorCode.DATASET_NOT_FOUND, 'Dataset not found.');
  }

  if (!dataset.blobs || dataset.blobs.length === 0) {
    logger.error({ datasetId }, 'Dataset blob mapping not found');
    throw new HttpError(404, ErrorCode.BLOB_NOT_FOUND, 'Audio file not found.');
  }

  return { dataset, blobs: dataset.blobs as BlobType[] };
}

function selectPrimaryBlob(blobs: BlobType[]): BlobType {
  if (blobs.length > 0) {
    const primary = blobs.find((blob) => blob.file_index === 0);
    return primary ?? blobs[0];
  }

  throw new HttpError(404, ErrorCode.BLOB_NOT_FOUND, 'Audio file not found.');
}

export async function createDatasetAccessGrant({
  datasetId,
  userAddress,
  metadata,
  prismaClient,
  ownershipVerifier,
}: AccessGrantOptions): Promise<AccessGrant> {
  const prisma = getPrismaClient(prismaClient);
  const { logger, ip, userAgent } = metadata;

  const verifyOwnership = ownershipVerifier ?? defaultVerifyUserOwnsDataset;

  const ownsDataset = await verifyOwnership(
    userAddress,
    datasetId,
    async (address, id) => {
      const purchase = await prisma.purchase.findFirst({
        where: {
          user_address: address,
          dataset_id: id,
        },
      });
      return Boolean(purchase);
    }
  );

  if (!ownsDataset) {
    logger.warn({ userAddress, datasetId }, 'Access denied: purchase required');

    await prisma.accessLog.create({
      data: {
        user_address: userAddress,
        dataset_id: datasetId,
        action: 'ACCESS_DENIED',
        ip_address: ip,
        user_agent: userAgent,
      },
    });

    throw new HttpError(
      403,
      ErrorCode.PURCHASE_REQUIRED,
      'This dataset requires a purchase to access.'
    );
  }

  const { dataset, blobs } = await fetchDatasetWithBlobs(prisma, datasetId, logger);
  const blob = selectPrimaryBlob(blobs);

  await prisma.accessLog.create({
    data: {
      user_address: userAddress,
      dataset_id: datasetId,
      action: 'ACCESS_GRANTED',
      ip_address: ip,
      user_agent: userAgent,
    },
  });

  logger.info({ userAddress, datasetId }, 'Access grant issued');

  const downloadUrl = `/api/datasets/${datasetId}/stream`;

  return {
    seal_policy_id: dataset.seal_policy_id || '',
    download_url: downloadUrl,
    blob_id: blob.full_blob_id,
    expires_at: Date.now() + 24 * 60 * 60 * 1000,
  };
}

export async function getDatasetPreviewStream({
  datasetId,
  logger,
  prismaClient,
}: PreviewOptions): Promise<WalrusStreamResult> {
  const prisma = getPrismaClient(prismaClient);
  const dataset = await fetchDatasetWithBlobs(prisma, datasetId, logger);
  const blob = selectPrimaryBlob(dataset.blobs);

  try {
    const response = await streamBlobFromWalrus(blob.preview_blob_id, {
      mimeType: blob.preview_mime_type ?? blob.mime_type ?? undefined,
    });

    return {
      response,
      mimeType: blob.preview_mime_type ?? blob.mime_type ?? null,
    };
  } catch (error) {
    logger.error({ error, datasetId }, 'Failed to stream preview from Walrus');
    throw new HttpError(500, ErrorCode.WALRUS_ERROR, 'Failed to stream preview');
  }
}

export async function getDatasetAudioStream({
  datasetId,
  userAddress,
  range,
  metadata,
  prismaClient,
  ownershipVerifier,
}: DatasetStreamOptions): Promise<WalrusStreamResult> {
  const prisma = getPrismaClient(prismaClient);
  const { logger, ip, userAgent } = metadata;

  const verifyOwnership = ownershipVerifier ?? defaultVerifyUserOwnsDataset;

  const ownsDataset = await verifyOwnership(
    userAddress,
    datasetId,
    async (address, id) => {
      const purchase = await prisma.purchase.findFirst({
        where: {
          user_address: address,
          dataset_id: id,
        },
      });
      return Boolean(purchase);
    }
  );

  if (!ownsDataset) {
    logger.warn({ userAddress, datasetId }, 'Streaming access denied: purchase required');

    await prisma.accessLog.create({
      data: {
        user_address: userAddress,
        dataset_id: datasetId,
        action: 'ACCESS_DENIED',
        ip_address: ip,
        user_agent: userAgent,
      },
    });

    throw new HttpError(403, ErrorCode.PURCHASE_REQUIRED, 'Purchase required to stream this dataset');
  }

  const { blobs } = await fetchDatasetWithBlobs(prisma, datasetId, logger);
  const blob = selectPrimaryBlob(blobs);

  await prisma.accessLog.create({
    data: {
      user_address: userAddress,
      dataset_id: datasetId,
      action: 'STREAM_STARTED',
      ip_address: ip,
      user_agent: userAgent,
    },
  });

  logger.info({ userAddress, datasetId, range }, 'Starting Walrus audio stream');

  try {
    const response = await streamBlobFromWalrus(blob.full_blob_id, {
      range,
      mimeType: blob.mime_type ?? 'audio/mpeg',
    });

    return {
      response,
      mimeType: blob.mime_type ?? 'audio/mpeg',
    };
  } catch (error) {
    logger.error({ error, datasetId }, 'Failed to stream audio from Walrus');
    throw new HttpError(500, ErrorCode.WALRUS_ERROR, 'Failed to stream audio');
  }
}

/**
 * Store Seal encryption metadata for a dataset
 * Called after successful blockchain publish to link backup keys to dataset
 * Supports multi-file datasets
 */
export async function storeSealMetadata({
  datasetId,
  files,
  logger,
  prismaClient,
}: StoreSealMetadataOptions): Promise<void> {
  const prisma = getPrismaClient(prismaClient);

  // Verify dataset exists
  const dataset = await prisma.dataset.findUnique({
    where: { id: datasetId },
  });

  if (!dataset) {
    logger.warn({ datasetId }, 'Cannot store seal metadata: dataset not found');
    throw new HttpError(404, ErrorCode.DATASET_NOT_FOUND, 'Dataset not found.');
  }

  // Store Seal metadata for each file
  for (const fileMetadata of files) {
    const mimeType = fileMetadata.mime_type?.trim() || 'audio/mpeg';
    const previewMimeType = fileMetadata.preview_mime_type?.trim() || null;

    await prisma.datasetBlob.upsert({
      where: {
        dataset_id_file_index: {
          dataset_id: datasetId,
          file_index: fileMetadata.file_index,
        },
      },
      update: {
        full_blob_id: fileMetadata.blob_id,
        preview_blob_id: fileMetadata.preview_blob_id || '',
        seal_policy_id: fileMetadata.seal_policy_id,
        duration_seconds: fileMetadata.duration_seconds,
        mime_type: mimeType,
        preview_mime_type: previewMimeType,
      },
      create: {
        dataset_id: datasetId,
        file_index: fileMetadata.file_index,
        full_blob_id: fileMetadata.blob_id,
        preview_blob_id: fileMetadata.preview_blob_id || '',
        seal_policy_id: fileMetadata.seal_policy_id,
        duration_seconds: fileMetadata.duration_seconds,
        mime_type: mimeType,
        preview_mime_type: previewMimeType,
      },
    });
  }

  // Update Dataset table with first file's seal_policy_id for backwards compatibility
  if (files.length > 0) {
    await prisma.dataset.update({
      where: { id: datasetId },
      data: {
        seal_policy_id: files[0].seal_policy_id,
      },
    });
  }

  logger.info(
    { datasetId, fileCount: files.length },
    'Seal metadata stored successfully for all files'
  );
}
