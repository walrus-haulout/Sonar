#!/bin/bash
set -e

# =============================================================================
# SONAR Audio Verifier Startup Script
# =============================================================================

echo "🔧 Starting SONAR Audio Verifier..."

# Set up library paths (needed for numpy C extensions)
# Source the Nix library paths if available
if [ -f /etc/profile.d/nix-libs.sh ]; then
    source /etc/profile.d/nix-libs.sh
fi

# Also set LD_LIBRARY_PATH directly if gcc lib directory file exists
if [ -f /tmp/gcc_lib_dir.txt ]; then
    GCC_LIB_DIR=$(cat /tmp/gcc_lib_dir.txt)
    export LD_LIBRARY_PATH="$GCC_LIB_DIR:${LD_LIBRARY_PATH:-}"
fi

# Activate virtual environment
source /app/.venv/bin/activate

# Use PORT environment variable if set (for Railway/cloud platforms)
# Otherwise default to 8000
PORT="${PORT:-8000}"

echo "   Port: ${PORT}"
echo "   Workers: 2"
echo ""

# Start uvicorn server
exec /app/.venv/bin/uvicorn main:app \
    --host 0.0.0.0 \
    --port "${PORT}" \
    --workers 2

