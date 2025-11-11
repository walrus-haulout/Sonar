# SONAR Protocol

**Sound Oracle Network for Audio Rewards**

> Amplifying Data Value

---

## Overview

SONAR is a decentralized marketplace for high-quality conversational audio data, designed to incentivize creators while ensuring data privacy and quality. Built on the Sui blockchain with Walrus storage and Mysten Seal encryption, SONAR introduces an innovative **absolute-threshold dynamic burn model** that ensures sustainable token economics throughout the protocol's lifecycle.

**Hackathon:** Walrus Haulout 2025
**Track:** Data Economy/Marketplaces

---

## The Problem

Current audio data marketplaces suffer from:
- Poor quality control (no validation)
- Privacy concerns (centralized storage)
- Unsustainable tokenomics (fixed burn rates lead to death spirals)
- Misaligned incentives (platforms capture most value)

---

## The Solution

SONAR addresses these challenges through:

### 1. Quality-First Approach
- LLM-validated conversational quality scoring
- Tiered rewards based on contribution quality (0.001% - 0.005% of supply)
- Submission fees prevent spam (0.001% burn)

### 2. Privacy by Design
- Client-side encryption with Mysten Seal before upload
- Decentralized storage on Walrus
- Only authorized purchasers receive decryption shares
- Zero blob ID exposure in public events

### 3. Adaptive Economics
Unlike traditional fixed-rate burns that eventually kill protocols, SONAR uses **absolute circulating supply thresholds** to automatically adjust economic parameters:

| Phase | Circulating Supply | Burn Rate | Liquidity | Uploader Share |
|-------|-------------------|-----------|-----------|----------------|
| Early | >50M SONAR | 60% | 0% | 30% |
| Growth | 35-50M SONAR | 45% | 10% | 35% |
| Mature | 20-35M SONAR | 30% | 15% | 45% |
| Conservation | <20M SONAR | 20% | 20% | 50% |

As the token becomes scarcer, the system automatically:
- Reduces deflationary pressure
- Increases liquidity provisioning
- Rewards creators more generously
- Maintains long-term sustainability

### 4. Secondary Market Protection
- Automated liquidity vault accumulation
- Circuit breaker for catastrophic events
- Treasury buyback framework
- Dynamic uploader bonuses during downturns

---

## How It Works

### For Creators
1. Record conversational audio
2. Upload via SONAR interface (client-side Seal encryption)
3. Pay small burn fee (0.001% of circulating supply)
4. Receive LLM quality score
5. Earn tokens based on quality (vested over 90 days)
6. List datasets for sale to unlock vesting early

### For Data Buyers
1. Browse marketplace with quality filters
2. Purchase datasets with SONAR tokens
3. Receive authenticated decryption access
4. Download encrypted data from Walrus
5. Decrypt with Seal shares

### For the Ecosystem
- Automatic burns create deflationary pressure (60% → 20%)
- Liquidity vault accumulates for AMM deployment (0% → 20%)
- Treasury receives consistent funding (10%)
- Tier transitions happen automatically based on circulating supply

---

## Key Innovations

### Absolute Threshold Model
Traditional percentage-based burn models cause u64 overflow in Move:
```move
// ❌ OVERFLOW RISK
let ratio = (current_supply * 1_000_000) / initial_supply;
// 10^17 * 10^6 = 10^23 > u64::MAX
```

SONAR uses absolute token counts:
```move
// ✅ NO OVERFLOW - Direct comparison
if (circulating_supply > 50_000_000_000_000_000) {
    // Tier 1: 60% burn
}
```

### Dynamic Circulating Supply
Correctly calculates circulating supply by excluding escrowed tokens:
```move
Circulating = Total Supply - Reward Pool - Liquidity Vault
```

This ensures:
- Accurate tier assignments
- Fair reward calculations
- No distortion from locked tokens

