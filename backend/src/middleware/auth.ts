/**
 * Fastify auth middleware for JWT validation
 */

import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyToken } from "../lib/auth/jwt";
import { ErrorCode } from "@sonar/shared";

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      JWT_SECRET: string;
      ADMIN_API_KEY?: string;
    }
  }
}

declare module "fastify" {
  interface FastifyRequest {
    user?: {
      address: string;
    };
  }
}

/**
 * Auth middleware that verifies JWT token
 * Attaches user context to request if valid
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply.code(401).send({
      error: ErrorCode.MISSING_AUTH,
      code: ErrorCode.MISSING_AUTH,
      message: "Missing authorization token",
    });
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    return reply.code(401).send({
      error: ErrorCode.INVALID_TOKEN,
      code: ErrorCode.INVALID_TOKEN,
      message: "Invalid or expired token",
    });
  }

  // Attach user to request
  request.user = {
    address: payload.address,
  };
}

/**
 * Optional auth middleware - doesn't fail if no token
 * Useful for routes that work with or without auth
 */
export async function optionalAuthMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return;
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (payload) {
    request.user = {
      address: payload.address,
    };
  }
}

/**
 * Create a route guard that requires auth
 * Can be used with onRequest hook
 */
export function requireAuth(request: FastifyRequest, reply: FastifyReply): void {
  if (!request.user) {
    reply.code(401).send({
      error: ErrorCode.MISSING_AUTH,
      code: ErrorCode.MISSING_AUTH,
      message: 'Authentication required',
    });
  }
}

/**
 * Admin auth middleware using API key
 * Protects sensitive admin endpoints
 */
export async function adminAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const adminApiKey = process.env.ADMIN_API_KEY;

  if (!adminApiKey) {
    request.log.error('ADMIN_API_KEY not configured');
    return reply.code(503).send({
      error: ErrorCode.SERVER_ERROR,
      code: ErrorCode.SERVER_ERROR,
      message: 'Admin functionality not configured',
    });
  }

  const providedKey = request.headers['x-admin-key'];

  if (!providedKey || providedKey !== adminApiKey) {
    request.log.warn({ ip: request.ip }, 'Unauthorized admin access attempt');
    return reply.code(403).send({
      error: ErrorCode.FORBIDDEN,
      code: ErrorCode.FORBIDDEN,
      message: 'Admin access denied',
    });
  }
}
