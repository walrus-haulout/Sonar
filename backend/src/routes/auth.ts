/**
 * Authentication routes
 * POST /auth/challenge - Request signing challenge
 * POST /auth/verify - Verify signature and get JWT
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  generateNonce,
  storeNonce,
  getNonceEntry,
  consumeNonce,
} from '../lib/auth/nonce';
import {
  generateToken,
  verifyToken,
} from '../lib/auth/jwt';
import {
  verifyWalletSignature,
  isValidAddress,
} from '../lib/auth/verify';
import {
  createAuthMessage,
  parseAuthMessage,
  isMessageExpired,
} from '@sonar/shared/auth';
import { ErrorCode } from '@sonar/shared';
import type { AuthChallenge, AuthVerifyRequest, AuthToken } from '@sonar/shared';

/**
 * Request body for POST /auth/challenge
 */
interface ChallengeRequest {
  address: string;
}

/**
 * Register auth routes
 */
export async function registerAuthRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /auth/challenge
   * Request a signing challenge for wallet authentication
   */
  fastify.post<{ Body: ChallengeRequest }>(
    '/auth/challenge',
    async (request: FastifyRequest<{ Body: ChallengeRequest }>, reply: FastifyReply) => {
      try {
        const { address } = request.body;

        // Validate address format
        if (!address || !isValidAddress(address)) {
          request.log.warn({ address }, 'Invalid address format');
          return reply.code(400).send({
            error: ErrorCode.INVALID_REQUEST,
            code: ErrorCode.INVALID_REQUEST,
            message: 'Invalid wallet address format',
          });
        }

        // Generate nonce and message
        const nonce = generateNonce();
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
        const message = createAuthMessage(address, nonce, expiresAt);

        // Store nonce with message for verification
        storeNonce(nonce, message, 5 * 60 * 1000);

        request.log.info({ address }, 'Challenge requested');

        const response: AuthChallenge = {
          nonce,
          message,
          expiresAt,
        };

        return reply.send(response);
      } catch (error) {
        request.log.error(error, 'Challenge request failed');
        return reply.code(500).send({
          error: ErrorCode.INTERNAL_ERROR,
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Failed to generate challenge',
        });
      }
    }
  );

  /**
   * POST /auth/verify
   * Verify signed message and return JWT token
   */
  fastify.post<{ Body: AuthVerifyRequest }>(
    '/auth/verify',
    async (request: FastifyRequest<{ Body: AuthVerifyRequest }>, reply: FastifyReply) => {
      try {
        const { address, signature, nonce, message } = request.body;

        // Validate request format
        if (!address || !signature || !nonce || !message) {
          request.log.warn({ address }, 'Missing required fields');
          return reply.code(400).send({
            error: ErrorCode.INVALID_REQUEST,
            code: ErrorCode.INVALID_REQUEST,
            message: 'Missing address, signature, nonce, or message',
          });
        }

        // Validate address format
        if (!isValidAddress(address)) {
          request.log.warn({ address }, 'Invalid address format');
          return reply.code(400).send({
            error: ErrorCode.INVALID_REQUEST,
            code: ErrorCode.INVALID_REQUEST,
            message: 'Invalid wallet address format',
          });
        }

        // Get nonce entry (without mutating state)
        const nonceEntry = getNonceEntry(nonce);
        if (!nonceEntry) {
          request.log.warn({ nonce }, 'Invalid, expired, or already-used nonce');
          return reply.code(401).send({
            error: ErrorCode.NONCE_INVALID,
            code: ErrorCode.NONCE_INVALID,
            message: 'Invalid or expired nonce. Request a new challenge.',
          });
        }

        const storedMessage = nonceEntry.message;

        // Validate that the provided message matches the stored message
        if (message !== storedMessage) {
          request.log.warn({ address }, 'Message does not match stored challenge');
          return reply.code(401).send({
            error: ErrorCode.INVALID_SIGNATURE,
            code: ErrorCode.INVALID_SIGNATURE,
            message: 'Message does not match the challenge',
          });
        }

        // Verify the signature against the stored message
        let isValid = false;
        try {
          isValid = await verifyWalletSignature(address, storedMessage, signature);
        } catch (error) {
          request.log.error(error, 'Signature verification failed');
          return reply.code(401).send({
            error: ErrorCode.INVALID_SIGNATURE,
            code: ErrorCode.INVALID_SIGNATURE,
            message: 'Failed to verify signature',
          });
        }

        if (!isValid) {
          request.log.warn({ address }, 'Invalid signature');
          return reply.code(401).send({
            error: ErrorCode.INVALID_SIGNATURE,
            code: ErrorCode.INVALID_SIGNATURE,
            message: 'Invalid wallet signature',
          });
        }

        // SUCCESS: Signature verified. Consume nonce to prevent replay attacks.
        consumeNonce(nonce);

        // Generate JWT token
        const { token, expiresAt } = generateToken(address);

        request.log.info({ address }, 'User authenticated');

        const response: AuthToken = {
          token,
          expiresAt,
        };

        return reply.send(response);
      } catch (error) {
        request.log.error(error, 'Verification failed');
        return reply.code(500).send({
          error: ErrorCode.INTERNAL_ERROR,
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Failed to verify signature',
        });
      }
    }
  );
}
