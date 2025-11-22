# SDK-Only Seal Decryption Migration

## Overview

Successfully migrated from subprocess-based CLI bridge (`bun run decrypt.ts`) to a native HTTP service using the `@mysten/seal` SDK directly. This eliminates subprocess overhead, improves reliability, and makes the system more testable and production-ready.

## What Changed

### 1. **Seal Decryption Service (New)** - `seal-decryptor-ts/`

#### Server (`server.ts`)
- **Fastify HTTP service** listening on `127.0.0.1:3001` (local-only)
- Two endpoints:
  - `GET /health` - Service health check
  - `POST /decrypt` - Decryption endpoint
- Full SDK integration using `@mysten/seal` directly (no subprocess)
- Request validation with Zod schemas
- Comprehensive error classification and HTTP status codes
- Logging of sizes only (no secrets or plaintext)

#### Types (`types.ts`)
- Zod schemas for validation:
  - `DecryptRequestSchema` - Validates input
  - `DecryptResponseSchema` - Validates output
  - `ErrorResponseSchema` - Consistent error format
- Helper function `errorTypeToHttpStatus()` maps error types to HTTP status codes

#### Dependencies (`package.json`)
- Added: `fastify`, `pino` logging, `pino-pretty`, `zod`
- Kept: Existing `@mysten/seal`, `@mysten/sui` dependencies
- New script: `npm run start:service` - Starts the HTTP service

### 2. **Python Decryptor Refactoring** - `seal_decryptor.py`

#### Removed
- `subprocess` import
- `_decrypt_with_seal_cli()` function (subprocess-based)
- `_parse_seal_error()` function (stderr parsing)
- `TS_BRIDGE_PATH` constant

#### Added
- `_decrypt_with_seal_service()` function - HTTP-based decryption
- `SEAL_SERVICE_URL` configuration (default: `http://127.0.0.1:3001`)
- `SEAL_SERVICE_TIMEOUT` configuration (120 seconds)
- Service health check on startup (optional, logged if unavailable)

#### Key Features
- Same 3-retry logic as before (for transient errors)
- Proper error mapping:
  - HTTP 400/403 → Don't retry (client errors)
  - HTTP 502/504 → Retry (service errors)
  - Network errors → Retry with exponential backoff
- Enhanced logging:
  - Request sizes (encrypted object hex length)
  - Response sizes (plaintext hex length)
  - Error types and HTTP status codes
  - No plaintext/secret data in logs

### 3. **Service Orchestration** - `start.sh`

New script that manages both services:

1. **Starts Seal Service**
   - Installs dependencies if needed (`bun install`)
   - Spawns service in background
   - Polls `/health` endpoint until ready (30 retries × 2s = 60s max)

2. **Starts Python App**
   - Sets `SEAL_SERVICE_URL` environment variable
   - Runs `python -m uvicorn main:app`
   - Respects `PYTHON_PORT`, `PYTHON_HOST`, `LOG_LEVEL` env vars

3. **Graceful Shutdown**
   - Catches `SIGINT`/`SIGTERM` signals
   - Gracefully stops both services (5s timeout for Python, 3s for TS)
   - Force-kills if needed
   - Cleans up temp files

### 4. **Docker Integration**

No changes needed to `Dockerfile` - it already:
- ✅ Installs `bun` via Nix
- ✅ Copies `seal-decryptor-ts` with dependencies
- ✅ Copies `start.sh` script
- ✅ Makes script executable
- ✅ Sets it as entrypoint

## Architecture

```
┌─────────────────────────────────────┐
│     Frontend (TypeScript/React)     │
│     - Encrypts blob                 │
│     - Creates SessionKey            │
│     - Uploads to Walrus             │
└──────────────┬──────────────────────┘
               │
               ├─ POST /api/verify with:
               │  - walrusBlobId
               │  - encryptedObjectBcsHex (sealed key)
               │  - sessionKeyData
               │  - sealIdentity
               │
┌──────────────▼──────────────────────┐
│   Python Audio Verifier (FastAPI)   │
│   - main.py                         │
│   - Receives verification request   │
└──────────────┬──────────────────────┘
               │
               ├─ HTTP POST localhost:3001/decrypt
               │  {encryptedObjectHex, identity, sessionKeyData, network}
               │
┌──────────────▼──────────────────────┐
│   Seal Service (Fastify + SDK)      │
│   - server.ts                       │
│   - Uses @mysten/seal SDK           │
│   - Communicates with key servers   │
│   - Returns plaintextHex            │
└──────────────┬──────────────────────┘
               │
               ├─ Returns plaintext bytes
               │
┌──────────────▼──────────────────────┐
│   Audio Processing Pipeline         │
│   - Validate audio format           │
│   - Analyze quality metrics         │
│   - Verify copyright (Chromaprint)  │
│   - Transcribe with Gemini          │
│   - Return verification result      │
└─────────────────────────────────────┘
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SEAL_SERVICE_URL` | `http://127.0.0.1:3001` | Service URL for HTTP requests |
| `SEAL_SERVICE_HOST` | `127.0.0.1` | Service bind address |
| `SEAL_SERVICE_PORT` | `3001` | Service port |
| `SEAL_KEY_SERVER_URLS` | *(required)* | JSON map of key server object IDs to URLs |
| `SEAL_PACKAGE_ID` | *(required)* | Seal package ID on Sui |
| `LOG_LEVEL` | `info` | Logging level (debug/info/warn/error) |
| `PYTHON_PORT` | `8000` | Python app port |
| `PYTHON_HOST` | `0.0.0.0` | Python app bind address |

