# 🚀 SONAR Mainnet Deployment Guide

This guide walks through deploying SONAR to **Sui Mainnet** and configuring the SEAL key server for production use.

## Prerequisites

- Sui CLI installed (`sui --version` should show v1.43.0 or later)
- Mainnet wallet with sufficient SUI (~1 SUI for deployment + gas)
- Railway account for key server deployment
- SEAL repository cloned locally

## Step 1: Prepare Move Package for Mainnet

### 1.1 Update Move.toml

```bash
cd contracts
```

Edit `Move.toml` and update the dependencies:

```toml
[dependencies]
# Update to mainnet-compatible version
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "mainnet-v1.43.0" }
Walrus = { local = "./dependencies/walrus" }
WAL = { local = "./dependencies/wal" }

[addresses]
sonar = "0x0"
# Walrus mainnet package address
walrus = "0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77"
```

### 1.2 Switch to Mainnet

```bash
# Switch Sui CLI to mainnet
sui client switch --env mainnet

# Verify you're on mainnet
sui client envs

# Check your wallet has SUI
sui client gas
```

### 1.3 Build the Package

```bash
# From contracts/ directory
sui move build

# Verify build succeeds
# Should see: "Build Successful"
```

## Step 2: Deploy to Mainnet

### 2.1 Publish Package

```bash
sui client publish --gas-budget 500000000

# This will output:
# - Package ID (0x...)
# - Published objects
# - Transaction digest
```

**Save these values:**
- `PACKAGE_ID`: The published package object ID
- `STATS_OBJECT_ID`: The QualityMarketplace shared object
- `MARKETPLACE_ID`: The marketplace ID (if separate)

### 2.2 Verify Deployment

```bash
# View your package on explorer
# https://suiscan.xyz/mainnet/object/<PACKAGE_ID>

# Test calling a view function
sui client call \
  --package <PACKAGE_ID> \
  --module marketplace \
  --function get_stats \
  --args <STATS_OBJECT_ID> \
  --gas-budget 10000000
```

## Step 3: Configure SEAL Key Server for Mainnet

### 3.1 Generate Master Seed

```bash
# Clone SEAL if not already done
git clone https://github.com/MystenLabs/seal.git
cd seal

# Build seal-cli
cargo build --bin seal-cli --release

# Generate master seed
./target/release/seal-cli gen-seed

# Output: 64-character hex seed
# Example: a1b2c3d4e5f6789012345678901234567890123456789012345678901234
# ⚠️ SAVE THIS SECURELY - Store in password manager
```

### 3.2 Derive Client Key Pair

Update the key server config to use your mainnet package ID first:

```bash
cd /path/to/sonar/seal-keyserver

# Edit key-server-config.yaml.example
# Update package_ids to include your MAINNET package ID from Step 2.1
```

Use `seal-cli derive-key` to produce the client key pair for derivation index 0:

```bash
cd /path/to/sonar/seal-keyserver/seal
./target/release/seal-cli derive-key --seed <MASTER_KEY_FROM_3.1> --index 0

# Output:
# Master key: 0x<CLIENT_MASTER_KEY>
# Public key: 0x<PUBLIC_KEY>
```

Save both values. `CLIENT_MASTER_KEY` is your backup secret (do not share). `PUBLIC_KEY` is registered on-chain in the next step.

### 3.3 Register Key Server On-Chain (Mainnet)

```bash
# Make sure you're on mainnet
sui client switch --env mainnet

# Check balance (need ~0.01 SUI)
sui client gas

# Get the SEAL key_server package on mainnet
# The package ID should be from SEAL mainnet deployment
# Check https://docs.wal.app or Walrus Discord for latest

# Register key server
sui client call \
  --package <SEAL_PACKAGE_ID_MAINNET> \
  --module key_server \
  --function create_and_transfer_v1 \
  --args <SERVER_NAME> https://<SERVER_URL> 0 <PUBLIC_KEY_FROM_3.2> \
  --gas-budget 100000000
```

Pick an easy-to-recognize `<SERVER_NAME>` (for example, `"sonar-mainnet"`) and supply the HTTPS URL where the service will run. Each derivation index returns a unique `KEY_SERVER_OBJECT_ID`, so reserve a new index when onboarding additional clients in the future.

**Find the created object ID** in the transaction output:

```
Created Objects:
  ┌──
  │ ObjectID: 0x1234567890abcdef1234567890abcdef...
  │ Sender: 0x...
  │ Owner: Account Address ( 0x... )
  │ ObjectType: <SEAL_PACKAGE_ID>::key_server::KeyServer
  └──
```

**Copy the `ObjectID`** - this is your mainnet `KEY_SERVER_OBJECT_ID`.

## Step 4: Deploy Key Server to Railway

### 4.1 Update Railway Environment Variables

In your Railway dashboard for the key-server service:

```bash
MASTER_KEY = <your-64-char-seed-from-step-3.1>
KEY_SERVER_OBJECT_ID = <object-id-from-step-3.3>
CONFIG_PATH = /app/config/key-server-config.yaml
```

### 4.2 Update Config Template

Make sure `seal-keyserver/key-server-config.yaml.example` has:

