import type { PrismaClient } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import { prisma as defaultPrisma } from "../lib/db";
import { streamBlobFromWalrus } from "../lib/walrus/client";
import { HttpError } from "../lib/errors";
import { ErrorCode, type AccessGrant } from "@sonar/shared";
import type { ByteRange } from "../lib/validators";
import { verifyUserOwnsDataset as defaultVerifyUserOwnsDataset } from "../lib/sui/queries";
import type { RequestMetadata } from "./types";

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
  userAddress: string;
  files: FileSealMetadata[];
  verification?: {
    verification_id: string;
    quality_score?: number;
    safety_passed?: boolean;
    verified_at: string;
    transcript?: string;
    detected_languages?: string[];
    analysis?: any;
    transcription_details?: any;
    quality_breakdown?: any;
  };
  metadata?: {
    title: string;
    description: string;
    languages?: string[];
    tags?: string[];
    per_file_metadata?: any[];
    audio_quality?: any;
    speakers?: any;
    categorization?: any;
  };
  logger: FastifyBaseLogger;
  prismaClient?: PrismaClient;
}

type DatasetPrismaClient = Pick<
  PrismaClient,
  "dataset" | "datasetBlob" | "purchase" | "accessLog"
>;

type DatasetQueryResult = NonNullable<
  Awaited<ReturnType<DatasetPrismaClient["dataset"]["findUnique"]>>
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
  logger: FastifyBaseLogger,
): Promise<DatasetWithBlob> {
  const dataset = await prismaClient.dataset.findUnique({
    where: { id: datasetId },
    include: { blobs: true },
  });

  if (!dataset) {
    logger.warn({ datasetId }, "Dataset not found");
    throw new HttpError(404, ErrorCode.DATASET_NOT_FOUND, "Dataset not found.");
  }

  if (!dataset.blobs || dataset.blobs.length === 0) {
    logger.error({ datasetId }, "Dataset blob mapping not found");
    throw new HttpError(404, ErrorCode.BLOB_NOT_FOUND, "Audio file not found.");
  }

  return { dataset, blobs: dataset.blobs as BlobType[] };
}

function selectPrimaryBlob(blobs: BlobType[]): BlobType {
  if (blobs.length > 0) {
    const primary = blobs.find((blob) => blob.file_index === 0);
    return primary ?? blobs[0];
  }

  throw new HttpError(404, ErrorCode.BLOB_NOT_FOUND, "Audio file not found.");
}

/**
 * Fetch dataset data from blockchain if not in database
 * Returns basic on-chain fields to create dataset record
 *
 * Implements retry logic with exponential backoff to handle RPC indexing lag
 * for newly created objects (they may not be immediately queryable)
 */