### `.env.example` Update

```bash
# Seal Service Configuration
SEAL_SERVICE_URL=http://127.0.0.1:3001
SEAL_SERVICE_HOST=127.0.0.1
SEAL_SERVICE_PORT=3001

# Seal SDK Configuration (from environment)
SEAL_KEY_SERVER_URLS='{"0x123...":"https://server-1.example.com","0x456...":"https://server-2.example.com"}'
SEAL_PACKAGE_ID=0xpackage...

# Logging
LOG_LEVEL=info
```

## Testing

### Run Integration Tests

```bash
cd audio-verifier
python -m pytest tests/integration/test_seal_service.py -v
```

### Run Service Locally

```bash
cd audio-verifier
./start.sh
```

This will:
1. Start Seal service on `127.0.0.1:3001`
2. Start Python app on `0.0.0.0:8000`
3. Display startup logs with service health status

### Test Decryption Manually

```bash
curl -X POST http://localhost:3001/decrypt \
  -H "Content-Type: application/json" \
  -d '{
    "encrypted_object_hex": "...",
    "identity": "...",
    "session_key_data": "...",
    "network": "mainnet"
  }'
```

## Benefits

✅ **No Subprocess Overhead** - Direct SDK usage via HTTP (faster, more reliable)
✅ **Better Error Handling** - HTTP status codes instead of stderr parsing
✅ **Improved Testability** - Can mock HTTP service easily
✅ **Production-Ready** - Graceful shutdown, health checks, proper retry logic
✅ **Local-Only Communication** - Service bound to 127.0.0.1 (no external access)
✅ **Clear Separation of Concerns** - TS handles crypto, Python handles audio verification
✅ **Easier Debugging** - HTTP requests/responses vs subprocess output parsing

## Migration Checklist

- [x] Create Fastify HTTP service with Seal SDK
- [x] Implement Zod validation schemas
- [x] Update package.json with service dependencies
- [x] Refactor Python decryptor to use HTTP client
- [x] Create start.sh for service orchestration
- [x] Docker already configured correctly
- [x] Add integration tests
- [ ] Remove old CLI decrypt.ts (keeping for backwards compatibility)
- [ ] Update documentation in README
- [ ] Deploy and test with production blob IDs

## Files Changed

### New Files
- `audio-verifier/seal-decryptor-ts/server.ts` (226 lines)
- `audio-verifier/seal-decryptor-ts/types.ts` (46 lines)
- `audio-verifier/tests/integration/test_seal_service.py` (188 lines)

### Modified Files
- `audio-verifier/seal-decryptor-ts/package.json` - Added dependencies and script
- `audio-verifier/seal_decryptor.py` - Replaced subprocess with HTTP client
- `audio-verifier/start.sh` - Updated orchestration script

### Unchanged Files
- `audio-verifier/Dockerfile` - Already references start.sh
- `audio-verifier/main.py` - No changes needed
- `audio-verifier/seal-decryptor-ts/decrypt.ts` - Kept for backwards compatibility

## Rollback Plan

If issues arise:

1. Revert commits:
   ```bash
   git revert <SDK_MIGRATION_COMMIT>
   ```

2. Restore subprocess-based decryption:
   ```bash
   git checkout main~2 -- audio-verifier/seal_decryptor.py
   ```

3. Disable service startup in start.sh (edit `start.sh`)

## Next Steps

1. Deploy to staging environment
2. Test with original failing blob ID: `bfmqNaBfhCtUz3ZaZBR56-3e2MgW-OXDqUCLScgQVsQ`
3. Verify frontend VerificationStep completes without errors
4. Monitor service logs for any issues
5. Update documentation and CHANGELOG

---

**Implementation Date**: November 21, 2025
**Status**: Ready for testing and deployment
