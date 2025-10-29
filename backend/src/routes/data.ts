/**
 * Data access routes
 * POST /api/datasets/:id/access - Get access grant for dataset
 * GET /api/datasets/:id/preview - Stream preview (public)
 * GET /api/datasets/:id/stream - Stream full audio (requires ownership)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/db';
import { authMiddleware } from '../middleware/auth';
import { streamBlobFromWalrus } from '../lib/walrus/client';
import { verifyUserOwnsDataset } from '../lib/sui/queries';
import { ErrorCode } from '@sonar/shared';
import type { AccessGrant } from '@sonar/shared';

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
        const { id: datasetId } = request.params;
        const userAddress = request.user!.address;

        // Verify ownership
        const owns = await verifyUserOwnsDataset(
          userAddress,
          datasetId,
          async (address, id) => {
            const purchase = await prisma.purchase.findFirst({
              where: {
                user_address: address,
                dataset_id: id,
              },
            });
            return !!purchase;
          }
        );

        if (!owns) {
          request.log.warn(
            { userAddress, datasetId },
            'Access denied: user does not own dataset'
          );

          // Log access denial
          await prisma.accessLog.create({
            data: {
              user_address: userAddress,
              dataset_id: datasetId,
              action: 'ACCESS_DENIED',
              ip_address: request.ip,
              user_agent: request.headers['user-agent'],
            },
          });

          return reply.code(403).send({
            error: ErrorCode.PURCHASE_REQUIRED,
            code: ErrorCode.PURCHASE_REQUIRED,
            message: 'This dataset requires a purchase to access',
          });
        }

        // Look up blob_id
        const blobMapping = await prisma.datasetBlob.findUnique({
          where: { dataset_id: datasetId },
        });

        if (!blobMapping) {
          request.log.error({ datasetId }, 'Blob mapping not found');
          return reply.code(404).send({
            error: ErrorCode.BLOB_NOT_FOUND,
            code: ErrorCode.BLOB_NOT_FOUND,
            message: 'Audio file not found',
          });
        }

        // Log access
        await prisma.accessLog.create({
          data: {
            user_address: userAddress,
            dataset_id: datasetId,
            action: 'ACCESS_GRANTED',
            ip_address: request.ip,
            user_agent: request.headers['user-agent'],
          },
        });

        request.log.info({ userAddress, datasetId }, 'Access granted');

        // Return access grant
        const grant: AccessGrant = {
          seal_policy_id: 'policy-id-placeholder', // TODO: Get from contract
          download_url: `/api/datasets/${datasetId}/stream`,
          blob_id: blobMapping.full_blob_id,
          expires_at: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        };

        return reply.send(grant);
      } catch (error) {
        request.log.error(error, 'Access request failed');
        return reply.code(500).send({
          error: ErrorCode.INTERNAL_ERROR,
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Failed to process access request',
        });
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
        const { id: datasetId } = request.params;

        // Look up blob_id
        const blobMapping = await prisma.datasetBlob.findUnique({
          where: { dataset_id: datasetId },
        });

        if (!blobMapping) {
          request.log.warn({ datasetId }, 'Blob mapping not found');
          return reply.code(404).send({
            error: ErrorCode.BLOB_NOT_FOUND,
            code: ErrorCode.BLOB_NOT_FOUND,
            message: 'Preview not found',
          });
        }

        // Stream from Walrus
        const walrusResponse = await streamBlobFromWalrus(blobMapping.preview_blob_id);

        // Copy headers and stream
        for (const [key, value] of walrusResponse.headers.entries()) {
          if (
            !['content-encoding', 'transfer-encoding'].includes(key.toLowerCase())
          ) {
            reply.header(key, value);
          }
        }

        reply.header('Content-Type', 'audio/mpeg');
        reply.header('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours

        request.log.info({ datasetId }, 'Preview stream started');

        if (!walrusResponse.body) {
          return reply.code(500).send({
            error: ErrorCode.WALRUS_ERROR,
            code: ErrorCode.WALRUS_ERROR,
            message: 'Failed to stream from storage',
          });
        }

        return reply.type('audio/mpeg').send(walrusResponse.body);
      } catch (error) {
        request.log.error(error, 'Preview stream failed');
        return reply.code(500).send({
          error: ErrorCode.WALRUS_ERROR,
          code: ErrorCode.WALRUS_ERROR,
          message: 'Failed to stream preview',
        });
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
        const { id: datasetId } = request.params;
        const userAddress = request.user!.address;

        // Verify ownership
        const owns = await verifyUserOwnsDataset(
          userAddress,
          datasetId,
          async (address, id) => {
            const purchase = await prisma.purchase.findFirst({
              where: {
                user_address: address,
                dataset_id: id,
              },
            });
            return !!purchase;
          }
        );

        if (!owns) {
          request.log.warn({ userAddress, datasetId }, 'Streaming access denied');
          return reply.code(403).send({
            error: ErrorCode.PURCHASE_REQUIRED,
            code: ErrorCode.PURCHASE_REQUIRED,
            message: 'Purchase required to stream this dataset',
          });
        }

        // Look up blob_id
        const blobMapping = await prisma.datasetBlob.findUnique({
          where: { dataset_id: datasetId },
        });

        if (!blobMapping) {
          request.log.error({ datasetId }, 'Blob mapping not found');
          return reply.code(404).send({
            error: ErrorCode.BLOB_NOT_FOUND,
            code: ErrorCode.BLOB_NOT_FOUND,
            message: 'Audio file not found',
          });
        }

        // Parse Range header if present
        const rangeHeader = request.headers.range;
        let range: { start: number; end?: number } | undefined;

        if (rangeHeader) {
          const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
          if (match) {
            range = {
              start: parseInt(match[1], 10),
              end: match[2] ? parseInt(match[2], 10) : undefined,
            };
          }
        }

        // Stream from Walrus
        const walrusResponse = await streamBlobFromWalrus(
          blobMapping.full_blob_id,
          { range }
        );

        // Copy headers
        for (const [key, value] of walrusResponse.headers.entries()) {
          if (
            !['content-encoding', 'transfer-encoding'].includes(key.toLowerCase())
          ) {
            reply.header(key, value);
          }
        }

        reply.header('Content-Type', 'audio/mpeg');
        reply.header('Accept-Ranges', 'bytes');

        // Log stream start
        await prisma.accessLog.create({
          data: {
            user_address: userAddress,
            dataset_id: datasetId,
            action: 'STREAM_STARTED',
            ip_address: request.ip,
            user_agent: request.headers['user-agent'],
          },
        });

        request.log.info(
          { userAddress, datasetId, range },
          'Full stream started'
        );

        if (!walrusResponse.body) {
          return reply.code(500).send({
            error: ErrorCode.WALRUS_ERROR,
            code: ErrorCode.WALRUS_ERROR,
            message: 'Failed to stream from storage',
          });
        }

        return reply
          .type('audio/mpeg')
          .status(walrusResponse.status)
          .send(walrusResponse.body);
      } catch (error) {
        request.log.error(error, 'Stream failed');
        return reply.code(500).send({
          error: ErrorCode.WALRUS_ERROR,
          code: ErrorCode.WALRUS_ERROR,
          message: 'Failed to stream audio',
        });
      }
    }
  );
}
