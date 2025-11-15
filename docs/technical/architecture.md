# System Architecture

SONAR's architecture is built on decentralized technologies to ensure privacy, security, and transparency.

## Component Overview

### Frontend Layer

**Technology**: Next.js 14, TypeScript, React
**Location**: Web browser (user's computer)
**Responsibilities**:
- Audio file selection
- Metadata input
- Client-side encryption
- Wallet connection
- Real-time progress monitoring
- Leaderboard viewing
- Marketplace browsing

**Key Advantage**: Encryption and crypto operations happen on user's device

### Encryption Layer

**Technology**: Mysten SEAL, AES-256-GCM, Shamir Secret Sharing
**Location**: User's browser
**Responsibilities**:
- Generate encryption key
- Encrypt audio with AES-256
- Split key into 3 shares
- Create capsules (encrypted shares)
- Never transmit plaintext

### Storage Layer

**Technology**: Walrus (Mysten Labs decentralized blob storage)
**Responsibilities**:
- Store encrypted audio blobs
- Store encrypted preview blobs
- Permanent, decentralized availability
- Cost-effective per-byte storage
- No single point of failure

### Audio-Verifier Service

**Technology**: Python FastAPI
**Location**: Railway (Heroku-like platform)
**Responsibilities**:
- Accept encrypted blobs
- Request decryption keys from SEAL servers
- Decrypt audio temporarily
- Run 6-stage verification pipeline
- Store results in PostgreSQL
- Return verification status

**Important**: Runs verification on encrypted audio with user authorization

### SEAL Key Servers (3 instances)

**Technology**: Rust + BLS12-381 cryptography
**Location**: Three independent Railway instances
**Responsibilities**:
- Hold encryption key shares
- Enforce access control (blockchain policies)
- Decrypt capsules on authorization
- Return key shares only to authorized users
- Never decrypt audio themselves

**Threshold**: Need any 2 of 3 to reconstruct key

### Smart Contract Layer

**Technology**: Sui Move language
**Location**: Sui blockchain
**Responsibilities**:
- Record dataset ownership
- Store encrypted references
- Handle purchases
- Distribute revenue
- Track access policies
- Manage airdrop distribution

### Backend API

**Technology**: Fastify + Bun runtime
**Location**: Railway
**Responsibilities**:
- Wallet authentication
- User account management
- Marketplace search/browse
- Purchase processing
- Session management
- API proxy to services

### Database

**Technology**: PostgreSQL with pgvector extension
**Location**: Managed service (Railway, AWS RDS, or similar)
**Responsibilities**:
- User accounts
- Verification sessions
- Audio metadata
- Leaderboard snapshots
- Vector embeddings (for similarity search)
- Airdrop eligibility
- Achievement tracking

## Data Flow Diagram

### Upload Flow

```
User's Browser
    ↓
1. Select Audio Files
2. Input Metadata
3. User Signs Wallet Message (SessionKey)
    ↓
4. Encrypt Audio Client-Side
    - Generate AES-256 key
    - Encrypt audio blob
    - Split key into 3 shares
    - Create capsules
    ↓
5. Upload Encrypted Blob to Walrus
    - Returns blobId
    ↓
6. Send Verification Request
    - {blobId, metadata, capsules, SessionKey}
    ↓
Audio-Verifier Service
    ↓
7. Fetch Encrypted Blob from Walrus
8. Request Key Shares with SessionKey
    ↓
SEAL Servers (3 instances)
    ↓
9. Verify SessionKey Signature
10. Check Blockchain Access Policy
11. If Authorized: Decrypt capsule, return key share
    ↓
12. Audio-Verifier Reconstructs Key (2 of 3 shares)
13. Temporarily Decrypt Audio in RAM
    ↓
14. Run 6-Stage Verification Pipeline
    - Quality check
    - Copyright detection
    - Transcription
    - AI analysis
    - Aggregation
    - Finalization
    ↓
15. Discard Plaintext Audio
16. Store Results in PostgreSQL
    ↓
17. Return Verification Result to Frontend
    ↓
User's Browser
    ↓
18. Sign Publication Transaction
19. Submit to Sui Blockchain
    ↓
Sui Smart Contract
    ↓
20. Record ownership
21. Store encrypted references
22. Distribute initial tokens
    ↓
21. Dataset appears in marketplace
22. Leaderboard updates
```

### Purchase Flow

```
Buyer's Browser
    ↓
1. Browse/Search Marketplace
2. Listen to Preview (30 sec preview blob)
3. Click "Purchase"
4. Review Purchase Terms
    ↓
5. Sign Purchase Transaction (wallet signature)
    ↓
Sui Smart Contract
    ↓
6. Verify buyer has tokens
7. Deduct purchase price
8. Distribute revenue:
    - 60-80% to creator (vested)
    - 0-20% burned
    - 20-30% to operations
    ↓
9. Grant decryption authorization on blockchain
10. Record purchase (immutable)
    ↓
Buyer's Browser
    ↓
11. User Authorizes Decryption (creates SessionKey)
12. Request Key Shares with SessionKey
    ↓
SEAL Servers
    ↓
13. Verify SessionKey + Blockchain Authorization
14. Decrypt capsules
15. Return key shares
    ↓
Buyer's Browser
    ↓
16. Reconstruct AES Key (2 of 3 shares)
17. Fetch Encrypted Blob from Walrus
18. Decrypt in Browser
19. Play or Download Audio
```

## Technology Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 14, TypeScript | UI and UX |
| Encryption | SEAL, AES-256, Shamir | Client-side encryption |
| Storage | Walrus | Decentralized blob storage |
| Verification | Python FastAPI | Audio analysis pipeline |
| Key Management | Rust + BLS12-381 | Threshold cryptography |
| Blockchain | Sui Move | Smart contracts and records |
| Backend | Fastify + Bun | API and business logic |
| Database | PostgreSQL + pgvector | Data persistence and search |
| Hosting | Railway | Container deployment |

## Security Properties

### Confidentiality

- Encryption key never transmitted in plaintext
- SEAL servers cannot decrypt alone
- Audio-verifier requires SessionKey authorization
- Walrus stores only encrypted blobs

### Integrity

- AES-GCM provides authentication
- Blockchain immutably records ownership
- Tampering detected automatically

### Availability

- Multiple SEAL servers prevent single point of failure
- Walrus replicates data across multiple nodes
- Blockchain provides permanent record

### Non-Repudiation

- Transactions signed with private key
- Creator cannot deny publishing
- Buyer cannot deny purchasing
- Blockchain evidence is permanent

## Deployment Considerations

### Docker Containerization

- Each service in own container
- Reproducible builds with Nix
- Environment variable configuration
- Auto-scaling support

### Database Persistence

- External PostgreSQL (separate from containers)
- Migrations handled automatically on startup
- Backup and recovery strategies
- Connection pooling for performance

### Key Server Operation

- Three independent instances (redundancy)
- Load balancing across 2 of 3 for performance
- Graceful degradation if one server down
- Regular security audits

### Frontend Deployment

- Static Next.js build
- CDN for fast delivery
- Environment-based API endpoints
- Real-time WebSocket for progress updates

## Scaling Considerations

**Current**: Single PostgreSQL, 3 SEAL servers, 1 audio-verifier
**Growing**: 
- Database read replicas
- Horizontal scaling of audio-verifier
- Caching layer (Redis)
- Vector database separation

**Future**:
- Sharding for extreme scale
- IPFS integration for storage
- Decentralized verifier network
- Cross-chain bridging

## Next Steps

- Learn SEAL encryption: [SEAL Encryption](seal-encryption.md)
- Understand threshold cryptography: [Threshold Cryptography](threshold-cryptography.md)
- See verification details: [Verification Pipeline](verification-pipeline.md)
