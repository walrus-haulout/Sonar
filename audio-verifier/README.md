# SONAR Audio Verifier Service

Comprehensive audio verification service for the SONAR Protocol. Verifies audio quality, copyright, transcription, and content safety **before** encryption and blockchain publication.

## Features

- **Quality Analysis**: Sample rate, duration, clipping, silence detection
- **Copyright Detection**: Chromaprint + AcoustID fingerprinting
- **AI Transcription**: Mistral Voxtral Small via OpenRouter for speech-to-text
- **Content Analysis**: AI-powered quality scoring and safety screening using Gemini 2.5 Flash via OpenRouter
- **Stateful Pipeline**: Progress tracking recorded directly on Sui blockchain
- **Secure**: Bearer token authentication, CORS protection, file size limits

## Architecture

```
Upload Flow (NEW):
User → File Selection → Metadata → Verification → Encryption → Publish
                                        ↓
                              Audio Verifier Service
                              (Quality + Copyright + Gemini AI)
```

**Key Difference**: Verification now runs on **raw audio** before encryption, ensuring the service can actually analyze the content.

## Quick Start

### 1. Install Dependencies

```bash
cd audio-verifier
pip install -e .
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required environment variables (production):
- `OPENROUTER_API_KEY` – Speech-to-text & analysis via OpenRouter (get key at https://openrouter.ai/keys)
- `ACOUSTID_API_KEY` – Chromaprint fingerprint lookup (https://acoustid.org/api-key)
- `VERIFIER_AUTH_TOKEN` – Random 256-bit token for bearer auth (`openssl rand -hex 32`)
- `ALLOWED_ORIGINS` – Comma-separated list of allowed frontend origins
- `SUI_NETWORK` – `mainnet`, `testnet`, `devnet`, or `localnet`
- `SUI_VALIDATOR_KEY` – Validator key string (`key_scheme://base64_key`)
- `SUI_PACKAGE_ID` – Published SONAR Move package ID
- `SUI_SESSION_REGISTRY_ID` – SessionRegistry object ID
- `SUI_VALIDATOR_CAP_ID` – ValidatorCap object ID
- `WALRUS_UPLOAD_URL` – Walrus publisher base URL (e.g., `https://publisher.walrus-mainnet.walrus.space`)
  - The upload function automatically appends `/v1/blobs?epochs={N}` to this URL
  - Uses official Walrus HTTP API: `PUT /v1/blobs?epochs={N}` with raw binary data

Recommended/optional:
- `WALRUS_UPLOAD_TOKEN` – Bearer token for Walrus uploads (optional authentication)
- `MAX_FILE_SIZE_GB` – Override streaming upload limit (default 13)

### 3. Run Locally

```bash
# Development mode
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Or using Docker
docker build -t sonar-audio-verifier .
docker run -p 8000:8000 --env-file .env sonar-audio-verifier
```

### 4. Test the Service

