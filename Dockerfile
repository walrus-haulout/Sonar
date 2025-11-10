ARG SERVICE_DIR=seal-keyserver

# =============================================================================
# Build stage - compile MystenLabs SEAL binaries
# =============================================================================
FROM rust:1.83-bullseye AS builder

WORKDIR /work

# Clone SEAL repository and build required binaries
RUN git clone https://github.com/MystenLabs/seal.git . && \
    git checkout main

ENV CARGO_NET_GIT_FETCH_WITH_CLI=true
RUN cargo build --bin seal-cli --release --config net.git-fetch-with-cli=true && \
    cargo build --bin key-server --release --config net.git-fetch-with-cli=true

# =============================================================================
# Runtime stage - package SONAR SEAL key server assets
# =============================================================================
FROM debian:bullseye-slim AS runtime

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libpq5 \
    libpq-dev \
    curl \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Copy binaries from builder stage
COPY --from=builder /work/target/release/key-server /opt/key-server/bin/key-server
COPY --from=builder /work/target/release/seal-cli /opt/key-server/bin/seal-cli

# Transfer SONAR key server assets
ARG SERVICE_DIR
RUN mkdir -p /app/config /app/scripts
COPY ${SERVICE_DIR}/key-server-config.yaml.example /app/config/template.yaml
COPY ${SERVICE_DIR}/key-server-config-open.yaml.example /app/config/template-open.yaml
COPY ${SERVICE_DIR}/scripts/verify-config.sh /app/scripts/verify-config.sh
COPY ${SERVICE_DIR}/start.sh /app/start.sh
RUN chmod +x /app/start.sh /app/scripts/verify-config.sh

# Expose ports
EXPOSE 2024 9184

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:2024/health || exit 1

# Start key server
CMD ["/app/start.sh"]

