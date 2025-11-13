# =============================================================================
# SONAR Audio Verifier Dockerfile
# Multi-stage build using Nix for reproducible builds
# =============================================================================
# Comprehensive audio verification service:
# - Quality analysis (duration, sample rate, clipping, silence)
# - Copyright detection (Chromaprint + AcoustID)
# - AI transcription (Gemini)
# - Content safety & quality analysis (Gemini)

# Stage 1: Nix-based builder
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

# Stage 2: Runtime image (NixOS-based for library compatibility)
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
RUN nix-env -iA nixpkgs.python313 nixpkgs.gcc nixpkgs.gcc.cc.lib nixpkgs.rustc nixpkgs.cargo nixpkgs.pkg-config nixpkgs.ffmpeg nixpkgs.chromaprint nixpkgs.libsndfile nixpkgs.curl nixpkgs.shadow nixpkgs.coreutils nixpkgs.openssl nixpkgs.zlib nixpkgs.bash

# Set up library paths for runtime (needed for numpy C extensions)
# Find gcc's libstdc++ and add to LD_LIBRARY_PATH
RUN LIBSTDCPP_FILE=$(find /nix/store -name "libstdc++.so.6" -type f 2>/dev/null | head -1) && \
    if [ -z "$LIBSTDCPP_FILE" ]; then \
        echo "❌ Error: libstdc++.so.6 not found in Nix store" && exit 1; \
    fi && \
    GCC_LIB_DIR=$(dirname "$LIBSTDCPP_FILE") && \
    echo "Found libstdc++ at: $GCC_LIB_DIR" && \
    echo "$GCC_LIB_DIR" > /tmp/gcc_lib_dir.txt && \
    chmod 644 /tmp/gcc_lib_dir.txt && \
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
