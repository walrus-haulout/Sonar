# Seal Decryptor TypeScript Bridge

This TypeScript bridge wraps the `@mysten/seal` SDK to handle SessionKey-based decryption for the Python audio-verifier service.

## Architecture

```
Frontend (SessionKey creation)
  ↓
POST /api/verify (with sessionKeyData)
  ↓
Python audio-verifier (main.py)
  ↓
TypeScript bridge (decrypt.ts)
  ↓
@mysten/seal SDK (SessionKey-based decryption)
  ↓
Sui key servers (provide decryption keys)
  ↓
Decrypted audio plaintext
```

## SessionKey-Based Decryption

The bridge implements **SessionKey-based authentication**:

1. **Frontend creates SessionKey** with wallet signature
2. **SessionKey exported** as JSON from frontend
3. **Backend receives sessionKeyData** in verification request
4. **TS bridge imports SessionKey** using SuiClient
5. **SealClient decrypts** using SessionKey + key servers
6. **Returns plaintext hex** to Python

### Why SessionKey-Based?

✅ **No offline master keys** - Eliminates key management risk
✅ **User-authorized** - Every decrypt requires wallet signature
✅ **Ephemeral** - SessionKeys expire (30-min TTL)
✅ **Auditable** - All decryption requests can be logged
✅ **Blockchain-verified** - Decryption validated on-chain

## Input Schema

```typescript
{
  encrypted_object_hex: string,      // BCS-encoded encrypted object (hex)
  identity: string,                  // Seal policy identity (hex)
  session_key_data: string,          // Exported SessionKey (JSON)
  network?: 'mainnet' | 'testnet'   // Optional network (default: mainnet)
}
```

## Output

The script outputs decrypted plaintext as **hexadecimal to stdout**:

```
0x48656c6c6f20576f726c64  // "Hello World" in hex
```

Python reads this hex and converts back to bytes:

```python
plaintext = bytes.fromhex(hex_clean)
```

## Error Handling

Errors are logged to **stderr** with exit code 1:

```
Error: SessionKey import failed: Invalid session data
```

## Usage

```bash
# Install dependencies
bun install

# Run decryption
bun run decrypt.ts '{"encrypted_object_hex":"...","identity":"...","session_key_data":"..."}'

# Run tests
bun test

# Type check
bunx tsc --noEmit

# Lint
bun lint
```

## Implementation Details

### Imports
- `@mysten/seal` - SessionKey and SealClient
- `@mysten/sui/client` - SuiClient for RPC interaction
- `@mysten/sui/transactions` - Transaction building
- `@mysten/bcs` - Serialization/deserialization
- `zod` - Input validation

### Key Functions

**decryptWithSessionKey(request)**
- Validates request schema
- Parses encrypted object from hex
- Imports SessionKey with SuiClient
- Builds transaction for policy approval
- Calls SealClient.decrypt()
- Returns plaintext Uint8Array

### Security

- ✅ Input validation with Zod
- ✅ Type-safe TypeScript
- ✅ No secrets logged to stdout
- ✅ SessionKey never persisted
- ✅ Clear error messages to stderr

## Troubleshooting

**Error: `SessionKey is required for decryption`**
- Verify frontend is exporting SessionKey
- Check that sessionKeyData is included in POST request
- Ensure wallet is connected and authorization completed

**Error: `Failed to import SessionKey`**
- SessionKey JSON format invalid
- SuiClient cannot reach RPC endpoint
- Network mismatch (mainnet vs testnet)

**Error: `SealClient.decrypt failed`**
- Encrypted object format invalid
- Key servers unreachable
- User not authorized for this policy
- SessionKey expired

## Testing

```bash
# Run test suite
bun test

# Test with sample data
bun run decrypt.ts '{
  "encrypted_object_hex": "...",
  "identity": "...",
  "session_key_data": "...",
  "network": "mainnet"
}'
```

## Files

- `decrypt.ts` - Main decryption script
- `decrypt.test.ts` - Test suite
- `debug_exports.ts` - SDK API inspection (dev-only)
- `package.json` - Dependencies
- `tsconfig.json` - TypeScript config
- `.eslintrc.json` - Lint config
