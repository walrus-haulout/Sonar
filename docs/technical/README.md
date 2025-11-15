# Technical Overview

This section explains the technical systems that make SONAR work: encryption, storage, verification, and blockchain integration.

## Key Systems

### SEAL Encryption

SEAL (Simple Encryption At Launch) is Mysten Labs' decentralized encryption system. It ensures your audio is encrypted client-side with threshold cryptography.

**Key Properties**:
- Encryption happens in your browser
- Key is split into three shares
- Requires 2 of 3 servers to decrypt
- No single point of failure

See [SEAL Encryption Explained](seal-encryption.md) for details.

### Threshold Cryptography

Your encryption key uses Shamir Secret Sharing:
- Key split into 3 shares
- Any 2 shares can reconstruct the original key
- No single server can decrypt alone
- Prevents collusion attacks

See [Threshold Cryptography](threshold-cryptography.md) for technical details.

### Walrus Storage

Encrypted audio is stored on Walrus, a decentralized blob storage network:
- Multiple independent nodes store copies
- No single company controls your data
- Extremely cheap per-byte storage
- Permanent or time-limited availability

See [Walrus Storage](walrus-storage.md) for details.

### Verification Pipeline

Audio goes through 6 automated stages:

1. **Quality Check**: Duration, sample rate, volume, clipping
2. **Copyright Detection**: Fingerprinting against known works
3. **Transcription**: Speech-to-text conversion
4. **AI Analysis**: Safety, insights, quality scoring
5. **Aggregation**: Combined decision
6. **Finalization**: Results stored

See [Verification Pipeline](verification-pipeline.md) for detailed walkthrough.

### Sui Blockchain

Datasets are registered on the Sui blockchain:

**Records**:
- Dataset ownership
- Encrypted reference
- Metadata
- Purchase history
- Token rewards

**Smart Contracts**:
- Handle purchases
- Distribute revenue
- Manage token economics
- Enforce access policies

See [Blockchain Integration](blockchain.md) for details.

### Architecture

Complete system architecture showing how components work together:

See [Architecture](architecture.md) for full system diagram.

## The Complete Data Flow

### Upload Flow

1. You select audio files
2. Browser encrypts with SEAL (AES-256)
3. Key split into 3 shares
4. Shares encrypted with server public keys
5. Encrypted blob uploaded to Walrus
6. Encrypted blob sent to audio-verifier for analysis
7. Audio-verifier requests key shares using SessionKey
8. Audio temporarily decrypted for verification
9. Verification results stored
10. Dataset published to blockchain
11. Tokens awarded

### Purchase Flow

1. Buyer searches for dataset
2. Listens to preview (30 seconds, encrypted separately)
3. Clicks purchase
4. Signs blockchain transaction
5. Payment processed
6. Purchase recorded on blockchain
7. Buyer authorized to decrypt
8. Buyer requests key shares with SessionKey
9. Key shares decrypted and returned
10. Buyer reconstructs original key
11. Audio decrypted locally
12. Audio downloaded or streamed

## Key Concepts

### Client-Side Encryption

Your audio is encrypted in your browser before uploading. SONAR never sees unencrypted audio except during verification with your authorization.

### SessionKey

A one-time signed message from your wallet that proves ownership and authorizes decryption. Different from the encryption key itself.

### Envelope Encryption

Small sealed key (400 bytes) stored on-chain, large audio file (MB-GB) stored off-chain on Walrus.

### Threshold Reconstruction

Using Shamir Secret Sharing to reconstruct the original encryption key from 2 of 3 shares.

### Verification Authorization

Audio-verifier uses your SessionKey to request key shares from SEAL servers, proving it is authorized to decrypt your audio.

## Security Properties

### Confidentiality

- Encryption key is never transmitted
- Encrypted audio is useless without key shares
- SEAL servers require authorization (SessionKey) before releasing shares
- No single entity can decrypt alone

### Integrity

- AES-GCM provides authentication
- Tampering detected automatically
- Blockchain watermarks purchases

### Availability

- Multiple SEAL servers prevent single point of failure
- Walrus replicates data across multiple nodes
- Blockchain provides permanent ownership record

### Auditability

- Every transaction on blockchain
- Every purchase recorded
- Every verification logged
- Transparent tokenomics

## Guides in This Section

- **[Architecture](architecture.md)** - System components and data flow
- **[SEAL Encryption](seal-encryption.md)** - How SEAL works
- **[Threshold Cryptography](threshold-cryptography.md)** - The 2-of-3 system
- **[Verification Pipeline](verification-pipeline.md)** - 6-stage audio analysis
- **[Walrus Storage](walrus-storage.md)** - Decentralized blob storage
- **[Blockchain Integration](blockchain.md)** - Sui smart contracts

## Next Steps

Start with [Architecture](architecture.md) for a system overview, or jump to a specific technology.
