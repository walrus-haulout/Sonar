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

        // Import SessionKey from exported data
        let sessionKey: SessionKey;
        try {
            const sessionKeyObj = JSON.parse(request.session_key_data);
            // SessionKey.import requires: (data: ExportedSessionKey, suiClient: SuiClient, signer?: Signer)
            sessionKey = SessionKey.import(sessionKeyObj, suiClient);
        } catch (e) {
            throw new Error(
                `Failed to import SessionKey: ${e instanceof Error ? e.message : String(e)}`
            );
        }

        // Initialize Seal client
        // SDK uses key server discovery via identity embedded in SessionKey
        // Empty serverConfigs allows SDK to discover servers dynamically
        const sealClient = new SealClient({
            suiClient,
            serverConfigs: [],
        });

        // Build transaction for decryption
        // This is required by the SDK's decrypt method
        const tx = new Transaction();
        tx.setSender(sessionKey.getAddress());

        // Note: The exact transaction content depends on the policy module
        // For SessionKey-based decryption, the SDK handles policy approval internally
        // We just need to provide the transaction skeleton

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
