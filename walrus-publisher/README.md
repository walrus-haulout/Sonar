# Walrus Publisher Service

High-performance Walrus blob publisher with sub-wallet orchestration and file chunking for large file uploads (≥100MB).

## Features

- **File Chunking**: Automatically splits large files (≥100MB) into chunks
- **Sub-Wallet Orchestration**: Creates ephemeral sub-wallets for parallel uploads
- **Browser-Sponsored Transactions**: Browser wallet sponsors gas for on-chain registration
- **Parallel Uploads**: Upload chunks simultaneously across multiple wallets
- **Real-Time Progress**: SSE-based progress tracking
- **Multi-Platform**: Deploy to Railway, DigitalOcean, Fly.io, or any Docker-compatible platform

## Architecture

```
Browser (≥100MB file)
    ↓
useChunkedWalrusUpload hook
    ↓
POST /upload/init → Create session + chunk plan
    ↓
POST /upload/{sessionId}/chunk/{index} (parallel)
    ↓
Walrus Publisher (HTTP API)
    ↓
GET /upload/{sessionId}/transactions → Unsigned txs
    ↓
Browser wallet sponsors + signs transactions
    ↓
POST /upload/{sessionId}/finalize → Submit to Sui
```

## Installation

### Prerequisites

- Python 3.13+
- Redis (local or Railway/DigitalOcean managed)
- Sui network access (RPC endpoint)

### Local Development

```bash
# Install UV
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies
uv sync

# Run service
uv run fastapi run src/main.py --port 8080
```

### Docker

```bash
# Build
docker build -t walrus-publisher:latest .

# Run with Redis
docker run -p 8080:8080 \
  -e REDIS_URL="redis://redis:6379" \
  -e WALRUS_PUBLISHER_URL="https://publisher.walrus-mainnet.walrus.space" \
  walrus-publisher:latest
```

## Deployment

### Railway

```bash
# Login and create project
railway login
cd walrus-publisher
railway init

# Deploy
railway up

# Set environment variables
railway variables set WALRUS_PUBLISHER_URL=https://publisher.walrus-mainnet.walrus.space
railway variables set WALRUS_AGGREGATOR_URL=https://aggregator.walrus-mainnet.walrus.space
railway variables set WALRUS_PACKAGE_ID=0x...
railway variables set WALRUS_SYSTEM_OBJECT=0x...

# Add Redis plugin
railway add --plugin redis
```

### DigitalOcean App Platform

```bash
# Push to GitHub first
git push

# Create app in DigitalOcean console
# Upload app.yaml as spec
# Set env vars in console
# Deploy
```

### Fly.io

```bash
# Login
fly auth login

# Launch
fly launch

# Set secrets
fly secrets set WALRUS_PUBLISHER_URL=https://publisher.walrus-mainnet.walrus.space
fly secrets set WALRUS_PACKAGE_ID=0x...

# Deploy
fly deploy
```

## Configuration

### Environment Variables

**Required:**
- `WALRUS_PUBLISHER_URL`: Walrus HTTP publisher endpoint
- `WALRUS_AGGREGATOR_URL`: Walrus aggregator endpoint
- `WALRUS_PACKAGE_ID`: Walrus Move package ID
- `WALRUS_SYSTEM_OBJECT`: Walrus system object ID

**Optional:**
- `REDIS_URL`: Redis connection URL (defaults to `redis://localhost:6379/0`)
- `PORT`: Service port (defaults to `8080`, auto-detected on Railway)
- `HOST`: Bind address (defaults to `0.0.0.0`)
- `MAX_WALLETS`: Max ephemeral wallets (defaults to `256`)
- `CHUNK_MIN_SIZE`: Min chunk size in bytes (defaults to `1MB`)
- `CHUNK_MAX_SIZE`: Max chunk size in bytes (defaults to `500MB`)
- `SESSION_TTL`: Session expiry in seconds (defaults to `3600`)
- `SUI_RPC_URL`: Sui RPC endpoint (defaults to mainnet)
- `DEBUG`: Enable debug logging (`true`/`false`)

## API Endpoints

### `POST /upload/init`
Initialize an upload session.

**Request:**
```json
{
  "file_size": 104857600
}
```

**Response:**
```json
{
  "session_id": "uuid",
  "chunk_count": 4,
  "wallet_count": 4,
  "chunks": [
    {
      "index": 0,
      "size": 26214400,
      "wallet_address": "0x..."
    }
  ]
}
```

