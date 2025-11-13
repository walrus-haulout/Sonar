#!/bin/bash
set -e

echo "🔨 Building Rust binaries..."

cd seal

echo "Building seal-cli..."
cargo build --bin seal-cli --release --config net.git-fetch-with-cli=true

echo "Building key-server..."
cargo build --bin key-server --release --config net.git-fetch-with-cli=true

echo "✅ Build complete"
echo "Verifying binaries exist..."
test -f target/release/seal-cli && echo "  ✓ seal-cli found" || (echo "  ✗ seal-cli not found" && exit 1)
test -f target/release/key-server && echo "  ✓ key-server found" || (echo "  ✗ key-server not found" && exit 1)

