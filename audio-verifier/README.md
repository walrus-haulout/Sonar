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
- `WALRUS_UPLOAD_URL` – Plaintext upload endpoint

Recommended/optional:
- `WALRUS_UPLOAD_TOKEN` – Bearer token for Walrus uploads
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
```

## Frontend Integration

After deploying the service, update your frontend environment variables:

```bash
# frontend/.env.local
NEXT_PUBLIC_AUDIO_VERIFIER_URL=https://your-verifier.railway.app
NEXT_PUBLIC_VERIFIER_AUTH_TOKEN=your_random_256_bit_token
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
- Check file is a supported audio format (WAV, MP3, M4A, etc.)

### PostgreSQL connection errors

- Confirm `DATABASE_URL` is set (Railway provides this automatically when Postgres is linked)
- Verify Postgres database is accessible from deployment environment
- Check database connection pool limits if experiencing connection errors

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
