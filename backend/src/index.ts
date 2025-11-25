/**
 * SONAR Backend Server
 * Decentralized Audio Data Marketplace Backend
 */

import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyEnv from '@fastify/env';
import fastifyRateLimit from '@fastify/rate-limit';
import crypto from 'crypto';
import { logger } from './lib/logger';
import { prisma } from './lib/db';
import { startDatasetIndexer } from './services/dataset-indexer-cron';

declare global {
namespace NodeJS {
interface ProcessEnv {
NODE_ENV: 'development' | 'production' | 'test';
PORT: string;
JWT_SECRET: string;
JWT_EXPIRES_IN: string;
SUI_RPC_URL: string;
SONAR_PACKAGE_ID: string;
WALRUS_AGGREGATOR_URL: string;
SEAL_NETWORK_URL: string;
LOG_LEVEL: string;
CORS_ORIGIN: string;
MOCK_WALRUS?: string;
MOCK_SEAL?: string;
SENTRY_DSN?: string;
  OPENROUTER_API_KEY?: string;
    PINECONE_API_KEY?: string;
    }
  }
}

async function start(): Promise<void> {
  const fastify = Fastify({
    logger: logger as any,
  });

  // Environment validation
  await fastify.register(fastifyEnv, {
    schema: {
      type: 'object',
      required: [
        'NODE_ENV',
        'PORT',
        'DATABASE_URL',
        'JWT_SECRET',
        'SUI_RPC_URL',
        'SONAR_PACKAGE_ID',
        'WALRUS_AGGREGATOR_URL',
        'SEAL_NETWORK_URL',
      ],
      properties: {
        NODE_ENV: { type: 'string' },
        PORT: { type: 'string' },
        DATABASE_URL: { type: 'string' },
        JWT_SECRET: { type: 'string' },
        JWT_EXPIRES_IN: { type: 'string', default: '24h' },
        SUI_RPC_URL: { type: 'string' },
        SONAR_PACKAGE_ID: { type: 'string' },
        WALRUS_AGGREGATOR_URL: { type: 'string' },
        SEAL_NETWORK_URL: { type: 'string' },
        LOG_LEVEL: { type: 'string', default: 'info' },
        CORS_ORIGIN: { type: 'string', default: 'http://localhost:3000' },
      },
    },
  });

  // CORS
  const corsOrigin = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map((s: string) => s.trim());
  await fastify.register(fastifyCors, {
    origin: corsOrigin,
    credentials: true,
  });

  // Rate limiting
  await fastify.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
    cache: 10000,
    keyGenerator: (request) => {
      return request.ip || 'unknown';
    },
  });

  // Request ID tracking
  fastify.addHook('onRequest', async (request) => {
    request.id = crypto.randomUUID();
    request.log = logger.child({
      traceId: request.id,
      path: request.url,
      method: request.method,
    }) as any;
  });

  // Health check
  fastify.get('/health', async (_request, reply) => {
    try {
      // Test database connection
      await prisma.$queryRaw`SELECT 1`;
      const dbHealthy = true;

      return reply.send({
        status: dbHealthy ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: dbHealthy,
        walrus: true, // Mock status
      });
    } catch (error) {
      fastify.log.error(error, 'Health check failed');
      return reply.code(503).send({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: false,
        walrus: true,
      });
    }
  });

  // Register routes
  const { registerAuthRoutes } = await import('./routes/auth');
  const { registerDataRoutes } = await import('./routes/data');
  const { registerMonitoringRoutes } = await import('./routes/monitoring');
  const { registerLeaderboardRoutes } = await import('./routes/leaderboard');
  const { registerSearchRoutes } = await import('./routes/search');
  const { registerAnalyticsRoutes } = await import('./routes/analytics');
  const { registerDatasetRoutes } = await import('./routes/datasets');

  await registerAuthRoutes(fastify);
  await registerDataRoutes(fastify);
  await registerMonitoringRoutes(fastify);
  await registerLeaderboardRoutes(fastify);
  await registerSearchRoutes(fastify);
  await registerAnalyticsRoutes(fastify);
  await registerDatasetRoutes(fastify);

  fastify.log.info('Routes registered');

  // Start background jobs
  startDatasetIndexer();
  fastify.log.info('Dataset indexer cron started');

  // Error handler
  fastify.setErrorHandler((error, request, reply) => {
    request.log.error(error, 'Unhandled error');

    // Don't expose internal errors to client
    const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message;

    return reply.code(error.statusCode || 500).send({
      error: 'INTERNAL_ERROR',
      code: 'INTERNAL_ERROR',
      message: message,
    });
  });

  const port = parseInt(process.env.PORT || '3001', 10);
  const host = '0.0.0.0';

  try {
    await fastify.listen({ port, host });
    fastify.log.info(`Server running at http://${host}:${port}`);
  } catch (error) {
    fastify.log.error(error, 'Failed to bind to port');
    console.error('Port binding error:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');
  await prisma.$disconnect();
  process.exit(0);
});

start().catch((error) => {
  logger.error(error, 'Failed to start server');
  console.error('Startup error details:', error);
  process.exit(1);
});
