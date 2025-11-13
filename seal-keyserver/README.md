# SEAL Key Server

Self-hosted encryption key server for Sui blockchain using [SEAL (Simple Encryption At Launch)](https://github.com/MystenLabs/seal).

## What is This?

A production-ready Docker container that:
- Manages encryption keys for your Sui dApp
- Validates on-chain permissions before serving keys
- Supports permissioned mode (whitelist specific packages)
- Deploys anywhere: Railway, AWS, GCP, Docker, Kubernetes, etc.

## Build System

This project uses **Bazel + Nix + Docker** for reproducible, reliable builds:

- **Bazel**: Build orchestration and caching
- **Nix**: Reproducible dependency management (Rust toolchain, system deps)
- **Docker**: Multi-stage containerization for production deployment

This replaces the previous Railpack-based build system for better reliability and reproducibility.

## Quick Start

### 1. Generate Master Key (First Run)

```bash
docker build -t seal-keyserver .
docker run seal-keyserver
```

**Copy the MASTER_KEY from the logs** and save it securely.

### 2. Derive Client Key Pair (Second Run)

```bash
docker run -e MASTER_KEY="0x..." seal-keyserver
```

The container will print both:
- `CLIENT_MASTER_KEY` (keep this secret; used for backup/export)
- `PUBLIC_KEY` (register this on-chain)

Register the public key on-chain with the SEAL package for your network:

```bash
sui client call \
  --package <SEAL_PACKAGE_ID> \
  --module key_server \
  --function create_and_transfer_v1 \
  --args <SERVER_NAME> https://<SERVER_URL> 0 <PUBLIC_KEY> \
  --gas-budget 100000000
```

Use the correct SEAL package ID:
- Mainnet: `0xa212c4c6c7183b911d0be8768f4cb1df7a383025b5d0ba0c014009f0f30f5f8d`
- Testnet: `0x927a54e9ae803f82ebf480136a9bcff45101ccbe28b13f433c89f5181069d682`

Pick a descriptive `<SERVER_NAME>` (e.g., `"sonar-mainnet"`) and the HTTPS URL where your deployment will live. Each derivation index yields a unique `KEY_SERVER_OBJECT_ID`, so increment the index for every additional client registration.

**Copy the KEY_SERVER_OBJECT_ID** from the transaction.

### 3. Run Production Server

```bash
docker run -d \
  -e MASTER_KEY="0x..." \
  -e KEY_SERVER_OBJECT_ID="0x..." \
  -p 2024:2024 \
  -p 9184:9184 \
  --name seal-keyserver \
  seal-keyserver
```

Your key server is now running on port 2024!

## Building Locally

### Using Docker (Recommended)

```bash
docker build -t seal-keyserver .
```

The Dockerfile uses Nix to provide a reproducible build environment.

### Using Cargo (Direct)

```bash
cd seal
export CARGO_NET_GIT_FETCH_WITH_CLI=true
cargo build --bin seal-cli --release --config net.git-fetch-with-cli=true
cargo build --bin key-server --release --config net.git-fetch-with-cli=true
```

### Using Nix

```bash
# With Nix Flakes (recommended)
nix build .#packages.default

# Or with nix-shell
./nix-build.sh

# Or use the build script
BUILD_METHOD=nix ./build.sh
```

### Using Bazel

```bash
# Build with Bazel
bazel build //:binaries

# Or use the build script
BUILD_METHOD=bazel ./build.sh
```

The build script (`build.sh`) supports multiple methods:
- `BUILD_METHOD=cargo` (default) - Direct Cargo build
- `BUILD_METHOD=nix` - Nix-provided environment
- `BUILD_METHOD=bazel` - Bazel build orchestration

## Configuration

### Environment Variables

- `MASTER_KEY` - 32-byte seed (0x + 64 hex chars) - **Required**
- `KEY_SERVER_OBJECT_ID` - On-chain key server object ID - **Required for production**

### Customize Allowed Packages

Edit [`key-server-config.yaml.example`](key-server-config.yaml.example):

```yaml
server_mode: !Permissioned
  client_configs:
    - name: "Your App Name"
      key_server_object_id: "0x..."  # Your KEY_SERVER_OBJECT_ID
      package_ids:
        - "0x..."  # Your package ID on Sui
```

Rebuild the Docker image after changes.

## Deployment Options

- **Railway** - One-click deploy from repo
- **Docker** - `docker run` or `docker-compose up`
- **Kubernetes** - Apply provided manifests
- **VPS** - Any server with Docker installed

### Railway Deployment

Railway automatically detects and uses the `Dockerfile` for builds (configured in [`railway.json`](railway.json)). The build process:

1. Uses Nix to provide a reproducible Rust toolchain
2. Builds both `key-server` and `seal-cli` binaries
3. Creates a minimal runtime image

**Railway Configuration:**

- Railway uses [`railway.json`](railway.json) to build with `Dockerfile`
- Each Railway service **must** set its own secrets before the container leaves setup mode:
  - `MASTER_KEY` – 64-hex seed for the cluster (shared across services you want to manage the same key tree).
  - `KEY_SERVER_OBJECT_ID` – mainnet object registered for that specific keyserver instance. Missing or malformed values keep `/health` in `"setup"` state and cause Railway to cycle the build.
  - Optional: `DERIVATION_INDEX` if you run multiple keyservers from the same master key and need distinct derivations. The default is `0`.
- After setting secrets, redeploy so `/health` returns `"status": "ready"` and the key server starts handling requests on port `2024`.

**Note:** The previous Railpack-based build system (`railpack.toml`) has been replaced with Docker+Nix for better reliability. The old `railpack.toml` is archived as `railpack.toml.backup`.

See [SETUP_GUIDE.md](SETUP_GUIDE.md) for detailed platform-specific instructions.

## Health Check

```bash
curl http://localhost:2024/health
```

## Monitoring

Prometheus metrics: `http://localhost:9184/metrics`

## Security

- Never commit MASTER_KEY to git
- Use environment variables or secret managers
- Enable HTTPS with a reverse proxy (nginx, Caddy)
- Restrict network access with firewall rules

## Files

- [`SETUP_GUIDE.md`](SETUP_GUIDE.md) - Complete setup instructions
- [`start.sh`](start.sh) - Startup script (3-stage deployment)
- [`Dockerfile`](Dockerfile) - Multi-stage Docker image using Nix
- [`build.sh`](build.sh) - Multi-method build script (Cargo/Nix/Bazel)
- [`nix-build.sh`](nix-build.sh) - Nix-specific build script
- [`flake.nix`](flake.nix) - Nix Flakes environment definition
- [`default.nix`](default.nix) - Nix shell environment (fallback)
- [`WORKSPACE`](WORKSPACE) - Bazel workspace configuration
- [`BUILD`](BUILD) - Bazel build targets
- [`railway.json`](railway.json) - Railway deployment configuration
- [`key-server-config.yaml.example`](key-server-config.yaml.example) - Config template

## Support

For issues with SEAL itself, see the [official SEAL repository](https://github.com/MystenLabs/seal).

For mainnet deployments, see [MAINNET_DEPLOYMENT.md](MAINNET_DEPLOYMENT.md).

## License

See the SEAL repository for license information.

