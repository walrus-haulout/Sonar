# SEAL Encryption Explained

## Overview

This document explains how Mysten SEAL (Secure Encrypted Audio Library) threshold encryption works in the Sonar platform, from user upload to decryption.

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Encryption Flow](#encryption-flow)
3. [Key Server Architecture](#key-server-architecture)
4. [Decryption Flow](#decryption-flow)
5. [Security Model](#security-model)
6. [Technical Details](#technical-details)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User's Browser                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1. Upload Audio File                                    │   │
│  │  2. SEAL SDK Encrypts (client-side)                      │   │
│  │  3. Fetches public keys from 3 servers                   │   │
│  │  4. Creates 3 encrypted key shares (capsules)            │   │
│  └─────────────────────────────────────────────────────────┘   │
└───────────────────┬─────────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        ↓           ↓           ↓
┌──────────┐ ┌──────────┐ ┌──────────┐
│ Server 1 │ │ Server 2 │ │ Server 3 │
│ Railway  │ │ Railway  │ │ Railway  │
│ seal-1   │ │ seal-2   │ │ seal-3   │
└────┬─────┘ └────┬─────┘ └────┬─────┘
     │            │            │
     └────────────┼────────────┘
                  ↓
         ┌────────────────┐
         │  Sui Blockchain│
         │  - Policy IDs  │
         │  - Permissions │
         └────────┬───────┘
                  │
                  ↓
         ┌────────────────┐
         │     Walrus     │
         │  Encrypted     │
         │  Audio Blobs   │
         └────────────────┘
```

---

## Encryption Flow

### Step 1: User Uploads Audio File

```
Browser → File Input → audio_file.mp3 (plaintext)
```

The user selects an audio file through the web interface at `/test/sponsor-prototype`.

### Step 2: Client-Side Encryption Initialization

The SEAL SDK in the browser initializes with your key server configuration:

```typescript
const sealClient = new SealClient({
  keyServers: [
    process.env.NEXT_PUBLIC_SEAL_KEY_SERVER_1!,
    process.env.NEXT_PUBLIC_SEAL_KEY_SERVER_2!,
    process.env.NEXT_PUBLIC_SEAL_KEY_SERVER_3!
  ],
  threshold: 2 // Need 2 out of 3 servers to decrypt
});

// Configure the NEXT_PUBLIC_SEAL_KEY_SERVER_* variables via .env.local or your
// hosting provider's secret manager. Avoid hard-coding service identifiers.
```

### Step 3: Fetch Public Keys from Key Servers

The browser makes **parallel requests** to all 3 Railway key servers:

```
Browser → GET https://<key-server-1-domain>/v1/service?service_id=<KEY_SERVER_OBJECT_ID_1>
Browser → GET https://<key-server-2-domain>/v1/service?service_id=<KEY_SERVER_OBJECT_ID_2>
Browser → GET https://<key-server-3-domain>/v1/service?service_id=<KEY_SERVER_OBJECT_ID_3>
```

**Each key server responds with:**

```json
{
  "public_key": "<DERIVED_PUBLIC_KEY>",  // Populate from environment, unique per server
  "threshold": 2,
  "version": 1
}
```

### Step 4: Threshold Encryption (Client-Side)

The SEAL SDK performs the following steps **entirely in the browser**:

#### 4.1: Generate Symmetric Key

```
Generate Random 256-bit AES Key
```

#### 4.2: Encrypt Audio File

```
Original Audio (plaintext)
        ↓
AES-256-GCM Encryption
        ↓
Encrypted Audio Blob
```

#### 4.3: Split Symmetric Key (Shamir Secret Sharing)

The symmetric key is split into 3 shares using threshold cryptography:

```
Symmetric Key
      ↓
Shamir Secret Sharing (2-of-3 threshold)
      ↓
┌─────────┬─────────┬─────────┐
│ Share 1 │ Share 2 │ Share 3 │
└─────────┴─────────┴─────────┘
```

**Key Property**: Any 2 shares can reconstruct the original key, but 1 share alone reveals nothing.

#### 4.4: Encrypt Each Share (Capsule Creation)

Each share is encrypted with a different server's public key:

```
Share 1 + Server 1 Public Key → Capsule 1
Share 2 + Server 2 Public Key → Capsule 2
Share 3 + Server 3 Public Key → Capsule 3
```

**Result:**

```javascript
{
  encryptedData: Uint8Array,  // Encrypted audio blob
  capsules: [
    capsule1,  // Only Server 1 can decrypt this
    capsule2,  // Only Server 2 can decrypt this
    capsule3   // Only Server 3 can decrypt this
  ],
  policyId: "<POLICY_ID_PLACEHOLDER>"  // On-chain access control policy
}
```

### Step 5: Upload to Walrus

The encrypted blob is uploaded to Walrus decentralized storage:

```
Encrypted Audio Blob
        ↓
Walrus Publisher API
        ↓
Walrus Storage Network
        ↓
Blob ID: "abc123..."
```

### Step 6: Store Metadata On-Chain

Metadata is stored on the Sui blockchain:

```move
struct EncryptedFile {
    blob_id: String,              // Walrus blob ID
    policy_id: ID,                // SEAL policy object
    capsules: vector<vector<u8>>, // 3 encrypted key shares
    owner: address,               // File owner
    created_at: u64              // Timestamp
}
```

**What's stored where:**

| Data | Location | Encrypted? |
|------|----------|------------|
| Audio content | Walrus | ✅ Yes (AES-256-GCM) |
| Key shares (capsules) | Sui blockchain | ✅ Yes (BLS12-381) |
| Access policy | Sui blockchain | ❌ No (public) |
| Blob ID | Sui blockchain | ❌ No (public) |
| Metadata | Sui blockchain | ❌ No (public) |

---

## Key Server Architecture

Each of your 3 Railway deployments runs an identical Docker container with different configuration:

### Server Configuration

```
┌─────────────────────────────────────────────────────────┐
│  Railway Service 1                                      │
│  URL: https://seal-1.projectsonar.xyz                   │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Environment Variables:                            │  │
│  │                                                   │  │
│  │ MASTER_KEY=<MASTER_KEY_HEX>                      │  │
│  │   └─> Root secret (64 hex chars)                │  │
│  │   └─> Stored in environment/secret manager      │  │
│  │                                                   │  │
│  │ KEY_SERVER_OBJECT_ID=<KEY_SERVER_OBJECT_ID_1>    │  │
│  │   └─> On-chain registration                     │  │
│  │                                                   │  │
│  │ Derived Keys:                                     │  │
│  │ Private Key = derive(MASTER_KEY, index=0)       │  │
│  │ Public Key  = private_key.public_key()          │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Railway Service 2                                      │
│  URL: https://seal-2.projectsonar.xyz                   │
│  ┌───────────────────────────────────────────────────┐  │
│  │ MASTER_KEY=<MASTER_KEY_HEX_2>      ← Different!  │  │
│  │ KEY_SERVER_OBJECT_ID=<KEY_SERVER_OBJECT_ID_2> ← Different!      │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Railway Service 3                                      │
│  URL: https://seal-3.projectsonar.xyz                   │
│  ┌───────────────────────────────────────────────────┐  │
│  │ MASTER_KEY=<MASTER_KEY_HEX_3>      ← Different!  │  │
│  │ KEY_SERVER_OBJECT_ID=<KEY_SERVER_OBJECT_ID_3> ← Different!      │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Key Server Responsibilities

Each server:

1. **Exposes API endpoint**: `GET /v1/service?service_id={KEY_SERVER_OBJECT_ID}`
2. **Returns public key**: Used by clients for encryption
3. **Decrypts capsules**: When authorized users request decryption
4. **Enforces policies**: Checks on-chain permissions before releasing key shares

### Key Server Request Flow

```rust
// Simplified key server logic
async fn handle_decrypt_request(
    capsule: Capsule,
    policy_id: ObjectID,
    requester: Address
) -> Result<KeyShare> {
    // 1. Fetch policy from Sui blockchain
    let policy = sui_client.get_object(policy_id).await?;

    // 2. Check if requester is authorized
    if !policy.can_decrypt(requester) {
        return Err(Error::Unauthorized);
    }

    // 3. Decrypt capsule using private key
    let key_share = private_key.decrypt(capsule)?;

    // 4. Return key share
    Ok(key_share)
}
```

---

## Decryption Flow

When an authorized user wants to access the audio file:

### Step 1: Fetch Encrypted Blob

```
Browser → Walrus Aggregator API
       → GET blob/{blob_id}
       → Returns encrypted bytes
```

### Step 2: Fetch Metadata from Blockchain

```
Browser → Sui RPC
       → Get EncryptedFile object
       → Returns capsules + policy_id
```

### Step 3: Request Key Shares from Servers

The SEAL SDK contacts the key servers (needs 2 out of 3):

```
Browser → POST https://seal-1.projectsonar.xyz/v1/decrypt
       ├─ Request Body:
       │  ├─ capsule: capsule1
       │  ├─ policy_id: "<POLICY_ID_PLACEHOLDER>"
       │  └─ signature: signed_by_user_wallet
       └─ Response: key_share_1

Browser → POST https://seal-2.projectsonar.xyz/v1/decrypt
       ├─ Request Body: (same as above)
       └─ Response: key_share_2
```

**Each server:**
1. Verifies the user's signature
2. Reads the on-chain policy
3. Checks if user is authorized (owner or has permission)
4. Decrypts the capsule with its private key
5. Returns the key share

### Step 4: Reconstruct Symmetric Key

```
Key Share 1 + Key Share 2
         ↓
Shamir Secret Sharing Reconstruction
         ↓
Original Symmetric Key
```

### Step 5: Decrypt Audio Blob

```
Encrypted Blob + Symmetric Key
         ↓
AES-256-GCM Decryption
         ↓
Original Audio File
```

### Step 6: Play Audio

```
Decrypted Audio Bytes
         ↓
Browser Audio API
         ↓
User hears audio
```

---

## Security Model

### Threat Model

SEAL protects against:

✅ **Key server compromise**: A single compromised server can't decrypt files (need 2/3)
✅ **Storage provider compromise**: Walrus only has encrypted blobs
✅ **Network eavesdropping**: All communication is encrypted
✅ **Unauthorized access**: On-chain policies enforce access control
✅ **Replay attacks**: Signatures include nonces/timestamps

### Trust Assumptions

You must trust:

⚠️ **2 out of 3 key servers** to not collude
⚠️ **Sui blockchain** for policy enforcement
⚠️ **Browser environment** for client-side encryption
⚠️ **SEAL SDK implementation** for correct cryptography

### Key Security Properties

1. **Client-Side Encryption**: Plaintext never leaves the user's browser
2. **Zero-Knowledge Servers**: Servers can't decrypt without authorization
3. **Threshold Security**: Need to compromise 2/3 servers (not just 1)
4. **Decentralized Storage**: No single point of failure
5. **On-Chain Access Control**: Immutable, transparent permissions

### Why 3 Servers?

- **High Availability**: System works even if 1 server is down
- **Security**: No single point of compromise
- **Decentralization**: Can deploy to different providers/regions
- **Regulatory Compliance**: Can distribute across jurisdictions

---

## Technical Details

### Cryptographic Algorithms

| Component | Algorithm | Key Size |
|-----------|-----------|----------|
| Symmetric Encryption | AES-256-GCM | 256 bits |
| Asymmetric Encryption | BLS12-381 | 381 bits |
| Secret Sharing | Shamir (2-of-3) | 256 bits |
| Signatures | Ed25519 | 256 bits |

### Key Derivation

Each key server derives its keypair from a master seed:

```rust
// In your Dockerfile startup
let master_key = env::var("MASTER_KEY")?;
let derivation_index = 0;

let private_key = derive_bls_key(
    seed: master_key,
    path: format!("m/0/{}", derivation_index)
);

let public_key = private_key.public_key();
```

**Important**: Each server has a **different `MASTER_KEY`**, so they have completely independent keypairs.

### On-Chain Data Structures

**Key Server Registry** (on Sui):

```move
struct KeyServer has key {
    id: UID,
    name: String,              // "sonar-seal-1"
    url: String,               // "https://seal-1.projectsonar.xyz"
    public_key: vector<u8>,    // BLS12-381 public key
    version: u64               // Key version (for rotation)
}
```

**SEAL Policy** (on Sui):

```move
struct SealPolicy has key {
    id: UID,
    owner: address,
    authorized_users: vector<address>,
    expiration: Option<u64>,
    transfer_allowed: bool
}
```

### Performance Characteristics

| Operation | Time | Network Requests |
|-----------|------|------------------|
| Encryption | ~100ms | 3 (fetch public keys) |
| Upload | ~2s | 1 (Walrus upload) |
| Decryption | ~200ms | 2-3 (fetch key shares) |
| Key Share Request | ~50ms | 1 per server |

### Storage Costs

For a 1 MB audio file:

| Component | Size | Cost (Testnet) |
|-----------|------|----------------|
| Encrypted blob | ~1 MB | Free (Walrus testnet) |
| On-chain metadata | ~500 bytes | ~0.0001 SUI |
| 3 capsules | ~300 bytes each | ~0.0001 SUI |
| **Total** | **~1 MB** | **~0.0002 SUI** |

---

## Example: Complete Flow

Let's walk through a concrete example:

### Upload

1. Alice selects `song.mp3` (3.5 MB)
2. Browser generates random key: `K = <RANDOM_AES_KEY>`
3. Browser encrypts: `E = AES-256-GCM(song.mp3, K)`
4. Browser splits key: `K → [K1, K2, K3]` (Shamir 2-of-3)
5. Browser fetches public keys from 3 servers
6. Browser creates capsules:
   - `C1 = Encrypt(K1, PubKey1)`
   - `C2 = Encrypt(K2, PubKey2)`
   - `C3 = Encrypt(K3, PubKey3)`
7. Browser uploads `E` to Walrus → `blob_id = "xyz..."`
8. Browser creates on-chain object:
   ```
   EncryptedFile {
     blob_id: "xyz...",
     capsules: [C1, C2, C3],
     owner: Alice,
     policy: AllowOwner
   }
   ```

### Decryption (Alice)

1. Alice requests decryption
2. Browser fetches `E` from Walrus using `blob_id`
3. Browser fetches `[C1, C2, C3]` from Sui blockchain
4. Browser sends to Server 1:
   - `POST /v1/decrypt { capsule: C1, proof: Alice_signature }`
   - Server 1 checks policy: ✅ Alice is owner
   - Server 1 decrypts: `K1 = Decrypt(C1, PrivKey1)`
   - Server 1 returns `K1`
5. Browser sends to Server 2:
   - Same process → returns `K2`
6. Browser reconstructs: `K = Reconstruct(K1, K2)`
7. Browser decrypts: `song.mp3 = AES-256-GCM-Decrypt(E, K)`
8. Alice plays audio

### Decryption (Bob - Unauthorized)

1. Bob requests decryption
2. Browser fetches `E` from Walrus (succeeds - it's public)
3. Browser sends to Server 1:
   - `POST /v1/decrypt { capsule: C1, proof: Bob_signature }`
   - Server 1 checks policy: ❌ Bob is not owner
   - Server 1 returns `Error: Unauthorized`
4. Bob cannot decrypt ❌

---

## Deployment Checklist

When deploying your key servers, ensure:

- [ ] Each Railway service has a **unique `MASTER_KEY`**
- [ ] Each Railway service has a **unique `KEY_SERVER_OBJECT_ID`**
- [ ] Each Railway service has a **unique subdomain** (seal-1, seal-2, seal-3)
- [ ] All 3 servers are registered on-chain with correct URLs
- [ ] Frontend `.env.local` has all 3 object IDs
- [ ] CORS is enabled on all 3 servers
- [ ] HTTPS is configured (Railway handles this automatically)
- [ ] Health check endpoints return 200 OK

## Troubleshooting

### "Key server object ID is invalid"

**Cause**: The `KEY_SERVER_OBJECT_ID` in Railway doesn't match what the client is requesting.

**Fix**: Ensure each Railway service has the correct object ID from its on-chain registration.

### "Missing required header: Client-Sdk-Version"

**Cause**: Direct browser request without SEAL SDK headers.

**Fix**: Use the SEAL SDK to make requests (not `curl` or browser directly).

### "Failed to fetch"

**Cause**: CORS not configured or server not responding.

**Fix**: Check Railway logs, ensure CORS headers are present, verify subdomain DNS.

---

## Further Reading

- [Mysten SEAL Documentation](https://docs.sui.io/standards/seal)
- [Walrus Documentation](https://docs.walrus.site/)
- [Sui Move Documentation](https://docs.sui.io/standards/move)
- [Shamir Secret Sharing](https://en.wikipedia.org/wiki/Shamir%27s_Secret_Sharing)
- [BLS Signatures](https://en.wikipedia.org/wiki/BLS_digital_signature)

---

**Last Updated**: 2025-11-10
**Version**: 1.0
