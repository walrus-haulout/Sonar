/**
 * Data access routes
 * POST /api/datasets/:id/access - Get access grant for dataset
 * GET /api/datasets/:id/preview - Stream preview (public)
 * GET /api/datasets/:id/stream - Stream full audio (requires ownership)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware } from '../middleware/auth';
import { assertDatasetId, parseRangeHeader } from '../lib/validators';
import {
  createDatasetAccessGrant,
  getDatasetAudioStream,
  getDatasetPreviewStream,
  storeSealMetadata,
  type FileSealMetadata,
} from '../services/dataset-service';
import { isHttpError, toErrorResponse } from '../lib/errors';

interface SealMetadataBody {
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
}

/**
 * Register data access routes
 */
export async function registerDataRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/datasets/:id/access
   * Get access grant for a dataset (requires JWT auth + ownership)
   */
  fastify.post<{ Params: { id: string } }>(
    '/api/datasets/:id/access',
    {
      onRequest: authMiddleware,
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const datasetId = assertDatasetId(request.params.id);
        const userAddress = request.user!.address;

        const grant = await createDatasetAccessGrant({
          datasetId,
          userAddress,
          metadata: {
            ip: request.ip,
            userAgent: Array.isArray(request.headers['user-agent'])
              ? request.headers['user-agent'][0]
              : request.headers['user-agent'],
            logger: request.log,
          },
        });

        return reply.send(grant);
      } catch (error) {
        if (!isHttpError(error)) {
          request.log.error({ error, datasetId: request.params.id }, 'Access request failed');
        }

        const { statusCode, body } = toErrorResponse(error);
        return reply.code(statusCode).send(body);
      }
    }
  );

  /**
   * POST /api/datasets/:id/seal-metadata
   * Store Seal encryption metadata for a dataset (supports multi-file)
   * Called from frontend after successful blockchain publish
   */
  fastify.post<{ Params: { id: string }; Body: SealMetadataBody }>(
    '/api/datasets/:id/seal-metadata',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  file_index: { type: 'number' },
                  seal_policy_id: { type: 'string' },
                  blob_id: { type: 'string' },
                  preview_blob_id: { type: 'string' },
                  duration_seconds: { type: 'number' },
                  mime_type: { type: 'string' },
                  preview_mime_type: { type: ['string', 'null'] },
                  backup_key: { type: 'string' },
                },
                required: ['file_index', 'seal_policy_id', 'blob_id', 'duration_seconds', 'mime_type'],
              },
            },
          },
          required: ['files'],
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: SealMetadataBody }>,
      reply: FastifyReply
    ) => {
      try {
        const datasetId = assertDatasetId(request.params.id);
        const { files, verification, metadata } = request.body;

        // Validate files array
        if (!files || files.length === 0) {
          return reply.code(400).send({
            error: 'INVALID_REQUEST',
            message: 'files array is required and cannot be empty',
          });
        }

        await storeSealMetadata({
          datasetId,
          files,
          verification,
          metadata,
          logger: request.log,
        });

        return reply.send({ success: true, datasetId, fileCount: files.length });
      } catch (error) {
        if (!isHttpError(error)) {
          request.log.error(
            { error, datasetId: request.params.id },
            'Failed to store seal metadata'
          );
        }

        const { statusCode, body } = toErrorResponse(error);
        return reply.code(statusCode).send(body);
      }
    }
  );

  /**
   * GET /api/datasets/:id/preview
   * Stream preview audio (public, no auth required)
   */
  fastify.get<{ Params: { id: string } }>(
    '/api/datasets/:id/preview',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const datasetId = assertDatasetId(request.params.id);
        const { response: walrusResponse, mimeType } = await getDatasetPreviewStream({
          datasetId,
          logger: request.log,
        });

        for (const [key, value] of walrusResponse.headers.entries()) {
          if (!['content-encoding', 'transfer-encoding'].includes(key.toLowerCase())) {
            reply.header(key, value);
          }
        }

        const contentType =
          mimeType ||
          walrusResponse.headers.get('Content-Type') ||
          'audio/mpeg';

        reply.header('Content-Type', contentType);
        reply.header('Cache-Control', 'public, max-age=86400');

        if (!walrusResponse.body) {
          throw new Error('Walrus response missing body');
        }

        request.log.info({ datasetId }, 'Preview stream started');
        return reply
          .status(walrusResponse.status)
          .type(contentType)
          .send(walrusResponse.body);
      } catch (error) {
        if (!isHttpError(error)) {
          request.log.error({ error, datasetId: request.params.id }, 'Preview stream failed');
        }

        const { statusCode, body } = toErrorResponse(error);
        return reply.code(statusCode).send(body);
      }
    }
  );

  /**
   * GET /api/datasets/:id/stream
   * Stream full audio with Range request support (requires ownership)
   */
  fastify.get<{ Params: { id: string } }>(
    '/api/datasets/:id/stream',
    {
      onRequest: authMiddleware,
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const datasetId = assertDatasetId(request.params.id);
        const userAddress = request.user!.address;
        const rangeHeader = Array.isArray(request.headers.range)
          ? request.headers.range[0]
          : request.headers.range;
        const range = parseRangeHeader(rangeHeader);

        const { response: walrusResponse, mimeType } = await getDatasetAudioStream({
          datasetId,
          userAddress,
          range,
          metadata: {
            ip: request.ip,
            userAgent: Array.isArray(request.headers['user-agent'])
              ? request.headers['user-agent'][0]
              : request.headers['user-agent'],
            logger: request.log,
          },
        });

        for (const [key, value] of walrusResponse.headers.entries()) {
          if (!['content-encoding', 'transfer-encoding'].includes(key.toLowerCase())) {
            reply.header(key, value);
          }
        }

        const contentType =
          mimeType ||
          walrusResponse.headers.get('Content-Type') ||
          'audio/mpeg';

        reply.header('Content-Type', contentType);
        reply.header('Accept-Ranges', 'bytes');

        if (!walrusResponse.body) {
          throw new Error('Walrus response missing body');
        }

        return reply
          .type(contentType)
          .status(walrusResponse.status)
          .send(walrusResponse.body);
      } catch (error) {
        if (!isHttpError(error)) {
          request.log.error({ error, datasetId: request.params.id }, 'Stream failed');
        }

        const { statusCode, body } = toErrorResponse(error);
        return reply.code(statusCode).send(body);
      }
    }
  );
}
