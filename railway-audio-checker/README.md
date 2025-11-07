# SONAR Audio Checker Service

Python service for audio quality analysis and copyright detection.

## Features

- **Audio Quality Checks**
  - Duration validation
  - Sample rate analysis
  - Volume level detection
  - Clipping detection
  - Silence analysis

- **Copyright Detection**
  - Acoustic fingerprinting with Chromaprint
  - AcoustID database lookup
  - Music identification

## API Endpoints

### `POST /check-audio`
Upload audio file for analysis.

**Request:**
- Multipart form data with `file` field

**Response:**
```json
{
  "approved": true,
  "quality": {
    "duration": 120.5,
    "sample_rate": 44100,
    "channels": 2,
    "bit_depth": 16,
    "volume_ok": true,
    "rms_db": -18.5,
    "clipping": false,
    "silence_percent": 2.1,
    "passed": true
  },
  "copyright": {
    "checked": true,
    "detected": false,
    "confidence": 0.0,
    "matches": [],
    "passed": true
  },
  "errors": []
}
```

### `POST /check-audio-url`
Check audio from URL (e.g., Walrus blob).

**Request:**
```json
{
  "url": "https://aggregator.walrus-testnet.walrus.space/blob_id"
}
```

**Response:** Same as `/check-audio`

## Environment Variables

- `ACOUSTID_API_KEY` - API key for AcoustID (get from https://acoustid.org/api-key)

## Local Development

```bash
# Install dependencies
uv pip install -r pyproject.toml

# Run server
uvicorn main:app --reload

# Test endpoint
curl http://localhost:8000/health
```

## Railway Deployment

1. Push to GitHub
2. Create new Railway project from repo
3. Set root directory to `railway-audio-checker`
4. Add environment variable: `ACOUSTID_API_KEY`
5. Deploy

Railway will automatically detect the Dockerfile and build.

## Docker Build

```bash
docker build -t sonar-audio-checker .
docker run -p 8000:8000 sonar-audio-checker
```
