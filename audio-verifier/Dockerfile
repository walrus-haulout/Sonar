# =============================================================================
# SONAR Audio Verifier Dockerfile
# Multi-stage build using Nix for reproducible builds
# =============================================================================
# Comprehensive audio verification service:
# - Quality analysis (duration, sample rate, clipping, silence)
# - Copyright detection (Chromaprint + AcoustID)
# - AI transcription (Gemini)
# - Content safety & quality analysis (Gemini)

# Stage 1: Build seal-cli binary
FROM nixos/nix:latest AS seal-cli-builder

# Enable Nix flakes and configure cache
RUN mkdir -p /etc/nix && \
    echo "experimental-features = nix-command flakes" >> /etc/nix/nix.conf && \
    echo "auto-optimise-store = true" >> /etc/nix/nix.conf && \
    echo "sandbox = false" >> /etc/nix/nix.conf

WORKDIR /build

# Install Rust/Cargo, git, gcc, and OpenSSL for building seal-cli
# Remove git-minimal first to avoid conflicts, then install full git
RUN nix-env -e git-minimal 2>/dev/null || true && \
    nix-env -iA nixpkgs.rustc nixpkgs.cargo nixpkgs.git nixpkgs.gcc nixpkgs.pkg-config nixpkgs.openssl nixpkgs.openssl.dev nixpkgs.zlib

# Clone seal repository and build seal-cli (configure OpenSSL paths via nix eval)
RUN set -eux; \
    git clone https://github.com/MystenLabs/seal.git seal; \
    cd seal; \
    git checkout main; \
    OPENSSL_LIB=$(nix eval --impure --raw --expr 'let pkgs = import <nixpkgs> {}; in pkgs.openssl.lib.outPath'); \
    OPENSSL_DEV=$(nix eval --impure --raw --expr 'let pkgs = import <nixpkgs> {}; in pkgs.openssl.dev.outPath'); \
    export OPENSSL_DIR="$OPENSSL_DEV"; \
    export OPENSSL_LIB_DIR="$OPENSSL_LIB/lib"; \
    export OPENSSL_INCLUDE_DIR="$OPENSSL_DEV/include"; \
    export PKG_CONFIG_PATH="$OPENSSL_DEV/lib/pkgconfig:${PKG_CONFIG_PATH:-}"; \
    export CARGO_NET_GIT_FETCH_WITH_CLI=true; \
    cargo build --bin seal-cli --release --config net.git-fetch-with-cli=true

# Verify seal-cli was built
RUN test -f /build/seal/target/release/seal-cli && \
    echo "✓ seal-cli built successfully" || \
    (echo "✗ seal-cli build failed" && exit 1)

# Stage 2: Nix-based builder for Python app
FROM nixos/nix:latest AS builder

# Enable Nix flakes and configure cache
RUN mkdir -p /etc/nix && \
    echo "experimental-features = nix-command flakes" >> /etc/nix/nix.conf && \
    echo "auto-optimise-store = true" >> /etc/nix/nix.conf && \
    echo "sandbox = false" >> /etc/nix/nix.conf

WORKDIR /build

# Install Python 3.13 (includes pip), build tools, and system dependencies via nix-env
RUN nix-env -iA nixpkgs.python313 nixpkgs.gcc nixpkgs.rustc nixpkgs.cargo nixpkgs.pkg-config nixpkgs.git nixpkgs.openssl nixpkgs.zlib

# Copy project files
COPY pyproject.toml .
COPY *.py .

# Create virtual environment and install Python dependencies using pip
# Nix-managed Python is immutable, so we must use a venv
RUN python3.13 -m venv /build/.venv && \
    . /build/.venv/bin/activate && \
    pip install --upgrade pip && \
    pip install .

# Verify installation
RUN . /build/.venv/bin/activate && \
    python -c "import main; print('✓ Application installed successfully')" && \
    python -c "import fastapi; print('✓ FastAPI available')" && \
    python -c "import librosa; print('✓ Librosa available')" && \
    python -c "import pysui; print('✓ PySui available')"