```bash
# Health check
curl http://localhost:8000/health

# Verify an audio file
curl -X POST http://localhost:8000/verify \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@sample.wav" \
  -F 'metadata={"title":"Test","description":"Test dataset","languages":["en"],"tags":["test"]}'

# Check verification status
curl http://localhost:8000/verify/{verificationId} \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## API Endpoints

### POST /verify

Start comprehensive audio verification.

**Request:**
- `file`: Raw audio file (multipart/form-data)
- `metadata`: JSON string with dataset metadata

**Response:**
```json
{
  "verificationId": "uuid",
  "estimatedTimeSeconds": 45,
  "status": "processing"
}
```

### GET /verify/{id}

Get verification status and results.

**Response:**
```json
{
  "id": "0x...session",
  "on_chain": true,
  "object_data": {
    "data": {
      "type": "0x...::verification_session::VerificationSession",
      "fields": { "...": "Move object payload" }
    }
  }
}
```

### POST /verify/{id}/cancel

Cancel a running verification.

## Verification Pipeline

The service runs a 6-stage pipeline:

1. **Quality Check** (15% progress)
   - Duration (1s - 1 hour)
   - Sample rate (minimum 8000 Hz)
   - Clipping detection
   - Silence analysis (<30%)
   - Volume levels (-40dB to -6dB)

2. **Copyright Check** (35% progress)
   - Chromaprint fingerprinting
   - AcoustID database lookup
   - High-confidence match detection (>80%)

3. **Transcription** (55% progress)
   - Google Gemini 2.0 Flash audio-to-text
   - Full transcript generation
   - Handles multiple languages

4. **AI Analysis** (75% progress)
   - Quality scoring (0-1 scale) using Gemini
   - Content safety screening
   - Insights and recommendations

5. **Aggregation** (95% progress)
   - Combine all results
   - Calculate final approval:
     ```
     approved = quality.passed &&
                !copyright.high_confidence &&
                safetyPassed
     ```

6. **Finalization** (100% progress)
   - Store results in PostgreSQL
   - Return to frontend

## Supported Audio Formats

The service supports the following audio formats. Each format is validated by checking its file header (magic bytes) before processing:

### Format Support Matrix

| Format | Extension | MIME Type | Status | Processing |
|--------|-----------|-----------|--------|------------|
| MP3 | `.mp3` | audio/mpeg | ✅ Full Support | Native (soundfile) or FFmpeg fallback |
| WAV | `.wav` | audio/wav | ✅ Full Support | Native (soundfile) |
| FLAC | `.flac` | audio/flac | ✅ Full Support | Native (soundfile) |
| OGG/Opus | `.ogg`, `.opus` | audio/ogg, audio/opus | ✅ Full Support | Native (soundfile) |
| M4A/AAC | `.m4a`, `.aac` | audio/m4a, audio/aac | ✅ Full Support | FFmpeg fallback |
| MP4 Audio | `.mp4` | audio/mp4 | ✅ Full Support | FFmpeg fallback |
| WebM | `.webm` | audio/webm | ✅ Full Support | FFmpeg fallback |
| 3GP/3GPP | `.3gp`, `.3gpp` | audio/3gpp | ✅ Full Support | FFmpeg fallback |
| AMR | `.amr` | audio/amr | ✅ Full Support | FFmpeg fallback |

### Format Validation

- **Format Detection**: Headers are checked using magic bytes (e.g., `RIFF` for WAV, `ID3` for MP3, `fLaC` for FLAC)
- **Rejection**: Files without valid audio headers return HTTP 400 with "Invalid audio blob: unsupported format"
- **Processing**: All formats are converted to canonical PCM WAV for quality analysis

### Minimum File Size

- All audio files must be at least **1 KB** (1024 bytes) after decryption
- Files smaller than 1 KB are rejected with HTTP 400

## Dependencies

The service uses:
- **TypeScript bridge** (`bun run`): Handles SessionKey-based decryption via @mysten/seal SDK
- **Database**: PostgreSQL for session storage (Railway provides automatically)
- **Walrus**: For retrieving encrypted audio blobs
- **Sui RPC**: For SessionKey validation and on-chain verification

## Seal Encrypted Blob Configuration (SessionKey-Based Authentication)

This service verifies encrypted audio blobs stored on Walrus using **SessionKey-based authentication**. Users authorize verification with their wallet signature - no offline master keys required.

### How It Works

1. **User uploads audio** → Frontend encrypts with Seal (4-of-6 threshold)
2. **User authorizes verification** → Frontend creates SessionKey (wallet signature)
3. **SessionKey exported** → Sent to backend with verification request
4. **Backend decrypts** → Uses SessionKey to request decryption from key servers
5. **Audio verified** → Quality, copyright, transcription, AI analysis

### Configuration

Only one environment variable is required:

- **`SEAL_PACKAGE_ID`** (Required): Sui blockchain object ID of deployed Seal package
  - Example: `SEAL_PACKAGE_ID=0x8ed5834faad055067328dd44577e5fb7a6c6c61299483616061e642c465eda`
  - Get from: `sui client publish` output when deploying Seal contracts

### Security

✅ **No offline master keys** - Eliminates key management risk
✅ **User-authorized decryption** - Every decrypt requires wallet signature
✅ **Ephemeral credentials** - SessionKeys expire (30-min TTL)
✅ **Key server validation** - Decryption requests validated on-chain
✅ **Audit trail** - Session creation timestamped and signed

### Frontend Integration

The frontend already handles:
1. SessionKey creation with wallet signature
2. Caching session (30-min TTL)
3. Exporting SessionKey as JSON
4. Sending with verification request

No additional configuration needed on the frontend - SessionKey-based decryption is transparent to the user.

### Troubleshooting

**Error: `SessionKey is required for decryption`**
- Verify frontend is creating and exporting SessionKey
- Check that `sessionKeyData` is included in POST /verify request
- Ensure wallet is connected and authorization completed

**Error: `SessionKey import failed`**
- Verify SessionKey JSON format is valid
- Check that SuiClient can reach RPC endpoint
- Ensure network configuration matches (mainnet/testnet)

## Deployment

### Railway

```bash
# From audio-verifier directory
railway up

# Set environment variables in Railway dashboard
railway variables set OPENROUTER_API_KEY=xxx
railway variables set DATABASE_URL=xxx  # Railway provides this automatically when Postgres is linked
railway variables set VERIFIER_AUTH_TOKEN=xxx
railway variables set ACOUSTID_API_KEY=xxx
railway variables set ALLOWED_ORIGINS=https://app.yourfrontend.com
railway variables set SUI_NETWORK=testnet
railway variables set SUI_VALIDATOR_KEY=key_scheme://base64
railway variables set SUI_PACKAGE_ID=0x...
railway variables set SUI_SESSION_REGISTRY_ID=0x...
railway variables set SUI_VALIDATOR_CAP_ID=0x...
railway variables set WALRUS_UPLOAD_URL=https://walrus.yourdomain.com/upload
railway variables set WALRUS_UPLOAD_TOKEN=secrettoken

