#!/bin/bash
set -e

# Build script for seal-keyserver
# Supports multiple build methods: Cargo (default), Nix, or Bazel

BUILD_METHOD="${BUILD_METHOD:-cargo}"

echo "🔨 Building Rust binaries using ${BUILD_METHOD}..."

case "$BUILD_METHOD" in
  cargo)
    echo "Using Cargo build..."
    cd seal
    export CARGO_NET_GIT_FETCH_WITH_CLI=true
    
    echo "Building seal-cli..."
    cargo build --bin seal-cli --release --config net.git-fetch-with-cli=true
    
    echo "Building key-server..."
    cargo build --bin key-server --release --config net.git-fetch-with-cli=true
    ;;
    
  nix)
    echo "Using Nix build..."
    if command -v nix-shell >/dev/null 2>&1; then
      nix-shell default.nix --run "
        cd seal && \
        export CARGO_NET_GIT_FETCH_WITH_CLI=true && \
        cargo build --bin seal-cli --release --config net.git-fetch-with-cli=true && \
        cargo build --bin key-server --release --config net.git-fetch-with-cli=true
      "
    else
      echo "❌ Error: nix-shell not found. Install Nix from https://nixos.org/download.html"
      exit 1
    fi
    ;;
    
  bazel)
    echo "Using Bazel build..."
    if command -v bazel >/dev/null 2>&1; then
      bazel build //:binaries
      # Copy binaries from Bazel output to seal/target/release for consistency
      mkdir -p seal/target/release
      cp bazel-bin/key-server-bin seal/target/release/key-server 2>/dev/null || true
      cp bazel-bin/seal-cli-bin seal/target/release/seal-cli 2>/dev/null || true
    else
      echo "❌ Error: bazel not found. Install Bazel from https://bazel.build/install"
      exit 1
    fi
    ;;
    
  *)
    echo "❌ Error: Unknown build method: $BUILD_METHOD"
    echo "Supported methods: cargo, nix, bazel"
    exit 1
    ;;
esac

echo "✅ Build complete"
echo "Verifying binaries exist..."
test -f seal/target/release/seal-cli && echo "  ✓ seal-cli found" || (echo "  ✗ seal-cli not found" && exit 1)
test -f seal/target/release/key-server && echo "  ✓ key-server found" || (echo "  ✗ key-server not found" && exit 1)

