# SEAL Key Server Setup Guide

Self-host your own SEAL encryption key server for Sui blockchain.

## What is This?

A production-ready SEAL (Simple Encryption At Launch) key server that:
- Derives encryption keys from a master seed
- Validates on-chain permissions before serving keys
- Supports permissioned mode (whitelist specific packages)
- Can be deployed anywhere (Railway, AWS, GCP, local server, etc.)

## Quick Setup (3 Steps)

### Step 1: Generate Master Key

Deploy the container **without any environment variables**:

```bash
docker build -t seal-keyserver .
docker run seal-keyserver
```

The container will:
1. Generate a new MASTER_KEY
2. Display it in the logs
3. Exit after 10 seconds

**Save the MASTER_KEY securely** - this is your root secret.

### Step 2: Derive Client Key Pair

Redeploy with the MASTER_KEY but **without KEY_SERVER_OBJECT_ID**:

```bash
docker run -e MASTER_KEY="0x..." seal-keyserver
```

The container will:
1. Derive the `CLIENT_MASTER_KEY` and `PUBLIC_KEY` for derivation index 0
2. Display both values plus an on-chain registration template
3. Exit after 10 seconds

**Register the PUBLIC_KEY on-chain:**

```bash
sui client call \
  --package <SEAL_PACKAGE_ID> \
  --module key_server \
  --function create_and_transfer_v1 \
  --args <SERVER_NAME> https://<SERVER_URL> 0 <PUBLIC_KEY> \
  --gas-budget 100000000
```

Use the correct SEAL package ID for your network:
- Mainnet: `0xa212c4c6c7183b911d0be8768f4cb1df7a383025b5d0ba0c014009f0f30f5f8d`
- Testnet: `0x927a54e9ae803f82ebf480136a9bcff45101ccbe28b13f433c89f5181069d682`

Choose a human-friendly `<SERVER_NAME>` (for example, `"sonar-mainnet"`) and the HTTPS URL that will serve the key server. Each derivation index maps to a unique `KEY_SERVER_OBJECT_ID`, so increment the index when onboarding additional clients later.

Save the resulting **KEY_SERVER_OBJECT_ID** from the transaction.

### Step 3: Run Production Server

Deploy with both MASTER_KEY and KEY_SERVER_OBJECT_ID:

```bash
docker run \
  -e MASTER_KEY="0x..." \
  -e KEY_SERVER_OBJECT_ID="0x..." \
  -p 2024:2024 \
  -p 9184:9184 \
  seal-keyserver
```

The server is now running on port 2024!

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MASTER_KEY` | Yes | 32-byte seed (0x + 64 hex chars) |
| `KEY_SERVER_OBJECT_ID` | Yes* | On-chain key server object ID |

*Required for production, omit for key derivation

### Customizing Allowed Packages

Edit [`key-server-config.yaml.example`](key-server-config.yaml.example) and update:

```yaml
server_mode: !Permissioned
  client_configs:
    - name: "Your App"
      key_server_object_id: "0x..."  # From Step 2
      package_ids:
        - "0x..."  # Your package ID
```

Rebuild the Docker image after changes.

## Deployment Platforms

### Railway (Easiest)

1. Fork this repo
2. Create new Railway project from repo
3. Follow the 3-step setup above
4. Railway will auto-deploy and show logs

### Docker/VPS

```bash
# Build image
docker build -t seal-keyserver .

# Run with docker-compose
docker-compose up -d

# Or run directly
docker run -d \
  -e MASTER_KEY="0x..." \
  -e KEY_SERVER_OBJECT_ID="0x..." \
  -p 2024:2024 \
  --name seal-keyserver \
  seal-keyserver
```

### Kubernetes

Apply the provided manifests:

```bash
# Create secrets
kubectl create secret generic seal-secrets \
  --from-literal=master-key="0x..." \
  --from-literal=key-server-object-id="0x..."

# Deploy
kubectl apply -f k8s/deployment.yaml
```

## Health Check

```bash
curl http://localhost:2024/health
```

## Monitoring

Prometheus metrics available at: `http://localhost:9184/metrics`

## Security Best Practices

1. **Never commit secrets** - Use environment variables or secret managers
2. **Secure MASTER_KEY** - Store in a password manager or HSM
3. **Restrict network access** - Use firewall rules to limit who can access port 2024
4. **Enable HTTPS** - Use a reverse proxy (nginx, Caddy) with TLS certificates
5. **Monitor logs** - Watch for unauthorized access attempts

## Troubleshooting

### "Invalid ObjectID format"

Ensure IDs are exactly: `0x` + 64 hexadecimal characters (no spaces, newlines)

### Container exits immediately

This is expected in Step 1 and Step 2. Check logs for the MASTER_KEY or PUBLIC_KEY.

### Connection refused

- Check container is running: `docker ps`
- Check ports are exposed: `docker port seal-keyserver`
- Check firewall allows port 2024

## Files

- [`start.sh`](start.sh) - Startup script (handles 3-step flow)
- [`Dockerfile`](Dockerfile) - Container image
- [`key-server-config.yaml.example`](key-server-config.yaml.example) - Permissioned config template
- [`scripts/verify-config.sh`](scripts/verify-config.sh) - Validate config files

## Support

For issues, see the [SEAL documentation](https://github.com/MystenLabs/seal) or file an issue in this repo.
