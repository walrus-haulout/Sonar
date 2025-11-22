#!/bin/bash
set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SEAL_SERVICE_HOST="${SEAL_SERVICE_HOST:-127.0.0.1}"
SEAL_SERVICE_PORT="${SEAL_SERVICE_PORT:-3001}"
SEAL_SERVICE_URL="${SEAL_SERVICE_URL:-http://$SEAL_SERVICE_HOST:$SEAL_SERVICE_PORT}"
PYTHON_PORT="${PYTHON_PORT:-8000}"
PYTHON_HOST="${PYTHON_HOST:-0.0.0.0}"
MAX_RETRIES=30
RETRY_DELAY=2

# Store child process IDs
SEAL_SERVICE_PID=""
PYTHON_APP_PID=""

# Cleanup function - called on exit or signal
cleanup() {
    echo -e "${YELLOW}Shutting down services...${NC}"

    # Kill Python app if running
    if [[ -n "$PYTHON_APP_PID" ]] && kill -0 "$PYTHON_APP_PID" 2>/dev/null; then
        echo "Stopping Python app (PID: $PYTHON_APP_PID)..."
        kill "$PYTHON_APP_PID" 2>/dev/null || true
        # Wait for graceful shutdown (5 seconds max)
        for i in {1..5}; do
            if ! kill -0 "$PYTHON_APP_PID" 2>/dev/null; then
                break
            fi
            sleep 1
        done
        # Force kill if still running
        if kill -0 "$PYTHON_APP_PID" 2>/dev/null; then
            kill -9 "$PYTHON_APP_PID" 2>/dev/null || true
        fi
    fi

    # Kill Seal service if running
    if [[ -n "$SEAL_SERVICE_PID" ]] && kill -0 "$SEAL_SERVICE_PID" 2>/dev/null; then
        echo "Stopping Seal service (PID: $SEAL_SERVICE_PID)..."
        kill "$SEAL_SERVICE_PID" 2>/dev/null || true
        # Wait for graceful shutdown
        for i in {1..3}; do
            if ! kill -0 "$SEAL_SERVICE_PID" 2>/dev/null; then
                break
            fi
            sleep 1
        done
        # Force kill if still running
        if kill -0 "$SEAL_SERVICE_PID" 2>/dev/null; then
            kill -9 "$SEAL_SERVICE_PID" 2>/dev/null || true
        fi
    fi

    echo -e "${YELLOW}Shutdown complete${NC}"
    # Don't exit here - let the script exit naturally with its actual status
}

# Set up signal handlers (don't trap EXIT to preserve exit codes)
trap cleanup SIGINT SIGTERM

# Function to check if service is healthy
check_service_health() {
    local url="$1"
    local retries=0

    while [[ $retries -lt $MAX_RETRIES ]]; do
        if curl -s "$url/health" | grep -q "ok"; then
            return 0
        fi

        retries=$((retries + 1))
        if [[ $retries -lt $MAX_RETRIES ]]; then
            sleep $RETRY_DELAY
        fi
    done

    return 1
}

echo -e "${GREEN}=== Audio Verifier Startup ===${NC}"
echo "SEAL_SERVICE_URL: $SEAL_SERVICE_URL"
echo "PYTHON_HOST: $PYTHON_HOST"
echo "PYTHON_PORT: $PYTHON_PORT"
echo ""

# Step 1: Start Seal service
echo -e "${YELLOW}Starting Seal decryption service...${NC}"
cd "$(dirname "$0")/seal-decryptor-ts"

# Install dependencies if node_modules doesn't exist
if [[ ! -d "node_modules" ]]; then
    echo "Installing Seal service dependencies..."
    bun install
fi

# Start the service in background
SEAL_SERVICE_PORT="$SEAL_SERVICE_PORT" \
SEAL_SERVICE_HOST="$SEAL_SERVICE_HOST" \
LOG_LEVEL="${LOG_LEVEL:-info}" \
bun run start:service > /tmp/seal-service.log 2>&1 &
SEAL_SERVICE_PID=$!

echo "Seal service started (PID: $SEAL_SERVICE_PID)"
echo "Waiting for service to be ready at $SEAL_SERVICE_URL..."

# Wait for service to be healthy
if check_service_health "$SEAL_SERVICE_URL"; then
    echo -e "${GREEN}✓ Seal service is healthy${NC}"
else
    echo -e "${RED}✗ Seal service failed to start or is not responding${NC}"
    echo "Service logs:"
    cat /tmp/seal-service.log
    exit 1
fi

# Step 2: Start Python app
echo ""
echo -e "${YELLOW}Starting Python audio-verifier app...${NC}"
cd "$(dirname "$0")"

# Set environment variables for Python app
export SEAL_SERVICE_URL="$SEAL_SERVICE_URL"
export LOG_LEVEL="${LOG_LEVEL:-info}"

# Source library paths for C extensions (NumPy, etc.)
if [[ -f /etc/profile.d/nix-libs.sh ]]; then
    source /etc/profile.d/nix-libs.sh
fi

# Activate venv if it exists
if [[ -f ".venv/bin/activate" ]]; then
    source .venv/bin/activate
fi

# Verify NumPy can load C extensions before starting service
echo "Verifying NumPy installation..."
if ! python -c "import numpy; import numpy.core._multiarray_umath" 2>/dev/null; then
    echo -e "${RED}✗ NumPy C extensions failed to load (libstdc++.so.6 missing?)${NC}"
    echo "LD_LIBRARY_PATH: $LD_LIBRARY_PATH"
    cleanup
    exit 1
fi
echo "✓ NumPy verified"

# Start Python app
python -m uvicorn main:app \
    --host "$PYTHON_HOST" \
    --port "$PYTHON_PORT" \
    --log-level "${LOG_LEVEL:-info}" &
PYTHON_APP_PID=$!

echo "Python app started (PID: $PYTHON_APP_PID)"
echo -e "${GREEN}✓ All services started successfully${NC}"
echo ""
echo "Audio Verifier is running:"
echo "  API: http://$PYTHON_HOST:$PYTHON_PORT"
echo "  Seal Service: $SEAL_SERVICE_URL"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Wait for background processes and capture their exit status
wait $PYTHON_APP_PID
PYTHON_EXIT_CODE=$?
wait $SEAL_SERVICE_PID
SEAL_EXIT_CODE=$?

# If either service failed, exit with failure code
if [[ $PYTHON_EXIT_CODE -ne 0 ]]; then
    echo -e "${RED}✗ Python app exited with code $PYTHON_EXIT_CODE${NC}"
    cleanup
    exit $PYTHON_EXIT_CODE
elif [[ $SEAL_EXIT_CODE -ne 0 ]]; then
    echo -e "${RED}✗ Seal service exited with code $SEAL_EXIT_CODE${NC}"
    cleanup
    exit $SEAL_EXIT_CODE
fi
