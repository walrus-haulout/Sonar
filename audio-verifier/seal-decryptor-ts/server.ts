import Fastify from 'fastify';
import { SealClient, SessionKey, EncryptedObject } from '@mysten/seal';
import { fromHEX, toHEX } from '@mysten/bcs';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { DecryptRequestSchema, DecryptResponse, ErrorResponse, errorTypeToHttpStatus } from './types';

const SEAL_SERVICE_PORT = parseInt(process.env.SEAL_SERVICE_PORT || '3001', 10);
const SEAL_SERVICE_HOST = process.env.SEAL_SERVICE_HOST || '127.0.0.1';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const fastify = Fastify({
  logger: {
    level: LOG_LEVEL,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    },
  },
});

/**
 * Build full server configurations from keyServers in session data
 * Maps objectIds to their network URLs via environment variable
 */
function buildServerConfigs(keyServers: any[]): any[] {
  const urlMapEnv = process.env.SEAL_KEY_SERVER_URLS || '{}';
  let urlMap: Record<string, string> = {};
  try {
    urlMap = JSON.parse(urlMapEnv);
  } catch (e) {
    fastify.log.warn('[buildServerConfigs] Failed to parse SEAL_KEY_SERVER_URLS env var');
  }

  const serverConfigs = (Array.isArray(keyServers) ? keyServers : [])
    .filter((server: any) => server && typeof server.objectId === 'string')
    .map((server: any) => {
      const url = urlMap[server.objectId];
      if (!url) {
        fastify.log.debug(`[buildServerConfigs] No URL configured for server ${server.objectId.slice(0, 8)}...`);
      }
      return {
        objectId: server.objectId,
        weight: server.weight || 1,
        ...(url && { url }),
      };
    });

  return serverConfigs;
}

/**
 * Decrypt using SessionKey-based authentication
 */
