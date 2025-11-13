# =============================================================================
# SEAL Key Server Dockerfile
# Multi-stage build using Nix for reproducible builds
# =============================================================================
# Self-hosted SEAL encryption key server for Sui blockchain
#
# Three-stage deployment:
# 1. First run (no env vars): Generates and displays MASTER_KEY
# 2. Second run (MASTER_KEY only): Derives and displays PUBLIC_KEY
# 3. Production (both env vars): Runs the key server
#
# See SETUP_GUIDE.md for complete instructions

# Stage 1: Nix-based builder
FROM nixos/nix:2.23 AS builder

# Enable Nix flakes and configure cache
RUN mkdir -p /etc/nix && \
    echo "experimental-features = nix-command flakes" >> /etc/nix/nix.conf && \
    echo "auto-optimise-store = true" >> /etc/nix/nix.conf && \
    echo "sandbox = false" >> /etc/nix/nix.conf

WORKDIR /build

# Copy Nix files first for better caching
COPY flake.nix default.nix ./

# Install Nix dependencies (this will be cached)
RUN nix-shell default.nix --run "echo 'Nix environment ready'"

# Copy source code
COPY seal/ ./seal/
COPY start.sh build.sh ./

# Build using Cargo with Nix-provided toolchain
RUN nix-shell default.nix --run "cd seal && \
    export CARGO_NET_GIT_FETCH_WITH_CLI=true && \
    cargo build --bin seal-cli --release --config net.git-fetch-with-cli=true && \
    cargo build --bin key-server --release --config net.git-fetch-with-cli=true"

# Verify binaries were built
RUN test -f seal/target/release/key-server && \
    test -f seal/target/release/seal-cli && \
    echo "✅ Binaries built successfully"

# Stage 2: Runtime image (minimal)
FROM debian:bullseye-slim AS runtime

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libpq5 \
    curl \
    python3 \
    socat \
    && rm -rf /var/lib/apt/lists/*

# Create directories
RUN mkdir -p /app/config /app/scripts /opt/key-server/bin

# Copy binaries from builder
COPY --from=builder /build/seal/target/release/key-server /opt/key-server/bin/key-server
COPY --from=builder /build/seal/target/release/seal-cli /opt/key-server/bin/seal-cli

# Copy config templates and scripts
COPY key-server-config.yaml.example /app/config/template.yaml
COPY key-server-config-open.yaml.example /app/config/template-open.yaml 2>/dev/null || true
COPY scripts/verify-config.sh /app/scripts/verify-config.sh 2>/dev/null || true
COPY start.sh /app/start.sh

# Set permissions
RUN chmod +x /app/start.sh /opt/key-server/bin/key-server /opt/key-server/bin/seal-cli && \
    chmod +x /app/scripts/verify-config.sh 2>/dev/null || true

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

