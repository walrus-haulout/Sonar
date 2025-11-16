/**
 * Monitoring and Alerting Routes
 * Exposes vector database monitoring metrics and alerts
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../lib/logger';
import { vectorMonitor } from '../lib/monitoring/vector-monitor';
import { redisCache } from '../lib/cache/redis-cache';

/**
 * GET /api/monitoring/vector-db
 * Get vector database performance metrics
 */
async function getVectorMetrics(
  _request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const metrics = vectorMonitor.getMetrics();
    const alerts = vectorMonitor.getAlerts();

    return reply.send({
      timestamp: new Date().toISOString(),
      metrics,
      alerts,
      status: metrics.success_rate >= 95 ? 'healthy' : 'degraded',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get vector metrics');
    return reply.code(500).send({
      error: 'METRICS_FAILED',
      message: 'Failed to retrieve metrics',
    });
  }
}

/**
 * GET /api/monitoring/cache
 * Get cache performance metrics
 */
async function getCacheMetrics(
  _request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const stats = redisCache.getStats();

    return reply.send({
      timestamp: new Date().toISOString(),
      cache: {
        ...stats,
        hit_rate_percent: (stats.hit_rate * 100).toFixed(2),
        status:
          stats.hit_rate > 0.3 ? 'healthy' : stats.size > 0 ? 'warming' : 'empty',
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get cache metrics');
    return reply.code(500).send({
      error: 'METRICS_FAILED',
      message: 'Failed to retrieve cache metrics',
    });
  }
}

/**
 * GET /api/monitoring/alerts
 * Get recent alerts
 */
async function getAlerts(_request: FastifyRequest, reply: FastifyReply) {
  try {
    const alerts = vectorMonitor.getAlerts();

    return reply.send({
      timestamp: new Date().toISOString(),
      alerts,
      count: alerts.length,
      critical_count: alerts.filter((a) => a.severity === 'critical').length,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get alerts');
    return reply.code(500).send({
      error: 'ALERTS_FAILED',
      message: 'Failed to retrieve alerts',
    });
  }
}

/**
 * POST /api/monitoring/alerts/clear
 * Clear alerts
 */
async function clearAlerts(_request: FastifyRequest, reply: FastifyReply) {
  try {
    vectorMonitor.clearAlerts();

    return reply.send({
      timestamp: new Date().toISOString(),
      message: 'Alerts cleared',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to clear alerts');
    return reply.code(500).send({
      error: 'CLEAR_FAILED',
      message: 'Failed to clear alerts',
    });
  }
}

/**
 * POST /api/monitoring/cache/clear
 * Clear cache
 */
async function clearCache(_request: FastifyRequest, reply: FastifyReply) {
  try {
    redisCache.clear();

    return reply.send({
      timestamp: new Date().toISOString(),
      message: 'Cache cleared',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to clear cache');
    return reply.code(500).send({
      error: 'CLEAR_FAILED',
      message: 'Failed to clear cache',
    });
  }
}

/**
 * GET /api/monitoring/health
 * Get overall system health
 */
async function getHealth(_request: FastifyRequest, reply: FastifyReply) {
  try {
    const vectorMetrics = vectorMonitor.getMetrics();
    const cacheStats = redisCache.getStats();
    const alerts = vectorMonitor.getAlerts();

    const criticalAlerts = alerts.filter(
      (a) => a.severity === 'critical'
    ).length;

    const health = {
      timestamp: new Date().toISOString(),
      status:
        criticalAlerts > 0
          ? 'critical'
          : vectorMetrics.success_rate < 90
            ? 'degraded'
            : 'healthy',
      components: {
        vector_db: {
          status: vectorMetrics.success_rate >= 95 ? 'healthy' : 'degraded',
          success_rate: vectorMetrics.success_rate,
          avg_latency_ms: vectorMetrics.avg_latency_ms,
        },
        cache: {
          status: cacheStats.hit_rate > 0.3 ? 'healthy' : 'warming',
          hit_rate: (cacheStats.hit_rate * 100).toFixed(2),
          size: cacheStats.size,
        },
      },
      alerts: {
        total: alerts.length,
        critical: criticalAlerts,
      },
    };

    return reply.send(health);
  } catch (error) {
    logger.error({ error }, 'Failed to get health status');
    return reply.code(500).send({
      error: 'HEALTH_CHECK_FAILED',
      message: 'Failed to check system health',
    });
  }
}

export async function registerMonitoringRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/monitoring/vector-db',
    {
      schema: {
        description: 'Get vector database performance metrics',
        response: {
          200: {
            type: 'object',
            properties: {
              timestamp: { type: 'string' },
              metrics: { type: 'object' },
              alerts: { type: 'array' },
              status: { type: 'string' },
            },
          },
        },
      },
    },
    getVectorMetrics
  );

  fastify.get(
    '/api/monitoring/cache',
    {},
    getCacheMetrics
  );

  fastify.get(
    '/api/monitoring/alerts',
    {},
    getAlerts
  );

  fastify.post(
    '/api/monitoring/alerts/clear',
    {},
    clearAlerts
  );

  fastify.post(
    '/api/monitoring/cache/clear',
    {},
    clearCache
  );

  fastify.get(
    '/api/monitoring/health',
    {},
    getHealth
  );

  logger.info('Monitoring routes registered');
}