async function decryptWithSessionKey(
  encryptedObjectHex: string,
  identity: string,
  sessionKeyData: string,
  network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<Uint8Array> {
  let encryptedObjectBytes: Uint8Array;
  try {
    encryptedObjectBytes = fromHEX(encryptedObjectHex);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw {
      error: `Failed to parse encrypted object: ${msg}`,
      errorType: 'validation_failed',
    };
  }

  // Initialize Sui client
  const rpcUrl = getFullnodeUrl(network);
  const suiClient = new SuiClient({ url: rpcUrl });

  // Parse and validate session key data
  let sessionKeyObj: any;
  let sessionKey: SessionKey;
  try {
    sessionKeyObj = JSON.parse(sessionKeyData);
    fastify.log.debug('[decryptWithSessionKey] Session key data:', {
      keyServersCount: sessionKeyObj.keyServers?.length ?? 0,
      threshold: sessionKeyObj.threshold ?? 'missing',
      hasKeyServers: Array.isArray(sessionKeyObj.keyServers),
    });

    // Validate required fields for SessionKey import
    if (!sessionKeyObj.keyServers || !Array.isArray(sessionKeyObj.keyServers) || sessionKeyObj.keyServers.length === 0) {
      throw new Error(
        'SessionKey missing keyServers array. Frontend must include key server configuration (NEXT_PUBLIC_SEAL_KEY_SERVERS env var).'
      );
    }

    if (sessionKeyObj.threshold === undefined || sessionKeyObj.threshold === null) {
      throw new Error('SessionKey missing threshold. Frontend must include NEXT_PUBLIC_SEAL_THRESHOLD env var.');
    }

    sessionKey = SessionKey.import(sessionKeyObj, suiClient);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw {
      error: `Failed to import SessionKey: ${msg}`,
      errorType: msg.includes('keyServers') || msg.includes('threshold') ? 'validation_failed' : 'authentication_failed',
    };
  }

  // Initialize Seal client with server configurations
  const serverConfigs = buildServerConfigs(sessionKeyObj.keyServers || []);

  if (serverConfigs.length === 0) {
    throw {
      error: 'Failed to build server configurations from keyServers. Check SEAL_KEY_SERVER_URLS environment variable.',
      errorType: 'validation_failed',
    };
  }

  fastify.log.debug('[decryptWithSessionKey] SealClient initialized', {
    serverCount: serverConfigs.length,
  });

  const sealClient = new SealClient({
    suiClient,
    serverConfigs,
  });

  // Build transaction for decryption with seal_approve moveCall
  const tx = new Transaction();
  tx.setSender(sessionKey.getAddress());

  const packageId = sessionKeyObj.packageId;
  if (!packageId) {
    throw {
      error: 'packageId missing from session key data',
      errorType: 'validation_failed',
    };
  }

  // Call seal_approve on the open_access_policy module for verification
  const policyModule = 'open_access_policy';
  const identityBytes = fromHEX(identity);
  const uploadTimestamp = BigInt(sessionKeyObj.creationTimeMs);
  const CLOCK_OBJECT_ID = '0x6'; // Sui well-known Clock object

  tx.moveCall({
    target: `${packageId}::${policyModule}::seal_approve`,
    arguments: [
      tx.pure.vector('u8', identityBytes),
      tx.pure.u64(uploadTimestamp),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  try {
    const txBytes = await tx.build({
      client: suiClient,
      onlyTransactionKind: true,
    });

    // Decrypt using SessionKey with transaction
    const plaintext = await sealClient.decrypt({
      data: encryptedObjectBytes,
      sessionKey,
      txBytes,
    });

    return plaintext;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const msgLower = msg.toLowerCase();

    // Classify error type
    let errorType = 'decryption_failed';
    if (msgLower.includes('no sessions') || msgLower.includes('no access') || msgLower.includes('permission') || msgLower.includes('denied')) {
      errorType = 'authentication_failed';
    } else if (msgLower.includes('timeout') || msgLower.includes('econnrefused') || msgLower.includes('enotfound')) {
      errorType = 'network_error';
    }

    throw {
      error: `SessionKey-based decryption failed: ${msg}`,
      errorType,
    };
  }
}

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Decrypt endpoint
fastify.post<{ Body: any }>('/decrypt', async (request, reply) => {
  try {
    // Validate request
    const validatedRequest = DecryptRequestSchema.parse(request.body);

    fastify.log.info('[/decrypt] Request received', {
      encryptedObjectHexLength: validatedRequest.encrypted_object_hex.length,
      identityLength: validatedRequest.identity.length,
      network: validatedRequest.network,
    });

    // Decrypt
    const plaintext = await decryptWithSessionKey(
      validatedRequest.encrypted_object_hex,
      validatedRequest.identity,
      validatedRequest.session_key_data,
      validatedRequest.network || 'mainnet'
    );

    const plaintextHex = toHEX(plaintext);

    fastify.log.info('[/decrypt] Decryption successful', {
      plaintextHexLength: plaintextHex.length,
      plaintextBytes: plaintextHex.length / 2,
    });

    const response: DecryptResponse = { plaintextHex };
    return response;
  } catch (e) {
    let error = e as any;
    if (!(error && typeof error === 'object' && error.errorType)) {
      // Unexpected error
      fastify.log.error('[/decrypt] Unexpected error', { error: e });
      error = {
        error: e instanceof Error ? e.message : String(e),
        errorType: 'unknown',
      };
    }

    const statusCode = errorTypeToHttpStatus(error.errorType);
    fastify.log.warn('[/decrypt] Request failed', {
      errorType: error.errorType,
      statusCode,
      message: error.error,
    });

    const response: ErrorResponse = {
      error: error.error,
      errorType: error.errorType,
    };

    reply.status(statusCode).send(response);
  }
});

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: SEAL_SERVICE_PORT, host: SEAL_SERVICE_HOST });
    fastify.log.info(`Seal decryption service started on ${SEAL_SERVICE_HOST}:${SEAL_SERVICE_PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