# SEAL ENCRYPTED BLOB CONFIGURATION (see "Seal Encrypted Blob Configuration" section above)
railway variables set SEAL_PACKAGE_ID=0x...
railway variables set WALRUS_AGGREGATOR_URL=https://wal-aggregator-mainnet.staketab.org:443
```

### Fly.io

```bash
# Initialize Fly app
fly launch

# Set secrets
fly secrets set OPENROUTER_API_KEY=xxx
fly secrets set VERIFIER_AUTH_TOKEN=xxx
fly secrets set ACOUSTID_API_KEY=xxx
fly secrets set ALLOWED_ORIGINS=https://app.yourfrontend.com
fly secrets set SUI_NETWORK=testnet
fly secrets set SUI_VALIDATOR_KEY=key_scheme://base64
fly secrets set SUI_PACKAGE_ID=0x...
fly secrets set SUI_SESSION_REGISTRY_ID=0x...
fly secrets set SUI_VALIDATOR_CAP_ID=0x...
fly secrets set WALRUS_UPLOAD_URL=https://walrus.yourdomain.com/upload
fly secrets set WALRUS_UPLOAD_TOKEN=secrettoken

# SEAL ENCRYPTED BLOB CONFIGURATION (see "Seal Encrypted Blob Configuration" section)
fly secrets set SEAL_PACKAGE_ID=0x...
fly secrets set WALRUS_AGGREGATOR_URL=https://wal-aggregator-mainnet.staketab.org:443

# Deploy
fly deploy
```

### Docker (Production)

```bash
# Build image
docker build -t sonar-audio-verifier .

# Run with environment file
docker run -p 8000:8000 \
  --env-file .env \
  sonar-audio-verifier

# Or run with individual environment variables (recommended for production)
docker run -p 8000:8000 \
  -e SEAL_PACKAGE_ID=0x... \
  -e WALRUS_AGGREGATOR_URL=https://wal-aggregator-mainnet.staketab.org:443 \
  -e OPENROUTER_API_KEY=xxx \
  -e ACOUSTID_API_KEY=xxx \
  -e VERIFIER_AUTH_TOKEN=xxx \
  sonar-audio-verifier
```

**Note**: No master keys required - SessionKey-based authentication is handled by the frontend and validated on-chain.

## Frontend Integration

After deploying the service, update your frontend environment variables (server-only):

```bash
# frontend/.env.local
AUDIO_VERIFIER_URL=https://audio-verifier.projectsonar.xyz
VERIFIER_AUTH_TOKEN=your_random_256_bit_token
```

The frontend `VerificationStep` component automatically:
1. Calls POST /verify with raw audio file
2. Polls GET /verify/{id} for progress
3. Blocks upload if verification fails
4. Provides detailed error feedback with recovery options

## Security

- **Authentication**: Bearer token required for all `/verify` endpoints
- **CORS**: Explicit origin whitelist
- **File Size Limits**: Checked before multipart parsing (max 13GB)
- **Rate Limiting**: Recommended via reverse proxy (Nginx/Cloudflare)

## Monitoring

- **Health Check**: `GET /health` returns configuration status
- **Logs**: Structured logging to stdout (compatible with Railway/Fly)
- **Metrics**: Add Prometheus endpoint for production monitoring

## Troubleshooting

### Verification fails with "Chromaprint not installed"

Install system dependencies:
```bash
apt-get install libchromaprint-tools ffmpeg
```

### OpenRouter API errors

- Check `OPENROUTER_API_KEY` is valid (get key at https://openrouter.ai/keys)
- Verify API quota hasn't been exceeded
- Check file is a supported audio format (MP3, WAV, FLAC, OGG/Opus, M4A/AAC/MP4, WebM, 3GPP/3GP, AMR)

### PostgreSQL connection errors

- Confirm `DATABASE_URL` is set (Railway provides this automatically when Postgres is linked)
- Verify Postgres database is accessible from deployment environment
- Check database connection pool limits if experiencing connection errors

### seal-cli not found errors

- **Docker deployments**: The Dockerfile automatically installs `seal-cli`. If you see this error, rebuild the image.
- **Non-Docker deployments**: Install `seal-cli` manually or set `SEAL_CLI_PATH` environment variable to point to the binary location.
- Verify installation: `seal-cli --version` should work from the command line.

### Large file uploads timeout

- Increase worker timeout: `uvicorn main:app --timeout-keep-alive 300`
- Add nginx reverse proxy with extended timeouts
- Consider processing files asynchronously with queues for >100MB files

## Development

Run tests:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
pytest
```

Type checking:
```bash
mypy main.py verification_pipeline.py sui_client.py
```

## License

Part of the SONAR Protocol. See main repository LICENSE.