async function fetchDatasetFromBlockchain(
  datasetId: string,
  logger: FastifyBaseLogger
): Promise<{
  creator: string;
  quality_score: number;
  price: bigint;
  listed: boolean;
  duration_seconds: number;
} | null> {
  const { suiClient } = await import("../lib/sui/client");

  const maxRetries = 3;
  const retryDelays = [1000, 2000, 4000]; // 1s, 2s, 4s

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      logger.debug({ datasetId, attempt: attempt + 1, maxRetries }, "Fetching dataset from blockchain");

      const obj = await suiClient.getObject({
        id: datasetId,
        options: { showContent: true, showType: true, showOwner: true },
      });

      if (!obj.data?.content || obj.data.content.dataType !== "moveObject") {
        if (attempt < maxRetries - 1) {
          logger.debug({ datasetId, attempt: attempt + 1 }, "Object not found or not indexed yet, retrying...");
          await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
          continue;
        }
        logger.warn({ datasetId }, "Dataset object not found on blockchain after retries");
        return null;
      }

      const fields = obj.data.content.fields as any;

      // Check if this is an AudioSubmission or DatasetSubmission
      const isAudioSubmission = obj.data.type?.includes("::marketplace::AudioSubmission");
      const isDatasetSubmission = obj.data.type?.includes("::marketplace::DatasetSubmission");

      if (!isAudioSubmission && !isDatasetSubmission) {
        logger.warn({ datasetId, objectType: obj.data.type }, "Object found but is not a valid dataset type");
        return null;
      }

      logger.info({ datasetId, attempt: attempt + 1, objectType: obj.data.type }, "Dataset successfully fetched from blockchain");

      return {
        creator: fields.uploader || fields.creator,
        quality_score: parseInt(fields.quality_score || "0"),
        price: BigInt(fields.dataset_price || fields.price || "0"),
        listed: fields.listed_for_sale !== false,
        duration_seconds: parseInt(fields.duration_seconds || fields.total_duration || "0"),
      };
    } catch (error) {
      if (attempt < maxRetries - 1) {
        logger.debug({ error, datasetId, attempt: attempt + 1 }, "Error fetching dataset, retrying...");
        await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
        continue;
      }
      logger.error({ error, datasetId }, "Failed to fetch dataset from blockchain after all retries");
      return null;
    }
  }

  return null;
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
    },
  );

  if (!ownsDataset) {
    logger.warn({ userAddress, datasetId }, "Access denied: purchase required");

    await prisma.accessLog.create({
      data: {
        user_address: userAddress,
        dataset_id: datasetId,
        action: "ACCESS_DENIED",
        ip_address: ip,
        user_agent: userAgent,
      },
    });

    throw new HttpError(
      403,
      ErrorCode.PURCHASE_REQUIRED,
      "This dataset requires a purchase to access.",
    );
  }

  const { dataset, blobs } = await fetchDatasetWithBlobs(
    prisma,
    datasetId,
    logger,
  );
  const blob = selectPrimaryBlob(blobs);

  await prisma.accessLog.create({
    data: {
      user_address: userAddress,
      dataset_id: datasetId,
      action: "ACCESS_GRANTED",
      ip_address: ip,
      user_agent: userAgent,
    },
  });

  logger.info({ userAddress, datasetId }, "Access grant issued");

  const downloadUrl = `/api/datasets/${datasetId}/stream`;

  return {
    seal_policy_id: dataset.seal_policy_id || "",
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
    logger.error({ error, datasetId }, "Failed to stream preview from Walrus");
    throw new HttpError(
      500,
      ErrorCode.WALRUS_ERROR,
      "Failed to stream preview",
    );
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
    },
  );

  if (!ownsDataset) {
    logger.warn(
      { userAddress, datasetId },
      "Streaming access denied: purchase required",
    );

    await prisma.accessLog.create({
      data: {
        user_address: userAddress,
        dataset_id: datasetId,
        action: "ACCESS_DENIED",
        ip_address: ip,
        user_agent: userAgent,
      },
    });

    throw new HttpError(
      403,
      ErrorCode.PURCHASE_REQUIRED,
      "Purchase required to stream this dataset",
    );
  }

  const { blobs } = await fetchDatasetWithBlobs(prisma, datasetId, logger);
  const blob = selectPrimaryBlob(blobs);

  await prisma.accessLog.create({
    data: {
      user_address: userAddress,
      dataset_id: datasetId,
      action: "STREAM_STARTED",
      ip_address: ip,
      user_agent: userAgent,
    },
  });

  logger.info(
    { userAddress, datasetId, range },
    "Starting Walrus audio stream",
  );

  try {
    const response = await streamBlobFromWalrus(blob.full_blob_id, {
      range,
      mimeType: blob.mime_type ?? "audio/mpeg",
    });

    return {
      response,
      mimeType: blob.mime_type ?? "audio/mpeg",
    };
  } catch (error) {
    logger.error({ error, datasetId }, "Failed to stream audio from Walrus");
    throw new HttpError(500, ErrorCode.WALRUS_ERROR, "Failed to stream audio");
  }
}

/**
 * Store Seal encryption metadata for a dataset
 * Called after successful blockchain publish to link backup keys and metadata to dataset
 * Supports multi-file datasets
 * Creates dataset if missing, verifies ownership
 */
