/**
 * @sonar/seal - Decryption APIs
 * High-level decryption functions with batch support and key caching
 */

import type { SealClient } from '@mysten/seal';
import { Transaction } from '@mysten/sui/transactions';
import type {
  DecryptFileOptions,
  DecryptionResult,
  DecryptionMetadata,
  BatchDecryptItem,
  BatchDecryptOptions,
  ProgressCallback,
} from './types';
import { DecryptionError, SessionExpiredError, PolicyDeniedError } from './errors';
import { DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE, DEFAULT_THRESHOLD } from './constants';
import { hexToBytes, retry } from './utils';
import { ensureSessionValid } from './session';

/**
 * Decrypt a file or data blob
 * Automatically detects envelope encryption and handles accordingly
 */
export async function decryptFile(
  client: SealClient,
  encryptedData: Uint8Array,
  options: DecryptFileOptions,
  onProgress?: ProgressCallback
): Promise<DecryptionResult> {
  const {
    sessionKey,
    packageId,
    identity,
    policyModule,
    policyArgs = [],
    suiClient,
  } = options;

  onProgress?.(0, 'Preparing decryption...');

  // Ensure session is valid
  try {
    ensureSessionValid(sessionKey);
  } catch (error) {
    throw new SessionExpiredError();
  }

  // Validate suiClient configuration
  if (!suiClient) {
    throw new DecryptionError(
      undefined,
      'Sui client not configured. Please provide a valid SuiClient instance.'
    );
  }

  // Build policy approval transaction only if policy module is specified
  let txBytes: Uint8Array;

  if (policyModule) {
    onProgress?.(10, 'Building policy transaction...');

    try {
      const tx = new Transaction();
      tx.setSender(sessionKey.getAddress());
      const target = `${packageId}::${policyModule}::seal_approve`;

      // Handle policy arguments based on policy type
      const args: any[] = [tx.pure.vector('u8', hexToBytes(identity))];

      if (policyModule === 'open_access_policy') {
        // Validate argument count
        if (!policyArgs || policyArgs.length < 2) {
          throw new DecryptionError(
            undefined,
            'open_access_policy requires 2 arguments: [upload_timestamp_ms, clock_object_id]'
          );
        }

        const timestampValue = policyArgs[0];
        const clockValue = policyArgs[1];

        // Validate timestamp parameter
        if (timestampValue === null || timestampValue === undefined || timestampValue === '') {
          throw new DecryptionError(
            undefined,
            `Invalid upload timestamp: expected non-empty string, got ${
              timestampValue === null ? 'null' : timestampValue === undefined ? 'undefined' : 'empty string'
            }`
          );
        }

        if (typeof timestampValue !== 'string') {
          throw new DecryptionError(
            undefined,
            `Invalid upload timestamp type: expected string, got ${typeof timestampValue}`
          );
        }

        // Validate clock parameter
        if (clockValue === null || clockValue === undefined || clockValue === '') {
          throw new DecryptionError(
            undefined,
            `Invalid clock object ID: expected non-empty string, got ${
              clockValue === null ? 'null' : clockValue === undefined ? 'undefined' : 'empty string'
            }`
          );
        }

        if (typeof clockValue !== 'string') {
          throw new DecryptionError(
            undefined,
            `Invalid clock object ID type: expected string, got ${typeof clockValue}`
          );
        }

        // Parse timestamp with range validation
        let uploadTimestampMs: bigint;
        try {
          uploadTimestampMs = BigInt(timestampValue);
        } catch (parseError) {
          throw new DecryptionError(
            undefined,
            `Failed to parse upload timestamp "${timestampValue}": expected valid integer`,
            parseError instanceof Error ? parseError : undefined
          );
        }

        // Validate timestamp range (2000-01-01 to 2100-01-01 in milliseconds)
        const MIN_TIMESTAMP_MS = 946684800000n; // 2000-01-01T00:00:00Z
        const MAX_TIMESTAMP_MS = 4102444800000n; // 2100-01-01T00:00:00Z

        if (uploadTimestampMs < MIN_TIMESTAMP_MS || uploadTimestampMs > MAX_TIMESTAMP_MS) {
          const isLikelSeconds = uploadTimestampMs > 1000000000n && uploadTimestampMs < 1000000000000n;
          throw new DecryptionError(
            undefined,
            `Invalid upload timestamp: ${uploadTimestampMs}. Expected milliseconds since epoch (2000-2100 range).${
              isLikelSeconds ? ' Did you pass seconds instead of milliseconds?' : ''
            }`
          );
        }

        // Build arguments for open_access_policy::seal_approve
        // Expects: seal_id (vector<u8>), upload_timestamp_ms (u64), clock (Clock)
        args.push(tx.pure.u64(uploadTimestampMs));
        args.push(tx.object(clockValue));
      } else {
        // Default: treat all remaining args as object IDs
        args.push(...policyArgs.map((arg) => tx.object(arg)));
      }

      tx.moveCall({
        target,
        arguments: args,
      });

      txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });
      onProgress?.(30, 'Checking access policy...');
    } catch (error) {
      throw new DecryptionError(
        undefined,
        'Failed to build policy transaction',
        error instanceof Error ? error : undefined
      );
    }
  } else {
    // No policy - build empty transaction
    onProgress?.(30, 'Building empty transaction...');
    try {
      const tx = new Transaction();
      tx.setSender(sessionKey.getAddress());
      txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });
    } catch (error) {
      throw new DecryptionError(
        undefined,
        'Failed to build empty transaction',
        error instanceof Error ? error : undefined
      );
    }
  }

  try {
    // Check if envelope encryption
    const isEnvelope = checkIfEnvelope(encryptedData);

    if (isEnvelope) {
      onProgress?.(40, 'Detected envelope encryption...');
      return await decryptEnvelope(
        client,
        encryptedData,
        sessionKey,
        txBytes,
        identity,
        policyModule,
        onProgress
      );
    } else {
      onProgress?.(40, 'Using direct Seal decryption...');
      return await decryptDirect(
        client,
        encryptedData,
        sessionKey,
        txBytes,
        identity,
        policyModule,
        onProgress
      );
    }
  } catch (error) {
    if (error instanceof DecryptionError) {
      throw error;
    }

    // If direct decryption failed and data looks like it might be an envelope,
    // try envelope decryption as fallback
    const errorMessage = error instanceof Error ? error.message : '';
    if (
      !checkIfEnvelope(encryptedData) &&
      (errorMessage.includes('RangeError') ||
        errorMessage.includes('Invalid array length') ||
        errorMessage.includes('buffer'))
    ) {
      try {
        console.log(
          '[Seal] Direct decryption failed with buffer/range error. Attempting envelope decryption fallback...'
        );
        onProgress?.(40, 'Retrying with envelope decryption...');
        return await decryptEnvelope(
          client,
          encryptedData,
          sessionKey,
          txBytes,
          identity,
          policyModule,
          onProgress
        );
      } catch (fallbackError) {
        console.log('[Seal] Envelope decryption fallback also failed:', fallbackError);
        // Continue to throw original error below
      }
    }

    // Check if policy denied (only relevant when policy module is specified)
    if (policyModule) {
      if (
        errorMessage.includes('denied') ||
        errorMessage.includes('unauthorized') ||
        errorMessage.includes('not allowed')
      ) {
        throw new PolicyDeniedError(policyModule);
      }
    }

    throw new DecryptionError(
      undefined,
      'Decryption failed',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Decrypt using direct Seal decryption
 */
async function decryptDirect(
  client: SealClient,
  encryptedData: Uint8Array,
  sessionKey: any,
  txBytes: Uint8Array,
  identity: string,
  policyModule: string | undefined,
  onProgress?: ProgressCallback
): Promise<DecryptionResult> {
  onProgress?.(50, 'Decrypting with Seal...');

  const decryptedBytes = await client.decrypt({
    data: encryptedData,
    sessionKey,
    txBytes,
  });

  onProgress?.(100, 'Decryption complete');

  const metadata: DecryptionMetadata = {
    decryptedAt: Date.now(),
    identity,
    policyModule,
  };

  return {
    data: decryptedBytes,
    metadata,
  };
}

/**
 * Decrypt using envelope decryption (Seal + AES)
 */
async function decryptEnvelope(
  client: SealClient,
  envelope: Uint8Array,
  sessionKey: any,
  txBytes: Uint8Array,
  identity: string,
  policyModule: string | undefined,
  onProgress?: ProgressCallback
): Promise<DecryptionResult> {
  onProgress?.(40, 'Extracting sealed key...');

  // Extract sealed key from envelope
  const { sealedKey, encryptedFile } = parseEnvelope(envelope);

  onProgress?.(50, 'Decrypting AES key...');

  // Decrypt the sealed AES key
  const aesKey = await client.decrypt({
    data: sealedKey,
    sessionKey,
    txBytes,
  });

  onProgress?.(70, 'Decrypting file with AES...');

  // Decrypt the file with AES
  const decryptedFile = await decryptWithAES(encryptedFile, aesKey);

  onProgress?.(100, 'Envelope decryption complete');

  const metadata: DecryptionMetadata = {
    decryptedAt: Date.now(),
    identity,
    policyModule,
  };

  return {
    data: decryptedFile,
    metadata,
  };
}

/**
 * Check if data uses envelope encryption
 * Envelope format: [4 bytes key length][sealed key][encrypted file]
 */
function checkIfEnvelope(data: Uint8Array): boolean {
  if (data.length < 4) {
    console.log('[Seal] checkIfEnvelope: Data too short', { dataLength: data.length });
    return false;
  }

  // Read key length from first 4 bytes
  const view = new DataView(data.buffer, data.byteOffset, 4);
  const keyLength = view.getUint32(0, true); // little-endian

  const isValid = keyLength >= 150 && keyLength <= 800 && data.length > keyLength + 4;

  // Log the detection details
  if (!isValid) {
    console.log('[Seal] checkIfEnvelope: Detection failed', {
      keyLength,
      dataLength: data.length,
      expectedEnvelopeSize: keyLength + 4,
      reasons: {
        keyLengthInRange: keyLength >= 150 && keyLength <= 800,
        hasEnoughData: data.length > keyLength + 4,
      },
    });
  } else {
    console.log('[Seal] checkIfEnvelope: Envelope detected', {
      keyLength,
      dataLength: data.length,
      encryptedFileSize: data.length - keyLength - 4,
    });
  }

  return isValid;
}

/**
 * Parse envelope format to extract sealed key and encrypted file
 */
function parseEnvelope(envelope: Uint8Array): {
  sealedKey: Uint8Array;
  encryptedFile: Uint8Array;
} {
  // Read key length
  const view = new DataView(envelope.buffer, envelope.byteOffset, 4);
  const keyLength = view.getUint32(0, true);

  // Extract sealed key
  const sealedKey = envelope.slice(4, 4 + keyLength);

  // Extract encrypted file
  const encryptedFile = envelope.slice(4 + keyLength);

  return { sealedKey, encryptedFile };
}

/**
 * Decrypt data with AES-256-GCM
 */
async function decryptWithAES(
  data: Uint8Array,
  key: Uint8Array
): Promise<Uint8Array> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new DecryptionError(
      undefined,
      'Web Crypto API not available. This feature requires a browser environment or Node.js with webcrypto support.'
    );
  }

  try {
    // Extract IV (first 12 bytes)
    const iv = data.slice(0, 12);
    const ciphertext = data.slice(12);

    // Import AES key
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(key),
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    // Decrypt data
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      cryptoKey,
      ciphertext
    );

    return new Uint8Array(decrypted);
  } catch (error) {
    throw new DecryptionError(
      undefined,
      'AES decryption failed',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Batch decrypt multiple files with key caching
 * More efficient than individual decrypts for multiple files
 */
export async function batchDecrypt(
  client: SealClient,
  items: BatchDecryptItem[],
  options: BatchDecryptOptions,
  onProgress?: ProgressCallback
): Promise<Map<string, DecryptionResult>> {
  const {
    sessionKey,
    packageId,
    policyModule,
    suiClient,
    threshold = DEFAULT_THRESHOLD,
    batchSize = DEFAULT_BATCH_SIZE,
  } = options;

  const results = new Map<string, DecryptionResult>();
  const actualBatchSize = Math.min(batchSize, MAX_BATCH_SIZE);

  onProgress?.(0, `Decrypting ${items.length} files...`);

  // Validate suiClient configuration
  if (!suiClient) {
    throw new DecryptionError(
      undefined,
      'Sui client not configured. Please provide a valid SuiClient instance.'
    );
  }

  // Ensure session is valid
  ensureSessionValid(sessionKey);

  // Process in batches
  for (let i = 0; i < items.length; i += actualBatchSize) {
    const batch = items.slice(i, i + actualBatchSize);
    const batchNum = Math.floor(i / actualBatchSize) + 1;
    const totalBatches = Math.ceil(items.length / actualBatchSize);

    onProgress?.(
      (i / items.length) * 50,
      `Pre-fetching keys for batch ${batchNum}/${totalBatches}...`
    );

    // Build batch transaction
    try {
      const tx = new Transaction();
      tx.setSender(sessionKey.getAddress());
      batch.forEach((item) => {
        tx.moveCall({
          target: `${packageId}::${policyModule}::seal_approve`,
          arguments: [tx.pure.vector('u8', hexToBytes(item.identity))],
        });
      });

      const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });

      // Pre-fetch decryption keys for batch
      await client.fetchKeys({
        ids: batch.map((item) => item.identity),
        sessionKey,
        txBytes,
        threshold,
      });

      onProgress?.(
        50 + (i / items.length) * 50,
        `Decrypting batch ${batchNum}/${totalBatches}...`
      );

      // Decrypt files using cached keys
      for (const item of batch) {
        try {
          const result = await decryptFile(
            client,
            item.encryptedData,
            {
              sessionKey,
              packageId,
              identity: item.identity,
              policyModule,
              suiClient,
            }
          );

          results.set(item.identity, result);
        } catch (error) {
          console.error(`Failed to decrypt ${item.identity}:`, error);
          // Continue with other files
        }
      }
    } catch (batchError) {
      console.error(`Failed to process batch ${batchNum}/${totalBatches}:`, batchError);
      // Continue with next batch
    }
  }

  onProgress?.(100, `Decrypted ${results.size}/${items.length} files`);

  return results;
}

/**
 * Decrypt metadata (JSON)
 */
export async function decryptMetadata<T = any>(
  client: SealClient,
  encryptedData: Uint8Array,
  options: DecryptFileOptions
): Promise<T> {
  const result = await decryptFile(client, encryptedData, options);

  // Decode JSON
  const json = new TextDecoder().decode(result.data);
  return JSON.parse(json);
}

/**
 * Decrypt with retry logic (for flaky network)
 */
export async function decryptFileWithRetry(
  client: SealClient,
  encryptedData: Uint8Array,
  options: DecryptFileOptions,
  maxRetries: number = 3,
  onProgress?: ProgressCallback
): Promise<DecryptionResult> {
  return retry(
    () => decryptFile(client, encryptedData, options, onProgress),
    { maxAttempts: maxRetries }
  );
}
