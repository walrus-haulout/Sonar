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
FROM nixos/nix:latest AS builder

# Enable Nix flakes and configure cache
RUN mkdir -p /etc/nix && \
    echo "experimental-features = nix-command flakes" >> /etc/nix/nix.conf && \
    echo "auto-optimise-store = true" >> /etc/nix/nix.conf && \
    echo "sandbox = false" >> /etc/nix/nix.conf

WORKDIR /build

# Install Python 3 and git for script execution and repository cloning
# Remove git-minimal first to avoid conflicts, then install full git
RUN nix-env -e git-minimal 2>/dev/null || true && \
    nix-env -iA nixpkgs.python3 nixpkgs.git

# Copy Nix files first for better caching
COPY flake.nix default.nix ./

# Install Nix dependencies (this will be cached)
RUN nix-shell default.nix --run "echo 'Nix environment ready'"

# Copy source code and Python scripts
# Try to copy seal directory, but if it's empty (git submodule not initialized), clone it
COPY seal ./seal
COPY start.sh build.sh ./
COPY scripts/build.py ./scripts/

# Verify seal directory and clone if empty (handles git submodule case)
RUN if [ ! -f seal/Cargo.toml ]; then \
        echo "⚠️  seal/ directory is empty, cloning from GitHub..." && \
        rm -rf seal && \
        git clone https://github.com/MystenLabs/seal.git seal && \
        cd seal && \
        git checkout main && \
        cd ..; \
    fi && \
    echo "=== Contents of /build/seal ===" && \
    ls -la seal/ | head -10 && \
    echo "" && \
    echo "=== Checking for Cargo.toml ===" && \
    find seal -name "Cargo.toml" -type f | head -5 && \
    test -f seal/Cargo.toml && echo "✓ Cargo.toml found" || (echo "✗ Cargo.toml missing" && exit 1)

# Build using Cargo with Nix-provided toolchain
RUN nix-shell default.nix --run "cd /build/seal && \
    export CARGO_NET_GIT_FETCH_WITH_CLI=true && \
    cargo build --bin seal-cli --release --config net.git-fetch-with-cli=true && \
    cargo build --bin key-server --release --config net.git-fetch-with-cli=true"

# Verify binaries were built and show their locations
RUN echo "=== Verifying built binaries ===" && \
    ls -lh /build/seal/target/release/key-server /build/seal/target/release/seal-cli && \
    test -f /build/seal/target/release/key-server && \
    test -f /build/seal/target/release/seal-cli && \
    echo "✅ Both binaries built successfully" || \
    (echo "❌ Error: Binaries not found after build" && \
     ls -la /build/seal/target/release/ && \
     exit 1)

# Verify binaries were built using Python script
RUN python3 scripts/build.py seal/target/release

# Stage 2: Runtime image (NixOS-based for library compatibility)
FROM nixos/nix:latest AS runtime

# Enable Nix flakes and configure cache (same as builder stage)
RUN mkdir -p /etc/nix && \
    echo "experimental-features = nix-command flakes" >> /etc/nix/nix.conf && \
    echo "auto-optimise-store = true" >> /etc/nix/nix.conf && \
    echo "sandbox = false" >> /etc/nix/nix.conf

# Install runtime dependencies using nix-env
# These match the libraries the binaries were built against
# shadow provides useradd/userdel/etc for user management
# coreutils provides /bin/false and other standard utilities
# bash is required for start.sh script execution
RUN nix-env -iA nixpkgs.cacert nixpkgs.postgresql.lib nixpkgs.curl nixpkgs.python3 nixpkgs.socat nixpkgs.shadow nixpkgs.coreutils nixpkgs.bash

# Create directory for binaries
RUN mkdir -p /opt/key-server/bin

# Copy binaries from builder (Docker COPY will fail if source doesn't exist)
COPY --from=builder /build/seal/target/release/key-server /opt/key-server/bin/key-server
COPY --from=builder /build/seal/target/release/seal-cli /opt/key-server/bin/seal-cli

# Verify binaries were copied successfully and set permissions
RUN echo "=== Verifying copied binaries ===" && \
    ls -lah /opt/key-server/bin/ && \
    test -f /opt/key-server/bin/key-server && \
    test -f /opt/key-server/bin/seal-cli && \
    chmod +x /opt/key-server/bin/key-server /opt/key-server/bin/seal-cli && \
    echo "✅ Binaries copied and permissions set successfully" || \
    (echo "❌ Error: Binaries not found after COPY" && \
     echo "Contents of /opt/key-server/bin:" && \
     ls -la /opt/key-server/bin/ && \
     echo "Contents of /opt/key-server:" && \
     ls -la /opt/key-server/ && \
     exit 1)

# Copy config templates and scripts
COPY key-server-config.yaml.example /app/config/template.yaml
COPY key-server-config-open.yaml.example /app/config/template-open.yaml
COPY start.sh /app/start.sh
COPY scripts/verify-config.sh /app/scripts/verify-config.sh
COPY scripts/setup.py /app/scripts/setup.py

# Run Python setup script to handle file copying and permissions
RUN python3 /app/scripts/setup.py

# Create non-root user for runtime
# Initialize system files needed for useradd (NixOS minimal image doesn't have them)
# Find where 'false' is located (coreutils installs it in /nix/store/...)
# Create /bin/false symlink so useradd can find it
# Also create /bin/bash symlink for start.sh script execution
RUN mkdir -p /etc /bin && \
    FALSE_PATH=$(which false || echo "") && \
    if [ -n "$FALSE_PATH" ]; then \
        ln -sf "$FALSE_PATH" /bin/false || cp "$FALSE_PATH" /bin/false; \
    else \
        echo "#!/bin/sh" > /bin/false && echo "exit 1" >> /bin/false && chmod +x /bin/false; \
    fi && \
    BASH_PATH=$(which bash || echo "") && \
    if [ -n "$BASH_PATH" ]; then \
        ln -sf "$BASH_PATH" /bin/bash || cp "$BASH_PATH" /bin/bash; \
    else \
        echo "❌ Error: bash not found after installation" && exit 1; \
    fi

# Initialize system files for manual user creation
RUN touch /etc/passwd /etc/group /etc/shadow /etc/gshadow && \
    chmod 644 /etc/passwd /etc/group && \
    chmod 600 /etc/shadow /etc/gshadow && \
    echo "root:x:0:0:root:/root:/bin/sh" >> /etc/passwd && \
    echo "root:x:0:" >> /etc/group && \
    test -f /etc/passwd && test -f /etc/group && echo "System files initialized"

# Create user manually (useradd has issues in NixOS minimal image)
# Add user entry to /etc/passwd and /etc/group
RUN echo "keyserver:x:10001:0:keyserver user:/home/keyserver:/bin/false" >> /etc/passwd && \
    echo "keyserver:x:10001:" >> /etc/group && \
    mkdir -p /home/keyserver && \
    chown -R 10001:0 /home/keyserver /app /opt/key-server && \
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

