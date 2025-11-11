#!/bin/bash
#
# Upload Audio to Walrus Testnet
# Helper script for uploading audio files to Walrus decentralized storage
#
# Usage:
#   ./upload-to-walrus.sh <audio_file>
#
# Prerequisites:
#   - Walrus CLI installed (https://docs.walrus.site)
#   - Sui wallet configured with testnet SUI tokens
#   - Audio file in supported format (WAV, MP3, M4A, OGG)
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

error() {
    echo -e "${RED}ERROR: $1${NC}" >&2
    exit 1
}

info() {
    echo -e "${BLUE}INFO: $1${NC}"
}

success() {
    echo -e "${GREEN}SUCCESS: $1${NC}"
}

# Check if Walrus CLI is installed
if ! command -v walrus &> /dev/null; then
    error "Walrus CLI not found. Install from: https://docs.walrus.site"
fi

# Check if audio file provided
if [ -z "$1" ]; then
    error "Usage: $0 <audio_file>"
fi

AUDIO_FILE="$1"

# Validate file exists
if [ ! -f "$AUDIO_FILE" ]; then
    error "File not found: $AUDIO_FILE"
fi

# Get file info
FILE_SIZE=$(du -h "$AUDIO_FILE" | cut -f1)
FILE_NAME=$(basename "$AUDIO_FILE")

info "Uploading $FILE_NAME ($FILE_SIZE) to Walrus testnet..."

# Check audio duration (requires ffprobe)
if command -v ffprobe &> /dev/null; then
    DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$AUDIO_FILE" 2>/dev/null || echo "unknown")
    if [ "$DURATION" != "unknown" ]; then
        DURATION_INT=$(echo "$DURATION / 1" | bc)
        if [ "$DURATION_INT" -lt 300 ]; then
            error "Audio file must be at least 5 minutes (300 seconds). Current: ${DURATION_INT}s"
        fi
        info "Duration: ${DURATION_INT} seconds ✓"
    fi
fi

# Upload to Walrus
info "Uploading to Walrus testnet..."
BLOB_ID=$(walrus store "$AUDIO_FILE" --network testnet --json | jq -r '.newlyCreated.blobObject.blobId')

if [ -z "$BLOB_ID" ]; then
    error "Upload failed. No blob ID returned"
fi

success "Uploaded successfully!"
echo ""
echo "Blob ID: $BLOB_ID"
echo "File: $FILE_NAME"
echo "Size: $FILE_SIZE"
echo ""

# Save to output file
OUTPUT_FILE="walrus-uploads.txt"
echo "$FILE_NAME|$BLOB_ID|$(date)" >> "$OUTPUT_FILE"
info "Saved to $OUTPUT_FILE"
