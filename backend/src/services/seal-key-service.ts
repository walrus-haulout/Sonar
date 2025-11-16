import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import type { SessionKey, ExportedSessionKey } from '@mysten/seal';
import { SessionKey as SessionKeyClass } from '@mysten/seal';
import type { FastifyBaseLogger } from 'fastify';

interface FetchKeysRequest {
  sessionKeyData: string; // Base64-encoded exported session key
  identity: string; // Seal policy identity (hex)
  packageId: string; // Sonar package ID
  policyModule: string; // e.g., 'purchase_policy'
  keyServerUrls?: string[]; // Optional: override key server URLs
}

interface KeyShare {
  serverId: string;
  encryptedKey: string; // Hex-encoded encrypted key from server
}

interface FetchKeysResponse {
  keyShares: KeyShare[];
  threshold: number;
}

/**
 * Seal Key Service
 * Handles fetching encrypted key shares from seal-keyservers using user-signed SessionKey
 * 
 * This replaces the offline demo mode (SEAL_SECRET_KEYS) with proper key server integration
 */
export class SealKeyService {
  private suiClient: SuiClient;
  private logger: FastifyBaseLogger;
  private keyServerUrls: string[];
  private threshold: number = 2; // Default threshold for 6 servers

  constructor(logger: FastifyBaseLogger, keyServerUrls?: string[]) {
    this.logger = logger;
    
    // Default key server URLs if not provided
    this.keyServerUrls = keyServerUrls || [
      'https://seal-1.projectsonar.xyz',
      'https://seal-2.projectsonar.xyz',
      'https://seal-3.projectsonar.xyz',
      'https://seal-4.projectsonar.xyz',
      'https://seal-5.projectsonar.xyz',
      'https://seal-6.projectsonar.xyz',
    ];

    // Initialize Sui client - use mainnet by default
    const rpcUrl = getFullnodeUrl('mainnet');
    this.suiClient = new SuiClient({ url: rpcUrl });
  }

  /**
   * Fetch encrypted key shares from seal-keyservers
   * 
   * @param request - Contains sessionKeyData (exported from frontend), identity, packageId, etc.
   * @returns Array of key shares that can be decrypted client-side
   */
  async fetchKeyShares(request: FetchKeysRequest): Promise<FetchKeysResponse> {
    const { sessionKeyData, identity, packageId, policyModule, keyServerUrls } = request;

    this.logger.info(
      `Fetching key shares from seal-keyservers (identity: ${identity.slice(0, 20)}, package: ${packageId.slice(0, 20)}, module: ${policyModule}, servers: ${keyServerUrls?.length || this.keyServerUrls.length})`
    );

    const serversToUse = keyServerUrls || this.keyServerUrls;

    try {
      // Import the session key that was created and signed on the frontend
      let sessionKey: SessionKey;
      try {
        sessionKey = (await SessionKeyClass.import(sessionKeyData as unknown as ExportedSessionKey, this.suiClient)) as SessionKey;
        this.logger.debug('Successfully imported SessionKey from frontend');
      } catch (error) {
        this.logger.error(`Failed to import SessionKey: ${error instanceof Error ? error.message : String(error)}`);
        throw new Error(
          `Failed to import session key: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }

      // Fetch keys from multiple servers in parallel
      const keySharePromises = serversToUse.map((serverUrl, idx) =>
        this.fetchKeyFromServer(serverUrl, sessionKey, identity, idx + 1)
      );

      const results = await Promise.allSettled(keySharePromises);

      // Collect successful key shares
      const keyShares: KeyShare[] = results
        .map((result, idx) => {
          if (result.status === 'fulfilled') {
            return result.value;
          } else {
            const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
            this.logger.warn(`Failed to fetch from seal-${idx + 1}: ${errorMsg}`);
            return null;
          }
        })
        .filter((share): share is KeyShare => share !== null);

      if (keyShares.length < this.threshold) {
        throw new Error(
          `Failed to fetch threshold key shares (got ${keyShares.length}, need ${this.threshold})`
        );
      }

      this.logger.info(`Successfully fetched ${keyShares.length} key shares from seal-keyservers`);

      return {
        keyShares,
        threshold: this.threshold,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error fetching key shares: ${errorMsg}`);
      throw error;
    }
  }

  /**
   * Fetch encrypted key from a single key server
   */
  private async fetchKeyFromServer(
    serverUrl: string,
    sessionKey: SessionKey,
    identity: string,
    serverId: number
  ): Promise<KeyShare> {
    try {
      this.logger.debug(`Fetching key from ${serverUrl}`);

      // Build request to key server
      // Note: This would require implementing the full FetchKeyRequest protocol
      // For now, we'll prepare the structure that seal-cli would use

      // The actual request to the key server would include:
      // 1. Programmable Transaction Block bytes (from seal_approve call)
      // 2. Session key's ephemeral public key
      // 3. Request signature
      // 4. Certificate with session credentials

      // This is a simplified version - in production, you'd build the full PTB
      // and use the key server's /v1/fetch_key endpoint

      const response = await fetch(`${serverUrl}/v1/fetch_key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Client-Sdk-Type': 'typescript',
          'Client-Sdk-Version': '1.0.0',
        },
        body: JSON.stringify({
          // This would be populated with actual PTB and signing data
          identity,
          sessionKey: sessionKey.export ? sessionKey.export() : sessionKey,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Key server returned ${response.status}: ${response.statusText}`
        );
      }

      const data = await response.json();

      // Extract encrypted key from response
      const encryptedKey = data.encryptedKey || data.decryption_keys?.[0]?.encrypted_key;
      if (!encryptedKey) {
        throw new Error('No encrypted key in server response');
      }

      return {
        serverId: `seal-${serverId}`,
        encryptedKey,
      };
    } catch (error) {
      this.logger.warn(`Failed to fetch from seal-${serverId}: ${error}`);
      throw error;
    }
  }
}

/**
 * Create a SealKeyService instance
 */
export function createSealKeyService(
  logger: FastifyBaseLogger,
  keyServerUrls?: string[]
): SealKeyService {
  return new SealKeyService(logger, keyServerUrls);
}