export async function storeSealMetadata({
  datasetId,
  userAddress,
  files,
  verification,
  metadata,
  logger,
  prismaClient,
}: StoreSealMetadataOptions): Promise<void> {
  const prisma = getPrismaClient(prismaClient);

  // 1. Fetch or create dataset
  let dataset = await prisma.dataset.findUnique({
    where: { id: datasetId },
  });

  if (!dataset) {
    logger.info({ datasetId }, "Dataset not in DB, fetching from blockchain");

    const onChainData = await fetchDatasetFromBlockchain(datasetId, logger);
    if (!onChainData) {
      throw new HttpError(
        404,
        ErrorCode.DATASET_NOT_FOUND,
        "Dataset not found on blockchain. This may occur if: 1) The dataset object hasn't been indexed yet (RPC lag), 2) The dataset ID is incorrect, or 3) The object is not a valid AudioSubmission/DatasetSubmission. Please try again in a few seconds.",
      );
    }

    // Create dataset with metadata
    dataset = await prisma.dataset.create({
      data: {
        id: datasetId,
        creator: onChainData.creator,
        wallet_address: userAddress,
        quality_score: onChainData.quality_score,
        price: onChainData.price,
        listed: onChainData.listed,
        duration_seconds: onChainData.duration_seconds,
        languages: metadata?.languages || [],
        formats: ["audio/mpeg"],
        media_type: "audio",
        title: metadata?.title || "Untitled Dataset",
        description: metadata?.description || "",
        total_purchases: 0,
        file_count: files.length,
        total_duration: onChainData.duration_seconds,
        blockchain_synced_at: new Date(),
      },
    });

    logger.info(
      { datasetId, creator: onChainData.creator },
      "Created dataset from blockchain data",
    );
  }

  // 2. Verify ownership
  if (dataset.wallet_address && dataset.wallet_address !== userAddress) {
    logger.warn(
      { datasetId, userAddress, owner: dataset.wallet_address },
      "Cannot store seal metadata: user is not the dataset owner",
    );
    throw new HttpError(
      403,
      ErrorCode.FORBIDDEN,
      "Only the dataset owner can update seal metadata.",
    );
  }

  // 3. Check for double-writes (idempotency)
  const existingBlobs = await prisma.datasetBlob.count({
    where: { dataset_id: datasetId },
  });

  if (existingBlobs > 0 && existingBlobs !== files.length) {
    logger.warn(
      { datasetId, existingBlobs, newBlobs: files.length },
      "Blob metadata mismatch - potential double-write",
    );
    throw new HttpError(
      409,
      ErrorCode.CONFLICT,
      "Blob metadata mismatch. Expected same number of files.",
    );
  }

  // 4. Persist metadata to Dataset table
  const transcriptText = verification?.transcript || null;
  const transcriptLength = transcriptText?.length || null;

  await prisma.dataset.update({
    where: { id: datasetId },
    data: {
      // User metadata
      title: metadata?.title || dataset.title,
      description: metadata?.description || dataset.description,
      languages: metadata?.languages || dataset.languages,
      tags: metadata?.tags || [],

      // Verification data
      transcript: transcriptText,
      transcript_length: transcriptLength,
      transcription_details: verification?.transcription_details || null,
      analysis: verification?.analysis || null,
      quality_breakdown: verification?.quality_breakdown || null,

      // Additional metadata
      per_file_metadata: metadata?.per_file_metadata || null,
      audio_quality: metadata?.audio_quality || null,
      speakers: metadata?.speakers || null,
      categorization: metadata?.categorization || null,

      metadata_updated_at: new Date(),
      seal_policy_id: files[0]?.seal_policy_id,
      wallet_address: userAddress,
    },
  });

  logger.info(
    {
      datasetId,
      hasTranscript: !!transcriptText,
      transcriptLength,
      title: metadata?.title,
      tags: metadata?.tags?.length || 0,
    },
    "Dataset metadata persisted",
  );

  // 5. Upsert DatasetBlob records
  for (const fileMetadata of files) {
    const mimeType = fileMetadata.mime_type?.trim() || "audio/mpeg";
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
        preview_blob_id: fileMetadata.preview_blob_id || "",
        seal_policy_id: fileMetadata.seal_policy_id,
        duration_seconds: fileMetadata.duration_seconds,
        mime_type: mimeType,
        preview_mime_type: previewMimeType,
      },
      create: {
        dataset_id: datasetId,
        file_index: fileMetadata.file_index,
        full_blob_id: fileMetadata.blob_id,
        preview_blob_id: fileMetadata.preview_blob_id || "",
        seal_policy_id: fileMetadata.seal_policy_id,
        duration_seconds: fileMetadata.duration_seconds,
        mime_type: mimeType,
        preview_mime_type: previewMimeType,
      },
    });
  }

  logger.info(
    { datasetId, fileCount: files.length },
    "Seal metadata and blobs stored successfully",
  );
}