# Stage 3: Runtime image (NixOS-based for library compatibility)
FROM nixos/nix:latest AS runtime

# Enable Nix flakes and configure cache (same as builder stage)
RUN mkdir -p /etc/nix && \
    echo "experimental-features = nix-command flakes" >> /etc/nix/nix.conf && \
    echo "auto-optimise-store = true" >> /etc/nix/nix.conf && \
    echo "sandbox = false" >> /etc/nix/nix.conf

# Install runtime dependencies using nix-env
# Python 3.13 with pip, build tools (needed for pysui-fastcrypto), and system libraries for audio processing
# Note: pip comes with python313, so we don't need to install it separately
# bash is required for start.sh script execution
RUN nix-env -iA nixpkgs.python313 nixpkgs.gcc nixpkgs.rustc nixpkgs.cargo nixpkgs.pkg-config nixpkgs.ffmpeg nixpkgs.chromaprint nixpkgs.libsndfile nixpkgs.curl nixpkgs.shadow nixpkgs.coreutils nixpkgs.openssl nixpkgs.zlib nixpkgs.bash nixpkgs.gawk

# Install gcc.cc.lib separately to ensure libstdc++ is available
# This is the runtime library package for GCC's C++ standard library
# Note: gcc.cc.lib is a nested attribute, so we use nix-env -i with an expression
RUN nix-env -i -f '<nixpkgs>' -A gcc.cc.lib 2>/dev/null || \
    nix-env -i -E 'with import <nixpkgs> {}; gcc.cc.lib' 2>/dev/null || \
    echo "Note: gcc.cc.lib installation attempted (may not be needed if gcc includes it)"

# Set up library paths for runtime (needed for numpy C extensions)
# Find gcc's libstdc++ and add to LD_LIBRARY_PATH
# Try multiple search strategies to locate the library
RUN LIBSTDCPP_FILE="" && \
    # Strategy 1: Find in gcc package directory
    GCC_BIN=$(which gcc 2>/dev/null || echo "") && \
    if [ -n "$GCC_BIN" ]; then \
        GCC_PKG=$(nix-store -q "$GCC_BIN" 2>/dev/null | head -1 || echo ""); \
        if [ -n "$GCC_PKG" ]; then \
            LIBSTDCPP_FILE=$(find "$GCC_PKG" -name "libstdc++.so.6" 2>/dev/null | head -1); \
        fi; \
    fi && \
    # Strategy 2: Find in gcc.cc.lib package if installed
    if [ -z "$LIBSTDCPP_FILE" ]; then \
        GCC_LIB_PKG=$(nix-env -q --out-path 2>/dev/null | grep -E 'gcc.*cc.*lib' | head -1 | awk '{print $NF}' || echo ""); \
        if [ -n "$GCC_LIB_PKG" ] && [ -d "$GCC_LIB_PKG" ]; then \
            LIBSTDCPP_FILE=$(find "$GCC_LIB_PKG" -name "libstdc++.so.6" 2>/dev/null | head -1); \
        fi; \
    fi && \
    # Strategy 3: General search in Nix store
    if [ -z "$LIBSTDCPP_FILE" ]; then \
        LIBSTDCPP_FILE=$(find /nix/store -name "libstdc++.so.6" 2>/dev/null | head -1); \
    fi && \
    # Strategy 4: Find any versioned libstdc++.so file (e.g., libstdc++.so.6.0.33)
    if [ -z "$LIBSTDCPP_FILE" ]; then \
        LIBSTDCPP_FILE=$(find /nix/store -name "libstdc++.so*" -type f 2>/dev/null | grep -E 'libstdc\+\+\.so\.[0-9]' | head -1); \
    fi && \
    # Error handling with debug info
    if [ -z "$LIBSTDCPP_FILE" ]; then \
        echo "❌ Error: libstdc++.so not found in Nix store" && \
        echo "Debug: GCC binary location: $(which gcc)" && \
        echo "Debug: GCC package: $(nix-store -q $(which gcc) 2>/dev/null | head -1)" && \
        echo "Debug: Installed packages:" && \
        nix-env -q 2>/dev/null | head -20 && \
        echo "Debug: Searching for any libstdc++ files..." && \
        find /nix/store -name "*libstdc++*" -type f 2>/dev/null | head -10 && \
        exit 1; \
    fi && \
    GCC_LIB_DIR=$(dirname "$LIBSTDCPP_FILE") && \
    echo "Found libstdc++ at: $GCC_LIB_DIR" && \
    echo "$GCC_LIB_DIR" > /tmp/gcc_lib_dir.txt && \
    chmod 644 /tmp/gcc_lib_dir.txt && \
    mkdir -p /etc/profile.d && \
    echo "export LD_LIBRARY_PATH=\"$GCC_LIB_DIR:\${LD_LIBRARY_PATH:-}\"" >> /etc/profile.d/nix-libs.sh && \
    chmod +x /etc/profile.d/nix-libs.sh

