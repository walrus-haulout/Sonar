# Walrus Audio Upload Guide

This guide explains how to upload real 5+ minute audio files to Walrus testnet for the SONAR marketplace.

## Prerequisites

### 1. Install Walrus CLI

```bash
# Download Walrus CLI (macOS/Linux)
curl https://storage.googleapis.com/mysten-walrus-binaries/walrus-testnet-latest-macos-x86_64 -o walrus
chmod +x walrus
sudo mv walrus /usr/local/bin/

# Verify installation
walrus --version
```

### 2. Configure Sui Wallet

```bash
# Initialize Sui CLI if not already done
sui client

# Switch to testnet
sui client switch --env testnet

# Get testnet SUI tokens from faucet
sui client faucet
```

### 3. Get Audio Files

You need 3 audio files, each at least 5 minutes long. Options:

**Option A: Use Open-Licensed Audio Libraries**
1. Visit a Creative Commons library (e.g., Free Music Archive, Openverse)
2. Filter for "ambient" or "soundscape" clips longer than 5 minutes
3. Download under a license compatible with your use case
4. Convert to WAV if needed: `ffmpeg -i input.mp3 output.wav`

**Option B: Use Sample Generator**
```bash
# Generate 5-minute white noise (requires ffmpeg)
ffmpeg -f lavfi -i anoisesrc=duration=300:color=white:sample_rate=44100 -ac 2 ambient_test_1.wav
ffmpeg -f lavfi -i anoisesrc=duration=330:color=pink:sample_rate=44100 -ac 2 ambient_test_2.wav
ffmpeg -f lavfi -i anoisesrc=duration=360:color=brown:sample_rate=44100 -ac 2 ambient_test_3.wav
```

**Option C: Record Your Own**
- Use Audacity, GarageBand, or any DAW
- Record 5+ minutes of ambient audio
- Export as WAV (44.1kHz, stereo)

## Upload Process

### Step 1: Upload Each File

```bash
cd /Users/angel/Projects/sonar/scripts

# Upload file 1
./upload-to-walrus.sh /path/to/ambient_1.wav

# Upload file 2
./upload-to-walrus.sh /path/to/ambient_2.wav

# Upload file 3
./upload-to-walrus.sh /path/to/ambient_3.wav
```

### Step 2: Record Blob IDs

After each upload, you'll see output like:

```
SUCCESS: Uploaded successfully!

Blob ID: Cg4bXHWZD3rmK9QvGPZxp4dMB_SqJUr7kVtF8wN2eL0
File: ambient_1.wav
Size: 52M

Record this blob ID:
  "walrus_blob_id": "Cg4bXHWZD3rmK9QvGPZxp4dMB_SqJUr7kVtF8wN2eL0"
  "preview_blob_id": "Cg4bXHWZD3rmK9QvGPZxp4dMB_SqJUr7kVtF8wN2eL0_preview"
```

### Step 3: Use Blob ID

Use the blob ID when creating datasets through your application or seed scripts.

```json
{
  "title": "Ambient Meditation",
  "walrus_blob_id": "Cg4bXHWZD3rmK9QvGPZxp4dMB_SqJUr7kVtF8wN2eL0",
  "preview_blob_id": "Cg4bXHWZD3rmK9QvGPZxp4dMB_SqJUr7kVtF8wN2eL0_preview",
  "duration_seconds": 330
}
```

## Verify Upload

Test that your blob is accessible:

```bash
# Download and verify
curl https://aggregator.walrus-testnet.walrus.space/v1/blobs/<YOUR_BLOB_ID> -o test.wav

# Check file
ffprobe test.wav
```

## Troubleshooting

### Error: "Insufficient funds"
```bash
# Get more testnet SUI
sui client faucet
```

### Error: "File too large"
```bash
# Compress audio (reduce to mono, lower sample rate)
ffmpeg -i input.wav -ac 1 -ar 22050 output.wav
```

### Error: "Duration too short"
```bash
# Check duration
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 file.wav

# Must be >= 300 seconds (5 minutes)
```

## Cost Estimate

Approximate costs for testnet (testnet SUI is free from faucet):

- 50MB audio file: ~0.05 SUI storage cost
- Total for 3 files: ~0.15 SUI
- Storage period: 30 days (testnet)

## Example Workflow

```bash
# 1. Generate 3 test audio files
cd ~/audio
ffmpeg -f lavfi -i anoisesrc=duration=330:color=white -ac 2 test1.wav
ffmpeg -f lavfi -i anoisesrc=duration=375:color=pink -ac 2 test2.wav
ffmpeg -f lavfi -i anoisesrc=duration=300:color=brown -ac 2 test3.wav

# 2. Upload to Walrus
cd /Users/angel/Projects/sonar/scripts
./upload-to-walrus.sh ~/audio/test1.wav
./upload-to-walrus.sh ~/audio/test2.wav
./upload-to-walrus.sh ~/audio/test3.wav

# 3. Record blob IDs from output

# 4. Verify in frontend
cd /Users/angel/Projects/sonar/frontend
bun run dev
# Visit http://localhost:3000/marketplace
```

## Next Steps

After uploading real audio:
1. Test preview playback in frontend
2. Test full audio download after purchase
3. Verify Walrus aggregator serves files correctly
4. Run integration tests

## References

- Walrus Documentation: https://docs.walrus.site
- Walrus Testnet Aggregator: https://aggregator.walrus-testnet.walrus.space
- FFmpeg Documentation: https://ffmpeg.org/documentation.html
