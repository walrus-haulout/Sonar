import { SealClient, SessionKey, EncryptedObject } from '@mysten/seal';
import { fromHEX, toHEX } from '@mysten/bcs';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { z } from 'zod';

// Input validation schema - SessionKey-only (legacy keys removed)
const DecryptRequestSchema = z.object({
    encrypted_object_hex: z.string().min(1, "encrypted_object_hex is required"),
    identity: z.string().min(1, "identity is required"),
    session_key_data: z.string().min(1, "session_key_data is required for SessionKey-based decryption"),
    network: z.enum(['mainnet', 'testnet']).optional().default('mainnet'),
});

type DecryptRequest = z.infer<typeof DecryptRequestSchema>;

/**
 * Build full server configurations from keyServers in session data
 * Maps objectIds to their network URLs via environment variable
 *
 * SEAL_KEY_SERVER_URLS format (JSON): {
 *   "0x4af91bd94b19e1fabd12586b5392571f7b76e9b6076ef0813b0a1352fa3d2d10": "https://seal-server-1.railway.app",
 *   "0x6f0c33c9fa69d466a32ba1291174604bf4c7a58d7efc986341fe3c169c30338c": "https://seal-server-2.railway.app",
 *   ...
 * }
 */
function buildServerConfigs(keyServers: any[]): any[] {
    // Parse URL mappings from environment
    const urlMapEnv = process.env.SEAL_KEY_SERVER_URLS || '{}';
    let urlMap: Record<string, string> = {};
    try {
        urlMap = JSON.parse(urlMapEnv);
    } catch (e) {
        console.warn('[decrypt] Failed to parse SEAL_KEY_SERVER_URLS env var, using empty map');
    }

    // Build server configs by mapping keyServers to their URLs
    const serverConfigs = (Array.isArray(keyServers) ? keyServers : [])
        .filter((server: any) => server && typeof server.objectId === 'string')
        .map((server: any) => {
            const url = urlMap[server.objectId];
            if (!url && (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV !== 'production')) {
                console.warn(`[decrypt] No URL configured for server ${server.objectId.slice(0, 8)}...`);
            }
            return {
                objectId: server.objectId,
                weight: server.weight || 1,
                ...(url && { url }), // Only include url if available
            };
        });

    return serverConfigs;
}

async function main() {
    try {
        // Read input from command line args
        const inputStr = process.argv[2];

        if (!inputStr) {
            throw new Error("Usage: bun run decrypt.ts <json_input>");
        }

        // Validate input JSON
        let rawRequest;
        try {
            rawRequest = JSON.parse(inputStr);
        } catch (e) {
            throw new Error("Invalid JSON input");
        }

        const request = DecryptRequestSchema.parse(rawRequest);

        // Decrypt using SessionKey (only supported method)
        const plaintext = await decryptWithSessionKey(request);

        // Output decrypted plaintext as hex to stdout
        const hexOutput = toHEX(plaintext);
        console.log(hexOutput);

    } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.error("Error:", errorMsg);
        process.exit(1);
    }
}

/**
 * Decrypt using SessionKey-based authentication
 * Supports online decryption via key servers
 *
 * @param request - Decryption request with:
 *   - encrypted_object_hex: BCS-encoded EncryptedObject
 *   - identity: Seal policy identity (embedded in SessionKey, stored for reference)
 *   - session_key_data: User's authorized SessionKey
 *   - network: Sui network (mainnet/testnet)
 *
 * Note: The identity parameter is embedded in the encrypted object and SessionKey.
 * It's passed here for logging/auditing but not directly used in SDK decrypt call.
 * The SDK validates policy access through the SessionKey itself.
 */
async function decryptWithSessionKey(request: DecryptRequest): Promise<Uint8Array> {
    try {
        // Parse encrypted object from hex
        // The EncryptedObject contains the identity/policy information
        let encryptedObjectBytes: Uint8Array;
        try {
            encryptedObjectBytes = fromHEX(request.encrypted_object_hex);
        } catch (e) {
            throw new Error(
                `Failed to parse encrypted object: ${e instanceof Error ? e.message : String(e)}`
            );
        }

        // Initialize Sui client
        const network = request.network || 'mainnet';
        const rpcUrl = getFullnodeUrl(network);
        const suiClient = new SuiClient({ url: rpcUrl });

        // Parse and validate session key data
        let sessionKeyObj: any;
        let sessionKey: SessionKey;
        try {
            sessionKeyObj = JSON.parse(request.session_key_data);

            // Debug: Log keyServers structure for diagnostics
            if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV !== 'production') {
                console.log('[decrypt] Session key data received:', {
                    hasKeyServers: !!sessionKeyObj.keyServers,
                    keyServersCount: sessionKeyObj.keyServers?.length ?? 0,
                    threshold: sessionKeyObj.threshold ?? 'missing',
                    hasSessionKey: !!sessionKeyObj.sessionKey,
                });
            }

            // SessionKey.import requires: (data: ExportedSessionKey, suiClient: SuiClient, signer?: Signer)
            sessionKey = SessionKey.import(sessionKeyObj, suiClient);
        } catch (e) {
            throw new Error(
                `Failed to import SessionKey: ${e instanceof Error ? e.message : String(e)}`
            );
        }

        // Initialize Seal client with server configurations
        // Map keyServers (objectId + weight) to full configs (objectId + weight + url)
        const serverConfigs = buildServerConfigs(sessionKeyObj.keyServers || []);

        if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV !== 'production') {
            console.log('[decrypt] SealClient initialized with:', {
                serverCount: serverConfigs.length,
                serverIds: serverConfigs.map(s => s.objectId).slice(0, 2) + (serverConfigs.length > 2 ? '...' : ''),
            });
        }

        const sealClient = new SealClient({
            suiClient,
            serverConfigs,
        });

        // Build transaction for decryption with seal_approve moveCall
        // The PTB must include an approval call to pass policy validation
        const tx = new Transaction();
        tx.setSender(sessionKey.getAddress());

        const packageId = sessionKeyObj.packageId;
        if (!packageId) {
            throw new Error('packageId missing from session key data');
        }

        // Call seal_approve on the open_access_policy module for verification
        // This establishes the authorization for decryption on-chain
        const policyModule = 'open_access_policy';
        const identityBytes = fromHEX(request.identity);

        tx.moveCall({
            target: `${packageId}::${policyModule}::seal_approve`,
            arguments: [tx.pure.vector('u8', identityBytes)],
        });

        const txBytes = await tx.build({
            client: suiClient,
            onlyTransactionKind: true
        });

        // Decrypt using SessionKey with transaction
        const plaintext = await sealClient.decrypt({
            data: encryptedObjectBytes,
            sessionKey,
            txBytes,
        });

        return plaintext;

    } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        throw new Error(`SessionKey-based decryption failed: ${errorMsg}`);
    }
}

main();
