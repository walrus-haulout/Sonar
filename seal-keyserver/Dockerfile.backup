# =============================================================================
# SEAL Key Server Dockerfile
# =============================================================================
# Self-hosted SEAL encryption key server for Sui blockchain
#
# Three-stage deployment:
# 1. First run (no env vars): Generates and displays MASTER_KEY
# 2. Second run (MASTER_KEY only): Derives and displays PUBLIC_KEY
# 3. Production (both env vars): Runs the key server
#
# See SETUP_GUIDE.md for complete instructions

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
    python3 \
    socat \
    && rm -rf /var/lib/apt/lists/*

# Copy binaries from builder
COPY --from=builder /work/target/release/key-server /opt/key-server/bin/key-server
COPY --from=builder /work/target/release/seal-cli /opt/key-server/bin/seal-cli

# Create config directory
RUN mkdir -p /app/config

# Copy config templates, scripts, and startup script
COPY key-server-config.yaml.example /app/config/template.yaml
COPY key-server-config-open.yaml.example /app/config/template-open.yaml
COPY scripts/verify-config.sh /app/scripts/verify-config.sh
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh /app/scripts/verify-config.sh

# Create non-root user for runtime
RUN useradd --create-home --shell /usr/sbin/nologin --uid 10001 keyserver && \
    chown -R keyserver:root /app /opt/key-server && \
    chmod 755 /app/config

USER keyserver
ENV HOME=/home/keyserver
WORKDIR /app

# Expose ports
EXPOSE 2024 9184

# Health check
# Railway: Give the key-server 60s to connect to Sui Mainnet before health checks start
# Use PORT env var to handle Railway's dynamic port assignment
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:${PORT:-2024}/health || exit 1

# Start key server
CMD ["/app/start.sh"]
