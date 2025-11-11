/**
 * Monitoring API Routes
 */

import type { FastifyInstance } from 'fastify';

export async function registerMonitoringRoutes(fastify: FastifyInstance) {
  // Monitoring routes can be added here in the future
  fastify.log.info('Monitoring routes registered');
}
