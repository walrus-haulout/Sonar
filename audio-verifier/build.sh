#!/bin/bash
set -e

# Build script for sonar-audio-verifier
# Supports multiple build methods: pip (default), Nix, or Bazel

BUILD_METHOD="${BUILD_METHOD:-pip}"

echo "🔨 Building Python application using ${BUILD_METHOD}..."

case "$BUILD_METHOD" in
  pip)
    echo "Using pip build..."
    if command -v python3.13 >/dev/null 2>&1; then
      python3.13 -m venv .venv || true
      . .venv/bin/activate 2>/dev/null || true
      pip install --upgrade pip
      pip install .
    else
      echo "❌ Error: python3.13 not found"
      exit 1
    fi
    ;;
    
  nix)
    echo "Using Nix build..."
    if command -v nix-build >/dev/null 2>&1; then
      nix-build -A packages.default
    elif command -v nix-shell >/dev/null 2>&1; then
      nix-shell default.nix --run "pip install ."
    else
      echo "❌ Error: nix-build or nix-shell not found. Install Nix from https://nixos.org/download.html"
      exit 1
    fi
    ;;
    
  bazel)
    echo "Using Bazel build..."
    if command -v bazel >/dev/null 2>&1; then
      bazel build //:application
    else
      echo "❌ Error: bazel not found. Install Bazel from https://bazel.build/install"
      exit 1
    fi
    ;;
    
  *)
    echo "❌ Error: Unknown build method: $BUILD_METHOD"
    echo "Supported methods: pip, nix, bazel"
    exit 1
    ;;
esac

echo "✅ Build complete"
echo "Verifying installation..."
python3.13 -c "import main; print('  ✓ main module found')" || (echo "  ✗ main module not found" && exit 1)
python3.13 -c "import fastapi; print('  ✓ fastapi found')" || (echo "  ✗ fastapi not found" && exit 1)

