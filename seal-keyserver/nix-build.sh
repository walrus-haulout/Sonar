#!/bin/bash
set -e

# Nix-specific build script for seal-keyserver
# Uses Nix to provide a reproducible build environment

echo "🔨 Building with Nix..."

# Check if Nix is installed
if ! command -v nix-shell >/dev/null 2>&1; then
  echo "❌ Error: Nix is not installed"
  echo "Install Nix from: https://nixos.org/download.html"
  exit 1
fi

# Check if we're using flakes
if [ -f "flake.nix" ]; then
  echo "📦 Using Nix Flakes..."
  
  # Try to use flake if available
  if command -v nix >/dev/null 2>&1 && nix --version | grep -q "flakes"; then
    echo "Building with Nix Flakes..."
    nix build .#packages.default 2>/dev/null || {
      echo "⚠️  Flake build failed, falling back to nix-shell..."
      USE_FLAKE=false
    }
  else
    USE_FLAKE=false
  fi
fi

# Fallback to nix-shell
if [ "${USE_FLAKE:-true}" != "true" ]; then
  echo "📦 Using nix-shell..."
  nix-shell default.nix --run "
    cd seal && \
    export CARGO_NET_GIT_FETCH_WITH_CLI=true && \
    echo 'Building seal-cli...' && \
    cargo build --bin seal-cli --release --config net.git-fetch-with-cli=true && \
    echo 'Building key-server...' && \
    cargo build --bin key-server --release --config net.git-fetch-with-cli=true
  "
fi

echo "✅ Nix build complete"
echo "Verifying binaries exist..."
test -f seal/target/release/seal-cli && echo "  ✓ seal-cli found" || (echo "  ✗ seal-cli not found" && exit 1)
test -f seal/target/release/key-server && echo "  ✓ key-server found" || (echo "  ✗ key-server not found" && exit 1)

