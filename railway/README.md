# 🔐 SONAR SEAL Key Server Deployment

Production-ready SEAL key server for permissioned encryption on Sui.

> **📍 Deploying to Mainnet?** See [MAINNET_DEPLOYMENT.md](./MAINNET_DEPLOYMENT.md) for the complete mainnet deployment guide.
>
> **This README covers testnet deployment** - perfect for testing and development.

## 🎯 Hackathon Showcase

This demonstrates **production-grade security infrastructure** for Web3:

- ✅ **Self-hosted SEAL encryption** - No reliance on third-party key servers
- ✅ **Permissioned mode** - Only SONAR marketplace can request keys
- ✅ **Secure secrets management** - Railway environment variables (never in git)
- ✅ **Production deployment** - Scalable, monitored, health-checked
- ✅ **Zero secrets in git** - Config template + runtime substitution

## 🏗️ Architecture

```
┌──────────────┐     HTTPS/TLS      ┌──────────────────┐
│    SONAR     │ ─────────────────▶ │   Key Server     │
│   Frontend   │   Encrypt Request  │   (Railway)      │
│              │ ◀───────────────── │                  │
└──────────────┘   Derived Keys     └──────────────────┘
                                             │
                                             │ Verify Policy
                                             ▼
                                    ┌──────────────────┐
                                    │   Sui Testnet    │
                                    │  (On-chain ACL)  │
                                    └──────────────────┘
                                             │
                                             ▼
                                    ┌──────────────────┐
                                    │  Walrus Storage  │
                                    │ (Encrypted Data) │
                                    └──────────────────┘
```

### How It Works

1. **User uploads audio** → SONAR frontend encrypts with SEAL
2. **Frontend requests key** → Key server verifies package ID on-chain
3. **Key server derives** → Uses master seed + policy to generate encryption key
4. **Frontend encrypts** → Audio encrypted, uploaded to Walrus
5. **Buyer purchases** → Smart contract grants access, key server provides decryption key

## 📋 Prerequisites

