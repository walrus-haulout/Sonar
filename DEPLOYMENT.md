# SONAR Production Deployment Guide

Complete guide for deploying SONAR to production with Vercel and Railway.

## Architecture Overview

```
┌─────────────────┐
│  Vercel (CDN)   │
│   - Next.js     │  ←── Users
│   - Edge Fns    │
└────────┬────────┘
         │
         ├──→ Sui Mainnet (Blockchain)
         │    - Smart Contracts
         │    - Marketplace Logic
         │
         ├──→ Railway Services
         │    ├─→ SEAL Key Server (Rust)
         │    └─→ Audio Checker (Python)
         │
         ├──→ Walrus (Storage)
         │    - Encrypted Audio Files
         │
         └──→ OpenAI APIs
              - Whisper (Transcription)
              - Moderation (Content Filter)
```

---

## Prerequisites

- [x] GitHub repository
- [x] Vercel account (Pro plan for Edge functions)
- [x] Railway account
- [x] Sui wallet with mainnet SUI
- [x] OpenAI API key
- [x] AcoustID API key (free at https://acoustid.org/api-key)
- [x] Domain: `projectsonar.xyz` (Name.com)

---

## Part 1: Railway Audio Checker Deployment

### 1.1 Deploy Python Service

1. Go to [Railway.app](https://railway.app)
2. **New Project** → **Deploy from GitHub repo**
3. Select `Angleito/Sonar` repository
4. **Settings:**
   - Root Directory: `railway-audio-checker`
   - Builder: Dockerfile (auto-detected)

### 1.2 Environment Variables

Add in Railway Dashboard → Variables:

```bash
ACOUSTID_API_KEY=<your-acoustid-key>
```

### 1.3 Get Deployment URL

After deployment completes:
- Railway Dashboard → Service → Settings → Networking
- Copy the generated URL: `https://your-audio-checker.up.railway.app`

### 1.4 Test Deployment

```bash
curl https://your-audio-checker.up.railway.app/health
# Expected: {"status":"healthy"}
```

---

## Part 2: SEAL Key Server (Already Deployed)

✅ **Status:** Already deployed and registered on mainnet

- **URL:** `https://seal.projectsonar.xyz`
- **Object ID:** `0xf5b747397c3724d0e283b90a73016c81239798cb276237f73b9485fbe72c6f02`
- **Network:** Sui Mainnet

**To verify:**
```bash
curl https://seal.projectsonar.xyz/health
```

---

## Part 3: Deploy Contracts to Sui Mainnet

### 3.1 Switch to Mainnet

```bash
sui client switch --env mainnet
sui client gas  # Check balance
```

### 3.2 Deploy Contracts

```bash
cd contracts
sui client publish --gas-budget 100000000
```

### 3.3 Save Contract IDs

From the transaction output, save:
- `NEXT_PUBLIC_PACKAGE_ID` - Main package ID
- `NEXT_PUBLIC_MARKETPLACE_ID` - Marketplace object ID
- Other object IDs as needed

---

## Part 4: Vercel Frontend Deployment

### 4.1 Connect Repository

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. **New Project** → Import from GitHub
3. Select `Angleito/Sonar` repository

### 4.2 Project Settings

**Framework:** Next.js
**Root Directory:** `frontend`
**Build Command:** `bun run build`
**Install Command:** `bun install`
**Output Directory:** `.next`

### 4.3 Environment Variables

Add all variables in Vercel Dashboard → Settings → Environment Variables:

**Sui Network (Mainnet):**
```bash
NEXT_PUBLIC_NETWORK=mainnet
NEXT_PUBLIC_RPC_URL=https://fullnode.mainnet.sui.io
NEXT_PUBLIC_GRAPHQL_URL=https://sui-mainnet.mystenlabs.com/graphql
```

**Blockchain Contracts (from Part 3):**
```bash
NEXT_PUBLIC_USE_BLOCKCHAIN=true
NEXT_PUBLIC_PACKAGE_ID=<from-contract-deployment>
NEXT_PUBLIC_MARKETPLACE_ID=<from-contract-deployment>
NEXT_PUBLIC_STATS_OBJECT_ID=0x0
NEXT_PUBLIC_REWARD_POOL_ID=0x0
```

**Storage & SEAL:**
```bash
NEXT_PUBLIC_SEAL_KEY_SERVERS=https://seal.projectsonar.xyz
NEXT_PUBLIC_WALRUS_PUBLISHER_URL=https://publisher.walrus-testnet.walrus.space
NEXT_PUBLIC_WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space
```

**AI & Verification:**
```bash
OPENAI_API_KEY=<your-openai-key>
AUDIO_CHECKER_URL=<from-part-1>
```

**FreeSound (Optional):**
```bash
NEXT_PUBLIC_USE_FREESOUND=true
FREESOUND_API_KEY=<your-key>
FREESOUND_API_TOKEN=<your-token>
FREESOUND_API_CLIENT_ID=<your-client-id>
```

**Backend (Disabled for now):**
```bash
NEXT_PUBLIC_BACKEND_URL=
```

### 4.4 Deploy

Click **Deploy** and wait ~2-3 minutes for build to complete.

---

## Part 5: Custom Domain Configuration

### 5.1 Add Domain in Vercel

1. Vercel Dashboard → Your Project → Settings → Domains
2. Add domain: `projectsonar.xyz`
3. Vercel will provide DNS records

### 5.2 Update DNS at Name.com

1. Login to [Name.com](https://www.name.com/)
2. Go to **My Domains** → `projectsonar.xyz` → **DNS Records**
3. Add records provided by Vercel (usually CNAME or A records)

### 5.3 SEAL Key Server Subdomain

Already configured:
- **Subdomain:** `seal.projectsonar.xyz`
- **Points to:** Railway (via CNAME)

---

## Part 6: Verification & Testing

### 6.1 Frontend Health Check

```bash
# Check deployment
curl https://projectsonar.xyz

# Check API routes
curl https://projectsonar.xyz/api/health
```

### 6.2 Test Wallet Connection

1. Visit `https://projectsonar.xyz`
2. Click **Connect Wallet**
3. Verify connection to Sui Mainnet

### 6.3 Test Audio Upload Flow

1. Go to **Upload Dataset**
2. Select audio file
3. Verify steps:
   - ✅ Upload to Walrus
   - ✅ Call Audio Checker (quality + copyright)
   - ✅ Call Whisper (transcription)
   - ✅ Content moderation
   - ✅ SEAL encryption
   - ✅ Blockchain submission

### 6.4 Test Content Filtering

**Should PASS:**
- Clean human conversation
- Baby sounds
- Natural speech recordings

**Should FAIL:**
- Copyrighted music
- Sexual/adult content
- Low quality audio (clipping, excessive silence)

---

## Part 7: Monitoring & Maintenance

### 7.1 Railway Services

**Audio Checker:**
- Logs: Railway Dashboard → Service → Logs
- Metrics: Check request counts, errors

**SEAL Key Server:**
- Health: `curl https://seal.projectsonar.xyz/health`
- Logs: Railway Dashboard

### 7.2 Vercel Analytics

- Dashboard → Your Project → Analytics
- Monitor:
  - Page views
  - API requests
  - Edge function execution time
  - Build times

### 7.3 Error Monitoring

Watch for:
- Blockchain RPC failures
- SEAL key server timeouts
- Audio checker errors
- OpenAI API rate limits
- Walrus upload failures

---

## Part 8: Cost Estimates

### Vercel Pro
- $20/month
- Includes Edge functions (5-minute timeout)
- Bandwidth & builds included

### Railway
- **SEAL Key Server:** ~$5-10/month (low usage)
- **Audio Checker:** ~$5-10/month (low usage)
- Scales automatically with traffic

### OpenAI API
- **Whisper:** ~$0.006/minute of audio
- **Moderation:** Free
- Estimate: ~$10-50/month depending on volume

### Sui Network
- **Gas fees:** ~0.01-0.05 SUI per transaction
- **Storage:** Minimal on-chain

### Total: ~$50-100/month

---

## Troubleshooting

### Issue: Frontend build fails

**Solution:**
- Check Vercel build logs
- Verify all environment variables are set
- Test build locally: `cd frontend && bun run build`

### Issue: Audio checker returns 500 error

**Solution:**
- Check Railway logs for Python errors
- Verify Chromaprint is installed (should be in Docker)
- Test locally with sample audio

### Issue: Wallet won't connect

**Solution:**
- Verify `NEXT_PUBLIC_NETWORK=mainnet`
- Check RPC URL is correct
- Try different wallet extension

### Issue: Upload fails

**Solution:**
- Check all services are healthy:
  ```bash
  curl https://projectsonar.xyz/api/health
  curl https://seal.projectsonar.xyz/health
  curl https://your-audio-checker.railway.app/health
  ```
- Verify OpenAI API key is valid
- Check Vercel function logs

---

## Security Checklist

- [x] SEAL master key stored in Railway secrets (not in git)
- [x] OpenAI API key in Vercel environment (not in git)
- [x] FreeSound tokens in Vercel environment (not in git)
- [x] No secrets committed to repository
- [x] CORS configured for known domains only
- [x] HTTPS enforced on all services
- [x] Rate limiting on API endpoints (if needed)

---

## Next Steps After Deployment

1. **Test thoroughly** with real users
2. **Monitor costs** in first month
3. **Deploy backend** (if needed for WAL features)
4. **Set up analytics** for user behavior
5. **Configure alerts** for service health
6. **Plan for scaling** based on traffic

---

## Support

- **Documentation:** See README.md files in each service directory
- **Issues:** https://github.com/Angleito/Sonar/issues
- **Railway Docs:** https://docs.railway.app
- **Vercel Docs:** https://vercel.com/docs

---

**Last Updated:** 2025-11-07
**Deployed By:** SONAR Team