### Privacy-First Architecture
- Audio encrypted client-side with Seal before leaving user's device
- Blob IDs never exposed in public blockchain events
- Decryption shares only provided to verified purchasers
- End-to-end privacy guarantees

---

## Technology Stack

### Blockchain
- **Sui Network:** Fast, low-cost L1 blockchain
- **Move Language:** Type-safe smart contract development
- **Capability-Based Security:** AdminCap, ValidatorCap pattern

### Storage & Privacy
- **Walrus:** Decentralized blob storage network
- **Mysten Seal:** Threshold encryption for access control
- **Client-Side Encryption:** Data never exposed unencrypted

### Validation
- **LLM Quality Scoring:** Automated conversational quality assessment
- **Resilient Pipeline:** Retry logic for validation failures
- **On-Chain Verification:** ValidatorCap signatures

### Frontend (Planned)
- React with Sui Wallet Adapter
- Real-time economic metrics display
- Audio recording and encryption UI
- Marketplace browser with quality filters

---

## Token Economics

### SONAR Token
- **Type:** Sui Fungible Token (Coin<SONAR>)
- **Total Supply:** 100,000,000 SONAR (fixed, non-mintable)
- **Decimals:** 9

### Initial Distribution
- **Reward Pool:** 70,000,000 SONAR (70%)
- **Team Allocation:** 30,000,000 SONAR (30%, vested 24 months)

### Utility
- Submission fees (burned)
- Quality rewards (vested 90 days)
- Dataset purchases (dynamic splits)
- Future governance (post-AdminCap burn)

### Deflationary Mechanics
- Submission burns (0.001% per submission)
- Purchase burns (60% → 20% adaptive)
- Fixed supply (no minting)
- Vesting delays circulation

---

## Project Status

This project implements a **full-stack decentralized audio marketplace** with real-time waveform visualization, wallet authentication, and encrypted streaming.

### Completed ✅
- ✅ Monorepo setup with Bun workspaces
- ✅ Shared type definitions package (@sonar/shared)
- ✅ Complete backend API (Fastify + Prisma + PostgreSQL)
- ✅ Authentication system (challenge-response with nonce, JWT, signature verification)
- ✅ Wallet integration (@mysten/dapp-kit)
- ✅ Waveform visualization (Wavesurfer.js v7 with peak extraction)
- ✅ Audio streaming (Walrus integration with HTTP Range support)
- ✅ Purchase flow and blockchain event queries
- ✅ Frontend application (Next.js 14 with TypeScript)
- ✅ Error handling, logging, and observability
- ✅ Comprehensive documentation (API, deployment, E2E testing, Walrus upload)
- ✅ Unit tests (22 passing tests for nonce management + 20 BigInt utility tests)
- ✅ Docker configuration for deployment
- ✅ Railway deployment setup
- ✅ **BigInt-safe token utilities** (precision-safe calculations for all amounts)

### In Progress 🔄
- 🔄 E2E testing (see E2E_TESTING.md for checklist)
- 🔄 Production deployment and monitoring

### Planned ⏳
- ⏳ User profiles and purchase history
- ⏳ Playlist functionality
- ⏳ Social features (sharing, ratings)
- ⏳ Creator analytics dashboard
- ⏳ Redis-backed session management
- ⏳ Advanced search and filtering

---

## Repository Structure

