# =============================================================================
# SONAR SEAL Key Server Dockerfile
# =============================================================================
# Auto-generates new key material on each deployment for security
# Check deployment logs for MASTER_KEY and PUBLIC_KEY

# Build stage
FROM rust:1.83-bullseye AS builder

WORKDIR /work

# Clone SEAL repository
RUN git clone https://github.com/MystenLabs/seal.git . && \
    git checkout main

# Build both seal-cli and key-server
ENV CARGO_NET_GIT_FETCH_WITH_CLI=true
RUN cargo build --bin seal-cli --release --config net.git-fetch-with-cli=true && \
    cargo build --bin key-server --release --config net.git-fetch-with-cli=true

# Runtime stage
FROM debian:bullseye-slim AS runtime

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libpq5 \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy binaries from builder
COPY --from=builder /work/target/release/key-server /opt/key-server/bin/key-server
COPY --from=builder /work/target/release/seal-cli /opt/key-server/bin/seal-cli

# Create config directory
RUN mkdir -p /app/config

# Copy config template
COPY railway/key-server-config.yaml.example /app/config/template.yaml

# Create startup script that generates keys and starts server
RUN printf '#!/bin/bash\n\
set -e\n\
\n\
echo ""\n\
echo "========================================================================"\n\
echo "🔐 SONAR SEAL Key Server - Auto Key Generation"\n\
echo "========================================================================"\n\
echo ""\n\
\n\
# Generate new master seed on each deployment\n\
echo "📝 Generating new master seed..."\n\
MASTER_KEY=$(/opt/key-server/bin/seal-cli gen-seed)\n\
\n\
echo "✅ Master seed generated"\n\
echo ""\n\
\n\
# Create temporary config for key derivation\n\
cat > /app/config/derive-config.yaml <<EOF\n\
server:\n\
  address: "0.0.0.0:2024"\n\
  metrics_address: "0.0.0.0:9184"\n\
\n\
master_key:\n\
  master_seed: "${MASTER_KEY}"\n\
\n\
sui:\n\
  url: "https://fullnode.mainnet.sui.io"\n\
  key_server_object_id: "0x0000000000000000000000000000000000000000000000000000000000000000"\n\
EOF\n\
\n\
echo "📝 Deriving public key..."\n\
CONFIG_PATH=/app/config/derive-config.yaml timeout 5 /opt/key-server/bin/key-server 2>&1 | tee /tmp/derive.log || true\n\
PUBLIC_KEY=$(grep -oP "Derived public key for index 0: \\K0x[a-f0-9]+" /tmp/derive.log || echo "DERIVATION_FAILED")\n\
\n\
echo ""\n\
echo "========================================================================"\n\
echo "🎉 KEY MATERIAL GENERATED"\n\
echo "========================================================================"\n\
echo ""\n\
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"\n\
echo "📋 MASTER_KEY (save to Railway secrets):"\n\
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"\n\
echo ""\n\
echo "${MASTER_KEY}"\n\
echo ""\n\
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"\n\
echo "📋 PUBLIC_KEY (for on-chain registration):"\n\
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"\n\
echo ""\n\
echo "${PUBLIC_KEY}"\n\
echo ""\n\
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"\n\
echo ""\n\
echo "📝 Register on-chain:"\n\
echo ""\n\
echo "sui client call \\\\\n\
echo "  --package 0xa212c4c6c7183b911d0be8768f4cb1df7a383025b5d0ba0c014009f0f30f5f8d \\\\\n\
echo "  --module key_server \\\\\n\
echo "  --function create_and_transfer_v1 \\\\\n\
echo "  --args ${PUBLIC_KEY} <YOUR_ADDRESS> \\\\\n\
echo "  --gas-budget 100000000"\n\
echo ""\n\
echo "Then set Railway env vars and redeploy:"\n\
echo "  MASTER_KEY=${MASTER_KEY}"\n\
echo "  KEY_SERVER_OBJECT_ID=<object ID from transaction>"\n\
echo ""\n\
echo "========================================================================"\n\
echo ""\n\
\n\
# Check if we have env vars to run production mode\n\
if [ -z "$KEY_SERVER_OBJECT_ID" ] || [ "$KEY_SERVER_OBJECT_ID" = "" ]; then\n\
  echo "⚠️  KEY_SERVER_OBJECT_ID not set - staying in setup mode"\n\
  echo ""\n\
  echo "Keeping container alive for 90 seconds so you can copy the keys..."\n\
  sleep 90\n\
  exit 0\n\
fi\n\
\n\
# Production mode - use provided env vars\n\
echo "✅ Using provided MASTER_KEY and KEY_SERVER_OBJECT_ID"\n\
echo "🚀 Starting production key server..."\n\
echo ""\n\
\n\
# Use env var MASTER_KEY if provided, otherwise use generated one\n\
FINAL_MASTER_KEY="${MASTER_KEY}"\n\
\n\
# Generate production config\n\
sed "s|0x0000000000000000000000000000000000000000000000000000000000000000|${KEY_SERVER_OBJECT_ID}|g" /app/config/template.yaml | \\\n\
sed "s|master_seed:.*|master_seed: \\"${FINAL_MASTER_KEY}\\"|g" > /app/config/key-server-config.yaml\n\
\n\
export CONFIG_PATH=/app/config/key-server-config.yaml\n\
exec /opt/key-server/bin/key-server\n\
' > /app/start.sh && chmod +x /app/start.sh

# Expose ports
EXPOSE 2024 9184

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:2024/health || exit 1

# Start key server
CMD ["/app/start.sh"]
