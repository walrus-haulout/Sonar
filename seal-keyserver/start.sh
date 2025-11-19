#!/bin/bash
set -e

# ============================================================================
# Environment Setup (Docker & Nixpacks compatibility)
# ============================================================================

echo "🔧 Initializing environment..."

# Create required directories
mkdir -p /app/config
mkdir -p /opt/key-server/bin

# Determine base directory (current working directory)
BASE_DIR="$(pwd)"
echo "   Base directory: ${BASE_DIR}"

# Copy template files if they exist in the current directory
if [ -f "${BASE_DIR}/key-server-config.yaml.example" ]; then
  echo "   Copying config templates..."
  cp "${BASE_DIR}/key-server-config.yaml.example" /app/config/template.yaml
  cp "${BASE_DIR}/key-server-config-open.yaml.example" /app/config/template-open.yaml 2>/dev/null || true
  
  # Copy scripts if they exist
  if [ -d "${BASE_DIR}/scripts" ]; then
    mkdir -p /app/scripts
    cp -r "${BASE_DIR}/scripts/"* /app/scripts/ 2>/dev/null || true
    chmod +x /app/scripts/*.sh 2>/dev/null || true
  fi
fi

# Check if Rust binaries are present (should be built during Railpack build phase)
if [ ! -f "/opt/key-server/bin/key-server" ] || [ ! -f "/opt/key-server/bin/seal-cli" ]; then
  echo "❌ Error: key-server binaries not found in /opt/key-server/bin"
  echo "   The Railpack build phase must compile the Rust binaries via railpack.toml"
  echo "   Check the deployment build logs for cargo build output and rerun the build"
  exit 1
else
  echo "   ✅ Rust binaries found"
fi

# Verify binaries are executable
chmod +x /opt/key-server/bin/key-server /opt/key-server/bin/seal-cli

echo "✅ Environment initialized"
echo ""

echo ""
echo "========================================================================"
echo "🔐 SEAL Key Server"
echo "========================================================================"
echo ""

# Validate ObjectID format (0x followed by 64 hex chars)
validate_object_id() {
  local id="$1"
  if [[ ! "$id" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
    echo "❌ Error: Invalid ObjectID format: $id"
    echo "   Expected: 0x followed by 64 hexadecimal characters"
    return 1
  fi
  return 0
}

run_setup_server() {
  local stage="$1"
  shift
  local message="$*"

  export SETUP_STAGE="$stage"
  export SETUP_MESSAGE="$message"

  cat <<'PY' > /tmp/setup_server.py
import http.server
import json
import os
import socketserver

PORT = int(os.environ.get("PORT", "2024"))
STAGE = os.environ.get("SETUP_STAGE", "setup")
MESSAGE = os.environ.get("SETUP_MESSAGE", "")

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ("/", "/health"):
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        payload = {
            "status": "setup",
            "stage": STAGE,
            "message": MESSAGE,
        }
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def log_message(self, format, *args):
        return

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"📡 Setup helper listening on port {PORT} (stage={STAGE})")
    print("   Health endpoint will return setup status until configuration is complete.")
    httpd.serve_forever()
PY

  python3 /tmp/setup_server.py
}

# Check if MASTER_KEY is already set
if [ -z "${MASTER_KEY:-}" ]; then
  # Setup mode: Generate new keys
  echo "📝 Generating new master seed..."
  MASTER_KEY_RAW=$(/opt/key-server/bin/seal-cli gen-seed)
  GENERATED_MASTER_KEY=$(echo "$MASTER_KEY_RAW" | grep -oP "0x[a-f0-9]+" || echo "$MASTER_KEY_RAW")

  echo "✅ Master seed generated"
  echo ""
  echo "========================================================================"
  echo "🎉 MASTER KEY GENERATED"
  echo "========================================================================"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📋 MASTER_KEY (save this securely):"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "$GENERATED_MASTER_KEY"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "📝 Next steps:"
  echo ""
  echo "1. Save the MASTER_KEY to your environment variables or secrets manager"
  echo "2. Redeploy with MASTER_KEY set (will output PUBLIC_KEY in logs)"
  echo "3. Register the PUBLIC_KEY on-chain"
  echo "4. Set KEY_SERVER_OBJECT_ID and redeploy for production"
  echo ""
  echo "========================================================================"
  echo ""
  echo "📡 Setup helper server will keep running so deployment stays healthy."
  echo "   Retrieve the MASTER_KEY from the logs above and update Railway variables."
  echo ""

  export GENERATED_MASTER_KEY="$GENERATED_MASTER_KEY"
  run_setup_server "master_key_generation" "Set MASTER_KEY environment variable to the generated value shown in the logs, then redeploy."
fi

# Production mode: MASTER_KEY is set
echo "✅ Using existing MASTER_KEY"
CLEAN_MASTER_KEY=$(echo -n "${MASTER_KEY}" | tr -d "\n\r")

# Check if we have KEY_SERVER_OBJECT_ID
if [ -z "$KEY_SERVER_OBJECT_ID" ] || [ "$KEY_SERVER_OBJECT_ID" = "" ]; then
  echo "⚠️  KEY_SERVER_OBJECT_ID not set - deriving client key material"
  echo ""

  DERIVATION_INDEX=${DERIVATION_INDEX:-0}
  if ! [[ "$DERIVATION_INDEX" =~ ^[0-9]+$ ]]; then
    echo "❌ Error: DERIVATION_INDEX must be a non-negative integer (got '$DERIVATION_INDEX')"
    run_setup_server "invalid_configuration" "DERIVATION_INDEX must be a non-negative integer."
  fi

  echo "📝 Deriving client key pair from MASTER_KEY (index ${DERIVATION_INDEX})..."

  set +e
  DERIVE_OUTPUT=$(/opt/key-server/bin/seal-cli derive-key --seed "$CLEAN_MASTER_KEY" --index "$DERIVATION_INDEX" 2>&1)
  DERIVE_STATUS=$?
  set -e

  if [ $DERIVE_STATUS -ne 0 ]; then
    echo "❌ Failed to derive key material:"
    echo "$DERIVE_OUTPUT"
    run_setup_server "derive_key_failed" "seal-cli derive-key failed. Verify MASTER_KEY (0x + 64 hex) and DERIVATION_INDEX."
  fi

  CLIENT_MASTER_KEY=$(echo "$DERIVE_OUTPUT" | grep -oE "0x[0-9a-fA-F]+" | head -1 || true)
  DERIVED_PUBLIC_KEY=$(echo "$DERIVE_OUTPUT" | grep -oE "0x[0-9a-fA-F]+" | tail -1 || true)

  if [ -z "$CLIENT_MASTER_KEY" ] || [ -z "$DERIVED_PUBLIC_KEY" ]; then
    echo "❌ Unable to parse derived public key from seal-cli output:"
    echo "$DERIVE_OUTPUT"
    run_setup_server "derive_key_failed" "seal-cli derive-key output did not contain key material. Verify MASTER_KEY."
  fi

  echo ""
  echo "========================================================================"
  echo "🎉 CLIENT KEY MATERIAL DERIVED"
  echo "========================================================================"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📋 CLIENT_MASTER_KEY (store securely - do not share):"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "$CLIENT_MASTER_KEY"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "📋 PUBLIC_KEY (register this on-chain):"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "$DERIVED_PUBLIC_KEY"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "📝 Next steps:"
  echo ""
  echo "1. Register this public key on-chain:"
  echo ""
  echo "   sui client call \\"
  echo "     --package 0xa212c4c6c7183b911d0be8768f4cb1df7a383025b5d0ba0c014009f0f30f5f8d \\"
  echo "     --module key_server \\"
  echo "     --function create_and_transfer_v1 \\"
  echo "     --args <SERVER_NAME> https://<SERVER_URL> 0 $DERIVED_PUBLIC_KEY \\"
  echo "     --gas-budget 100000000"
  echo ""
  echo "2. Set KEY_SERVER_OBJECT_ID from the transaction and redeploy"
  echo ""
  echo "========================================================================"
  echo ""
  export DERIVED_CLIENT_MASTER_KEY="$CLIENT_MASTER_KEY"
  export DERIVED_PUBLIC_KEY="$DERIVED_PUBLIC_KEY"
  run_setup_server "public_key_registration" "Register the derived PUBLIC_KEY on-chain using create_and_transfer_v1 (<SERVER_NAME> https://<SERVER_URL> 0 <PUBLIC_KEY>), set KEY_SERVER_OBJECT_ID, then redeploy."
fi

# Validate KEY_SERVER_OBJECT_ID format
CLEAN_KEY_SERVER_ID=$(echo -n "${KEY_SERVER_OBJECT_ID}" | tr -d "\n\r")
if ! validate_object_id "$CLEAN_KEY_SERVER_ID"; then
  echo ""
  echo "Please check your KEY_SERVER_OBJECT_ID environment variable"
  run_setup_server "invalid_configuration" "KEY_SERVER_OBJECT_ID must be 0x followed by 64 hex characters. Update the variable and redeploy."
fi

# Production mode: Both MASTER_KEY and KEY_SERVER_OBJECT_ID are set
echo "📝 Generating production config with:"
echo "   Key Server Object ID: ${CLEAN_KEY_SERVER_ID}"
echo ""

# Replace placeholders in the Permissioned template
sed "s|0x0000000000000000000000000000000000000000000000000000000000000000|${CLEAN_KEY_SERVER_ID}|g" \
  /app/config/template.yaml > /app/config/key-server-config.yaml

echo "✅ Config generated at /app/config/key-server-config.yaml"
echo ""

# Check if NEXT_PUBLIC_PACKAGE_ID env var is set (will override YAML config)
if [ -n "${NEXT_PUBLIC_PACKAGE_ID:-}" ]; then
  echo "✅ NEXT_PUBLIC_PACKAGE_ID environment variable detected"
  echo "   Will override package_ids in config: ${NEXT_PUBLIC_PACKAGE_ID}"
  echo ""
fi

echo "🚀 Starting key server..."
echo ""

# Error trap for debugging startup failures
trap 'echo "❌ Key server startup failed with exit code $?"; exit 1' ERR

export CONFIG_PATH=/app/config/key-server-config.yaml
export MASTER_KEY="${CLEAN_MASTER_KEY}"
FORWARDED_PORT="${PORT:-2024}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Configuration:"
echo "   CONFIG_PATH: ${CONFIG_PATH}"
echo "   Target Port: 2024 (key-server listens here)"
echo "   Platform Port: ${FORWARDED_PORT}"
echo "   Network: Mainnet (connecting to Sui blockchain...)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "$FORWARDED_PORT" != "2024" ]; then
  echo "🔁 Detected platform port ${FORWARDED_PORT}, forwarding traffic to 2024"
  echo "   Starting socat forwarder in background..."
  socat TCP-LISTEN:"${FORWARDED_PORT}",fork,reuseaddr TCP:127.0.0.1:2024 &
  SOCAT_PID=$!
  echo "   Socat running with PID ${SOCAT_PID}"
  echo ""
fi

echo "🎯 Executing key-server binary..."
echo "   This may take 30-60s to connect to Sui Mainnet and initialize"
echo "   Health checks will start after initialization completes"
echo ""

# Verify binary is actually executable and can be read
echo "🔍 Verifying binary before execution..."
if [ -x "/opt/key-server/bin/key-server" ]; then
  echo "   ✓ Binary is executable"
else
  echo "   ❌ Binary is not executable, attempting to fix..."
  chmod +x /opt/key-server/bin/key-server
fi

# Try to get binary info (this will fail if libraries are missing, but gives us info)
echo "   Binary location: $(ls -lh /opt/key-server/bin/key-server)"
echo "   Testing binary execution..."

# Change to /app directory for runtime
cd /app

# Execute the binary
exec /opt/key-server/bin/key-server