```
sonar/
├── README.md                          # This file
├── package.json                       # Root workspace configuration
├── frontend/                          # Next.js frontend application
│   ├── app/                          # Pages and layouts
│   ├── components/                   # React components
│   ├── hooks/                        # Custom hooks (useAuth, useWaveform)
│   ├── lib/                          # Utilities (API client, toast)
│   ├── types/                        # TypeScript definitions
│   └── public/                       # Static assets
├── backend/                           # Bun + Fastify backend
│   ├── src/
│   │   ├── routes/                  # API endpoints
│   │   ├── lib/auth/                # Authentication logic
│   │   ├── lib/sui/                 # Blockchain queries
│   │   ├── lib/walrus/              # Storage integration
│   │   ├── middleware/              # HTTP middleware
│   │   └── index.ts                 # Server entry point
│   ├── prisma/                      # Database schema
│   ├── Dockerfile                   # Container image
│   └── scripts/                     # Setup scripts
├── packages/
│   └── shared/                      # Shared types (@sonar/shared)
│       ├── src/
│       │   ├── types/               # Type definitions
│       │   └── auth/                # Auth utilities
│       └── package.json
├── contracts/                        # Sui Move smart contracts
├── scripts/                          # Root utility scripts
├── docs/                             # Documentation
│   ├── API.md                       # API reference
│   ├── DEPLOYMENT.md                # Deployment guide
│   ├── E2E_TESTING.md               # Testing checklist
│   └── IMPLEMENTATION_SUMMARY.md    # Architecture overview
└── .dockerignore                     # Docker build optimization
```

---

## Development

### Prerequisites
- [Bun](https://bun.sh) (v1.0+)
- Node.js (v18+) - for npm packages
- PostgreSQL (v14+) - for database
- Sui Wallet extension (or similar wallet)

### Quick Start
```bash
# Install dependencies
bun install

# Setup backend environment
bun run backend/scripts/setup.ts

# Create and seed database
bun prisma migrate deploy
bun prisma db seed

# Terminal 1: Start backend (required for authentication and downloads)
cd backend && bun run dev

# Terminal 2: Start frontend
cd frontend && bun run dev

# Frontend available at http://localhost:3000
# Backend available at http://localhost:3001
```

### Troubleshooting Backend Connection

**Problem:** "Backend server is not available at http://localhost:3001. Make sure the backend is running."

**Solution:** The backend must be running for authentication and download features to work. Follow these steps:

1. **Check if backend is running:**
   ```bash
   curl -s http://localhost:3001/health && echo "Backend is running"
   ```

2. **Start the backend in a separate terminal:**
   ```bash
   cd backend && bun run dev
   ```

3. **Verify backend health:**
   ```bash
   curl http://localhost:3001/health
   # Should return 200 OK
   ```

4. **Check environment variables:**
   - Frontend must have `NEXT_PUBLIC_BACKEND_URL=http://localhost:3001` (default)
   - Backend must have database configured and running

**Note:** The marketplace can be browsed without the backend, but authentication and downloads require backend connectivity.

### Running Tests
```bash
# Run backend unit tests (nonce management)
bun test backend/src/lib/auth/__tests__/

# For E2E testing, see docs/E2E_TESTING.md
```

### Deployment
```bash
# Docker build
docker build -t sonar-backend:latest -f backend/Dockerfile .

# Railway deployment
railway login
railway init
railway add postgres
railway up

# See docs/DEPLOYMENT.md for detailed instructions
```

---

## Contributing

This project is being developed for the Walrus Haulout 2025 Hackathon. After the hackathon, we welcome contributions!

### Areas of Interest
- Smart contract development (Move)
- Frontend development (React/TypeScript)
- Audio processing and validation
- Cryptography and security
- Token economics modeling

---

## Security

### Current Status
- Design phase - no deployed contracts yet
- Security considerations documented in specification
- Audit planned before mainnet deployment

### Reporting Issues
For security concerns, please email: security@sonar.xyz (placeholder)

---

## License

TBD (To be determined post-hackathon)

---

## Contact & Community

- **Discord:** discord.gg/sonar (placeholder)
- **Twitter:** @sonarprotocol (placeholder)
- **Email:** team@sonar.xyz (placeholder)
- **Documentation:** docs.sonar.xyz (placeholder)

---

## Acknowledgments

Built for **Walrus Haulout 2025 Hackathon**

Special thanks to:
- Mysten Labs for Sui, Walrus, and Seal
- The Sui developer community
- Hackathon organizers and mentors

---

**SONAR Protocol - Amplifying Data Value**

*Decentralized. Private. Quality-First.*