- **Sui CLI** installed (`curl -fsSL https://sui.io/install.sh | bash`)
- **Sui wallet** with testnet SUI (get from [faucet](https://discord.com/channels/916379725201563759/971488439931392130))
- **Railway account** ([railway.app](https://railway.app))
- **Rust/Cargo** (for local setup): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

## 🚀 Quick Start (30 minutes)

### Step 1: Generate Master Seed (5 min)

```bash
# Clone SEAL repository
git clone https://github.com/MystenLabs/seal.git
cd seal

# Build seal-cli
cargo build --bin seal-cli --release

# Generate master seed
./target/release/seal-cli gen-seed

# Output: 64-character hex seed
# Example: a1b2c3d4e5f6...
# ⚠️ SAVE THIS SECURELY - YOU'LL NEED IT FOR RAILWAY
```

**Important:** This seed is your root secret. Anyone with this seed can derive all keys. Store it securely (password manager, encrypted file, etc.).

### Step 2: Get Derived Public Key (5 min)

```bash
# Navigate to SONAR railway directory
cd /path/to/sonar/railway

# Copy environment template
cp .env.example .env

# Edit .env and set MASTER_KEY to your seed from Step 1
# MASTER_KEY=a1b2c3d4e5f6...

# Run key server locally ONCE to derive public key
cd ../seal
MASTER_KEY=<your-seed> \
CONFIG_PATH=../sonar/railway/key-server-config.yaml.example \
cargo run --bin key-server

# Server will log:
# "Derived public key for index 0: 0xABC123..."
# ⚠️ COPY THIS PUBLIC KEY - YOU'LL NEED IT FOR ON-CHAIN REGISTRATION
```

The server will fail to start (expected - no object ID yet), but it will log the derived public key. Stop the server (Ctrl+C) after copying the key.

### Step 3: Register Key Server On-Chain (5 min)

```bash
# Make sure you're on Sui testnet
sui client switch --env testnet

# Check your balance (need ~0.01 SUI)
sui client gas

# Register key server (replace <PUBLIC_KEY> with value from Step 2)
sui client call \
  --package 0x599d35684e6c8bcbe8c34ad75f7273e2abedc8067d192d05c71bb5d63a4cbd5f \
  --module key_server \
  --function create_and_transfer_v1 \
  --args <PUBLIC_KEY> <YOUR_WALLET_ADDRESS> \
  --gas-budget 10000000

# Example:
# sui client call \
#   --package 0x599d35684e6c8bcbe8c34ad75f7273e2abedc8067d192d05c71bb5d63a4cbd5f \
#   --module key_server \
#   --function create_and_transfer_v1 \
#   --args 0x93a5a...  0x123abc... \
#   --gas-budget 10000000
```

**Find your object ID** in the transaction output:
```
Created Objects:
  ┌──
  │ ObjectID: 0x1234567890abcdef1234567890abcdef...
  │ Sender: 0x...
  │ Owner: Account Address ( 0x... )
  │ ObjectType: 0x599d35...::key_server::KeyServer
  └──
```

Copy the `ObjectID` - this is your `KEY_SERVER_OBJECT_ID`.

### Step 4: Deploy to Railway (10 min)

#### 4.1 Create Railway Project

1. Go to [railway.app](https://railway.app) and sign in
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Connect your GitHub account and select `sonar` repository
4. Click **"Add variables"** before deploying

#### 4.2 Set Environment Variables

In Railway dashboard, add these variables:

```bash
MASTER_KEY = <your-64-char-seed-from-step-1>
KEY_SERVER_OBJECT_ID = <object-id-from-step-3>
CONFIG_PATH = /app/config/key-server-config.yaml
```

**Screenshot location:** Settings → Variables → Add Variable

#### 4.3 Set Root Directory

1. Settings → **"Root Directory"** → Set to `railway/`
2. This tells Railway to use the `railway/` folder as the build context

#### 4.4 Deploy

1. Click **"Deploy"**
2. Railway automatically detects Dockerfile and builds
3. Wait ~5-10 minutes for build to complete
4. Get your deployment URL: `https://sonar-keyserver-abc123.up.railway.app`

#### 4.5 Verify Deployment

```bash
# Check health
curl https://your-url.railway.app/health
# Expected: {"status":"healthy"}

# Check service info
curl https://your-url.railway.app/v1/service
# Expected: JSON with key server details

# Check metrics (optional)
curl https://your-url.railway.app:9184/metrics
# Expected: Prometheus metrics
```

### Step 5: Update SONAR Frontend (5 min)

```bash
# Edit frontend/.env
cd ../frontend
nano .env

# Add this line (replace with your Railway URL):
NEXT_PUBLIC_SEAL_KEY_SERVERS=https://your-url.railway.app

# Restart frontend dev server
bun run dev
```

### Step 6: Test Encryption Flow (5 min)

1. Navigate to `http://localhost:3000/marketplace`
2. Click **"Upload Dataset"**
3. Select an audio file
4. Fill in metadata (title, description)
5. **Encryption Step** - should now use your Railway key server
6. Check Railway logs for key fetch requests
7. Verify encrypted blob uploaded to Walrus
8. Complete publish to create on-chain submission

✅ **Success!** Your SEAL key server is now handling encryption for SONAR.

## 🔒 Security Model

### What's Public (In Git)

- ✅ Config **template** structure (`key-server-config.yaml.example`)
- ✅ Package IDs (already public on-chain)
- ✅ Deployment infrastructure (Dockerfile, railway.toml)
- ✅ Documentation and setup scripts

### What's Secret (Railway Only)

- 🔒 `MASTER_KEY` - Root seed (encrypted at rest in Railway)
- 🔒 `KEY_SERVER_OBJECT_ID` - Deployment-specific identifier
- 🔒 Actual config values (substituted at runtime)

### How Runtime Substitution Works

1. **Build Time:**
   - Dockerfile copies config **template** into image
   - Template has placeholder: `REPLACE_KEY_SERVER_OBJECT_ID`

2. **Startup Time:**
   - Startup script runs (`/app/start.sh`)
   - Reads Railway secrets from environment
   - Substitutes placeholders: `sed "s/REPLACE_KEY_SERVER_OBJECT_ID/${KEY_SERVER_OBJECT_ID}/g"`
   - Writes real config: `/app/config/key-server-config.yaml`

3. **Runtime:**
   - Key server reads config with actual values
   - Master key loaded from `MASTER_KEY` env var
   - Secrets never written to disk or logs

## 📊 Monitoring & Operations

### Health Checks

```bash
# Main health endpoint
curl https://your-url.railway.app/health

# Service information
curl https://your-url.railway.app/v1/service
```

### Prometheus Metrics

Key server exposes Prometheus metrics on port 9184:

```bash
curl https://your-url.railway.app:9184/metrics
```

**Key metrics:**
- `key_server_requests_total` - Total requests
- `key_server_key_fetches` - Key derivation operations
- `key_server_errors_total` - Error count
- `key_server_response_time_seconds` - Latency

### Logs

View logs in Railway dashboard:
1. Go to your project
2. Click on deployment
3. View **"Logs"** tab

**Filter for important events:**
- `"Derived public key"` - Key generation
- `"Config generated"` - Startup config substitution
- `"fetch_key"` - Encryption requests

### Troubleshooting

**Problem:** Health check fails
**Solution:** Check Railway logs for startup errors. Verify `MASTER_KEY` and `KEY_SERVER_OBJECT_ID` are set.

**Problem:** Frontend can't connect
**Solution:** Verify `NEXT_PUBLIC_SEAL_KEY_SERVERS` matches Railway URL. Check CORS settings.

**Problem:** "Permission denied" errors
**Solution:** Verify SONAR package ID in `key-server-config.yaml.example` matches deployed contract.

**Problem:** Build fails
**Solution:** Check Railway build logs. Ensure root directory is set to `railway/`.

## 🔄 Updating Configuration

### Add Another Package

To allow another package to use your key server:

1. Stop Railway service
2. Update `key-server-config.yaml.example`:
   ```yaml
   - name: "New Package"
     key_server_object_id: "REPLACE_KEY_SERVER_OBJECT_ID_2"
     package_ids:
       - "0xNEW_PACKAGE_ID"
     client_master_key: !Derived
       derivation_index: 1  # ← New index!
   ```
3. Run locally to get derived public key for index 1
4. Register new derived key on-chain (Step 3)
5. Update Railway secret: `KEY_SERVER_OBJECT_ID_2`
6. Redeploy Railway service

### Rotate Master Key

⚠️ **Warning:** Rotating the master key invalidates all derived keys!

1. Generate new master seed
2. Re-register all derived public keys on-chain
3. Update Railway `MASTER_KEY` secret
4. Redeploy

## 🎓 For Hackathon Judges

### What This Demonstrates

1. **Enterprise Security:**
   - Self-hosted encryption infrastructure
   - Permissioned access control
   - Secrets management best practices

2. **Sui Ecosystem Integration:**
   - SEAL (Sui Encrypted Archive Library)
   - Walrus decentralized storage
   - On-chain policy enforcement

3. **Production Readiness:**
   - Docker containerization
   - Health checks & monitoring
   - Scalable Railway deployment
   - Zero-downtime updates

4. **Developer Experience:**
   - Clear documentation
   - Reproducible setup (< 30 min)
   - Template-based configuration
   - Security by default

### Try It Yourself

1. Follow Quick Start above
2. Upload audio in SONAR marketplace
3. Inspect encryption in browser dev tools
4. View key fetch requests in Railway logs
5. Verify encrypted blob on Walrus

## 📚 Additional Resources

- **SEAL Documentation:** [seal-docs.wal.app](https://seal-docs.wal.app)
- **SEAL GitHub:** [github.com/MystenLabs/seal](https://github.com/MystenLabs/seal)
- **Sui Testnet Faucet:** [Discord](https://discord.com/channels/916379725201563759/971488439931392130)
- **Railway Docs:** [docs.railway.app](https://docs.railway.app)
- **Walrus Docs:** [docs.walrus.site](https://docs.walrus.site)

## 🤝 Contributing

Found an issue or want to improve the deployment? PRs welcome!

1. Test changes locally first
2. Update documentation if needed
3. Never commit actual secrets
4. Follow security best practices

## 📄 License

This deployment configuration is part of the SONAR project. See main repo LICENSE.

---

**Built for the Sui Hackathon 2025** 🏆
