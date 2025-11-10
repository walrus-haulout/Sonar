# SEAL Key Server

Self-hosted encryption key server for Sui blockchain using [SEAL (Simple Encryption At Launch)](https://github.com/MystenLabs/seal).

## What is This?

A production-ready Docker container that:
- Manages encryption keys for your Sui dApp
- Validates on-chain permissions before serving keys
- Supports permissioned mode (whitelist specific packages)
- Deploys anywhere: Railway, AWS, GCP, Docker, Kubernetes, etc.

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
- [`Dockerfile`](Dockerfile) - Container image
- [`key-server-config.yaml.example`](key-server-config.yaml.example) - Config template

## Support

For issues with SEAL itself, see the [official SEAL repository](https://github.com/MystenLabs/seal).

For mainnet deployments, see [MAINNET_DEPLOYMENT.md](MAINNET_DEPLOYMENT.md).

## License

See the SEAL repository for license information.