```yaml
# Line 13: Network set to Mainnet
network: Mainnet

# Line 29: Your MAINNET package ID
package_ids:
  - "<YOUR_MAINNET_PACKAGE_ID_FROM_STEP_2.1>"
```

### 4.3 Commit and Deploy

```bash
git add seal-keyserver/key-server-config.yaml.example
git commit -m "feat: configure key server for mainnet deployment"
git push origin main
```

Railway will automatically rebuild and redeploy.

### 4.4 Verify Deployment

```bash
# Check health endpoint
curl https://your-railway-url.railway.app/health
# Expected: {"status":"healthy"}

# Check service info
curl https://your-railway-url.railway.app/v1/service
# Expected: JSON with key server details

# Check Railway logs
railway logs --service key-server
# Should see: "Listening on 0.0.0.0:2024"
```

## Step 5: Update Frontend Configuration

### 5.1 Update Environment Variables

Edit `frontend/.env` (or create from `.env.example`):

```bash
# Switch to mainnet
NEXT_PUBLIC_NETWORK=mainnet

# Contract addresses from Step 2.1
NEXT_PUBLIC_PACKAGE_ID=<YOUR_MAINNET_PACKAGE_ID>
NEXT_PUBLIC_STATS_OBJECT_ID=<YOUR_STATS_OBJECT_ID>
NEXT_PUBLIC_MARKETPLACE_ID=<YOUR_MARKETPLACE_ID>
NEXT_PUBLIC_REWARD_POOL_ID=<YOUR_REWARD_POOL_ID>

# Enable blockchain
NEXT_PUBLIC_USE_BLOCKCHAIN=true

# Key server URL (your Railway deployment)
NEXT_PUBLIC_SEAL_KEY_SERVERS=https://your-railway-url.railway.app

# Walrus mainnet endpoints
NEXT_PUBLIC_WALRUS_PUBLISHER_URL=https://publisher.walrus.space
NEXT_PUBLIC_WALRUS_AGGREGATOR_URL=https://aggregator.walrus.space
```

### 5.2 Test Frontend

```bash
cd frontend
bun run dev

# Navigate to http://localhost:3000/marketplace
# Try uploading a dataset
# Check browser console and Railway logs
```

## Step 6: Production Deployment

### 6.1 Deploy Frontend to Vercel/Railway

```bash
# If using Vercel
vercel --prod

# Set environment variables in Vercel dashboard
# (Same as Step 5.1)
```

### 6.2 Update DNS (if needed)

Point your custom domain to:
- Frontend: Vercel/Railway deployment
- Key Server: Railway deployment

### 6.3 Enable HTTPS

Both Railway and Vercel provide automatic HTTPS. Verify:

```bash
curl -I https://your-frontend.com
# Should return: HTTP/2 200

curl -I https://your-keyserver.railway.app
# Should return: HTTP/2 200
```

## Troubleshooting

### Key Server Fails to Start

**Symptom:** Railway logs show "Failed to initialize key server"

**Solution:**
1. Check `KEY_SERVER_OBJECT_ID` exists on mainnet
2. Verify `MASTER_KEY` is the same seed used to derive public key
3. Confirm package ID in config matches mainnet deployment

```bash
# Verify object exists on mainnet
sui client object <KEY_SERVER_OBJECT_ID> --network mainnet
```

### Frontend Can't Connect to Key Server

**Symptom:** "Failed to fetch encryption keys" in browser console

**Solution:**
1. Check `NEXT_PUBLIC_SEAL_KEY_SERVERS` URL is correct
2. Test key server health endpoint directly
3. Check CORS headers (Railway should allow all origins by default)

### Package Verification Fails

**Symptom:** "Package ID not allowed" in key server logs

**Solution:**
1. Verify package ID in `key-server-config.yaml.example` matches deployed package
2. Make sure you're using the mainnet package ID, not testnet
3. Redeploy Railway after config changes

## Security Checklist

- [ ] Master seed stored securely (password manager, encrypted)
- [ ] Railway environment variables set (not in git)
- [ ] HTTPS enabled for all endpoints
- [ ] Key server object registered on mainnet (not testnet)
- [ ] Package verification configured (only SONAR package can request keys)
- [ ] Frontend environment variables configured for mainnet
- [ ] DNS and domains configured
- [ ] Monitoring enabled (Railway logs, Prometheus metrics)

## Next Steps

1. **Monitor Railway logs** for key fetch requests
2. **Set up monitoring** (Prometheus, Grafana, etc.)
3. **Test full flow** (upload → encrypt → publish → purchase → decrypt)
4. **Document mainnet addresses** in your project README
5. **Consider backup key server** for high availability

## Reference

- **Sui Mainnet RPC:** `https://fullnode.mainnet.sui.io`
- **Sui Mainnet GraphQL:** `https://graphql.mainnet.sui.io/graphql`
- **Walrus Mainnet Package:** `0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77`
- **Walrus Mainnet Publisher:** `https://publisher.walrus.space`
- **Walrus Mainnet Aggregator:** `https://aggregator.walrus.space`
- **Sui Explorer:** `https://suiscan.xyz/mainnet`
- **SEAL Docs:** `https://seal-docs.wal.app`

---

**Built for Production** - Sui Mainnet Deployment 🚀
