# =============================================================================
# SONAR SEAL Key Server Dockerfile
# =============================================================================
# Multi-stage build for SEAL key-server binary
# Secrets injected via Railway environment variables at runtime

# Build stage
FROM rust:1.83-bullseye AS builder

WORKDIR /work

# Clone SEAL repository
RUN git clone https://github.com/MystenLabs/seal.git . && \
    git checkout main

# Build key-server binary in release mode
ENV CARGO_NET_GIT_FETCH_WITH_CLI=true
RUN cargo build --bin key-server --release --config net.git-fetch-with-cli=true

# Runtime stage
FROM debian:bullseye-slim AS runtime

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libpq5 \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy binary from builder
COPY --from=builder /work/target/release/key-server /opt/key-server/bin/key-server

# Create config directory
RUN mkdir -p /app/config

# Copy config template (actual secrets substituted at runtime)
COPY key-server-config.yaml.example /app/config/template.yaml

# Create startup script that substitutes Railway secrets into config
RUN printf '#!/bin/bash\n\
set -e\n\
\n\
echo "🔐 SONAR SEAL Key Server Starting..."\n\
echo "======================================"\n\
\n\
# Verify required environment variables\n\
if [ -z "$MASTER_KEY" ]; then\n\
  echo "❌ ERROR: MASTER_KEY environment variable not set"\n\
  exit 1\n\
fi\n\
\n\
if [ -z "$KEY_SERVER_OBJECT_ID" ]; then\n\
  echo "❌ ERROR: KEY_SERVER_OBJECT_ID environment variable not set"\n\
  exit 1\n\
fi\n\
\n\
echo "✅ Environment variables verified"\n\
\n\
# Substitute Railway secrets into config template\n\
echo "📝 Generating config from template..."\n\
sed "s|0x0000000000000000000000000000000000000000000000000000000000000000|${KEY_SERVER_OBJECT_ID}|g" /app/config/template.yaml > /app/config/key-server-config.yaml\n\
\n\
echo "✅ Config generated successfully"\n\
echo "🚀 Starting key server..."\n\
echo ""\n\
\n\
# Export config path for key server\n\
export CONFIG_PATH=/app/config/key-server-config.yaml\n\
\n\
# Run key server\n\
exec /opt/key-server/bin/key-server\n\
' > /app/start.sh && chmod +x /app/start.sh

# Expose ports
EXPOSE 2024 9184

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:2024/health || exit 1

# Start key server
CMD ["/app/start.sh"]