### `POST /upload/{sessionId}/chunk/{chunkIndex}`
Upload a single chunk.

**Request:** Binary blob data (multipart form)

**Response:**
```json
{
  "blob_id": "...",
  "chunk_index": 0,
  "size_bytes": 26214400
}
```

### `GET /upload/{sessionId}/transactions`
Get unsigned transactions for browser sponsorship.

**Response:**
```json
{
  "session_id": "uuid",
  "transactions": [
    {
      "tx_bytes": "...",
      "sub_wallet_address": "0x...",
      "blob_id": "...",
      "chunk_index": 0
    }
  ],
  "sponsor_address": "0x0"
}
```

### `POST /upload/{sessionId}/finalize`
Submit signed and sponsored transactions.

**Request:**
```json
{
  "signed_transactions": [
    {
      "tx_bytes": "...",
      "digest": "0x..."
    }
  ]
}
```

**Response:**
```json
{
  "session_id": "uuid",
  "transaction_digests": ["0x..."],
  "status": "submitted"
}
```

### `GET /upload/{sessionId}/status`
Stream upload status via Server-Sent Events.

**Response:**
```
event: upload
data: {"session_id": "...", "progress": 45, ...}
```

### `GET /health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "platform": "railway",
  "uptime_seconds": 3600,
  "active_sessions": 2
}
```

### `GET /metrics`
Prometheus metrics.

**Response:**
```
# HELP walrus_uploader_uptime_seconds Uptime in seconds
# TYPE walrus_uploader_uptime_seconds gauge
walrus_uploader_uptime_seconds 3600

# HELP walrus_uploader_active_sessions Active upload sessions
# TYPE walrus_uploader_active_sessions gauge
walrus_uploader_active_sessions 2
```

## Frontend Integration

Add to `frontend/.env.local`:
```
NEXT_PUBLIC_WALRUS_PUBLISHER_SERVICE_URL=http://localhost:8080
```

Use in components:
```typescript
import { useChunkedWalrusUpload } from '@/hooks/useChunkedWalrusUpload';

export function MyComponent() {
  const { uploadBlob, progress } = useChunkedWalrusUpload();

  const handleUpload = async (file: File) => {
    const result = await uploadBlob(file, policyId, metadata);
    console.log(`Uploaded ${result.chunksCount} chunks`);
  };

  return <div>Progress: {progress.progress}%</div>;
}
```

## Wallet Management

### Ephemeral Sub-Wallets

- Created per upload session
- Private keys stored in Redis (expires after SESSION_TTL)
- No funding required (browser wallet sponsors gas)
- Used only for signing transaction kind

### Browser Wallet (Sponsor)

- Holds actual SUI coins for gas
- Responsible for:
  - Creating gas object
  - Signing sponsorship
  - Submitting final transactions

## Chunking Strategy

**Wallet Calculation:**
```
wallets = min(256, max(4, 4 + (size_gb * 4)))
```

Examples:
- 100MB → 4 wallets
- 500MB → 6 wallets
- 2GB → 12 wallets
- 10GB → 44 wallets

**Chunk Size:**
```
chunk_size = file_size / wallet_count
```

Each chunk is uploaded to Walrus via HTTP publisher, which automatically handles registration.

## Performance

- **Upload Speed**: 5-20x faster for files ≥100MB (parallel chunks)
- **Max File Size**: 13 GiB (Walrus hard limit)
- **Concurrent Chunks**: 4 by default (configurable)
- **Session Timeout**: 1 hour (configurable)

## Security

- **No server-side keys**: Browser wallet holds coins
- **Ephemeral wallets**: Private keys expire after session
- **Redis isolation**: Session data scoped per upload
- **HTTPS only**: In production, enforce TLS

## Troubleshooting

### Chunks fail to upload
- Check Walrus publisher URL
- Verify network connectivity
- Check chunk size limits

### Transaction signature fails
- Ensure browser wallet has SUI coins
- Verify wallet is connected
- Check WALRUS_PACKAGE_ID and WALRUS_SYSTEM_OBJECT

### Redis connection errors
- Verify REDIS_URL is correct
- Check Redis service is running
- Look for firewall/network issues

### Session not found
- Session may have expired (check SESSION_TTL)
- Browser/client may be accessing different service instance

## Contributing

All code follows these principles:
- Modular, reusable components
- Minimal dependencies
- Self-documenting code
- Type-safe (Python type hints)

## License

Same as main Sonar project.