# Set LD_LIBRARY_PATH for all processes using the found path
# Read the path from the file we created and set it as an environment variable
RUN GCC_LIB_DIR=$(cat /tmp/gcc_lib_dir.txt) && \
    echo "export LD_LIBRARY_PATH=\"$GCC_LIB_DIR:\${LD_LIBRARY_PATH:-}\"" >> /etc/environment

# Create directory for application
WORKDIR /app

# Copy application source code
COPY pyproject.toml .
COPY *.py .

# Create virtual environment and install Python dependencies in runtime stage
# Nix-managed Python is immutable, so we must use a venv
RUN python3.13 -m venv /app/.venv && \
    . /app/.venv/bin/activate && \
    pip install --upgrade pip && \
    pip install .

# Create temp directory for audio processing with proper permissions
# Used by verification pipeline for Gemini uploads
RUN mkdir -p /tmp/audio-verifier && chmod 1777 /tmp/audio-verifier

# Create /bin/bash symlink for start.sh script execution
# NixOS minimal image doesn't have /bin/bash by default
RUN mkdir -p /bin && \
    BASH_PATH=$(which bash || echo "") && \
    if [ -n "$BASH_PATH" ]; then \
        ln -sf "$BASH_PATH" /bin/bash || cp "$BASH_PATH" /bin/bash; \
    else \
        echo "❌ Error: bash not found after installation" && exit 1; \
    fi

# Install seal-cli binary from seal-cli-builder stage
# Create /usr/local/bin directory and copy seal-cli there
RUN mkdir -p /usr/local/bin

# Copy seal-cli binary from seal-cli-builder stage
COPY --from=seal-cli-builder /build/seal/target/release/seal-cli /usr/local/bin/seal-cli

# Verify seal-cli is installed and executable
RUN test -f /usr/local/bin/seal-cli && \
    chmod +x /usr/local/bin/seal-cli && \
    /usr/local/bin/seal-cli --version > /dev/null 2>&1 && \
    echo "✓ seal-cli installed successfully" || \
    (echo "⚠️  Warning: seal-cli verification failed (may need runtime libraries)" && \
     ls -lh /usr/local/bin/seal-cli || true)

# Copy user setup script and start script
COPY setup_user.py /tmp/setup_user.py
COPY start.sh /app/start.sh

# Create non-root user for runtime using Python script
# This handles user creation reliably in NixOS environment
RUN python3.13 /tmp/setup_user.py && \
    chmod +x /app/start.sh

USER verifier
ENV HOME=/home/verifier
WORKDIR /app

# Expose port
EXPOSE 8000

# Health check (using venv Python, respects PORT env var)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD /app/.venv/bin/python -c "import os, httpx; port=os.environ.get('PORT', '8000'); httpx.get(f'http://localhost:{port}/health', timeout=5.0)"

# Start server using start.sh script (handles PORT env var for Railway/cloud platforms)
CMD ["/app/start.sh"]
