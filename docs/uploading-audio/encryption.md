# Step 3: Encryption

This step encrypts your audio on your computer before uploading. Your plaintext audio never leaves your device.

## What Happens During Encryption

When you click "Encrypt and Upload":

1. **Key Generation**: Your browser generates a random 256-bit encryption key
2. **Encryption**: Audio is encrypted with AES-256-GCM encryption
3. **Key Splitting**: The key is split into three shares using Shamir Secret Sharing
4. **Capsule Creation**: Each share is encrypted with a different server's public key (called a capsule)
5. **Upload**: Encrypted audio and capsules are uploaded to Walrus storage

All of this happens in your browser. The plaintext audio never leaves your computer.

## The Technology Behind Encryption

### SEAL (Simple Encryption At Launch)

SONAR uses Mysten SEAL, a decentralized encryption system that ensures:

**No Single Point of Failure**: Your encryption key is split among three independent servers. No single server can decrypt your audio.

**Threshold Cryptography**: You only need 2 out of 3 servers to decrypt. If one server is down or compromised, you can still access your audio.

**Decentralized**: The three servers are run by different parties, preventing collusion.

**Identity-Based**: Encryption is tied to a policy on the Sui blockchain, not a company or person.

### AES-256-GCM

The actual encryption of your audio uses AES-256-GCM:

**AES-256**: Advanced Encryption Standard with 256-bit keys. This is the same encryption standard used by the US government and banks worldwide.

**GCM**: Galois/Counter Mode, which provides both encryption and authentication. This ensures no one can tamper with your encrypted audio.

### Shamir Secret Sharing

The encryption key is split using Shamir Secret Sharing:

**Three Shares**: The key is split into three mathematical shares
**2-of-3 Threshold**: Any two shares can reconstruct the original key
**Mathematical Property**: Each share alone is useless; you need at least 2
**No Remaining Share**: Even if one share is leaked, the other two cannot be reconstructed without it

This ensures no single server can decrypt your audio, but decryption is still possible if one server becomes unavailable.

## Privacy Guarantee

Here is exactly what happens to your plaintext audio:

**Step 1**: Audio is loaded in your browser (plaintext in your RAM)
**Step 2**: Browser encrypts it with AES-256 (still in your RAM, encrypted)
**Step 3**: Encrypted audio is uploaded to Walrus storage (encrypted in transit, encrypted at rest)
**Step 4**: Only during verification, Walrus sends encrypted blob to audio-verifier
**Step 5**: Audio-verifier decrypts temporarily (in RAM, for verification only)
**Step 6**: Plaintext decrypted audio is analyzed by AI algorithms
**Step 7**: Plaintext is discarded; analysis results are stored (not the audio)

At no point is your plaintext audio:
- Stored on a server
- Transmitted over the internet unencrypted
- Backed up or logged
- Seen by company employees
- Accessible without your authorization

## Encryption Progress

During encryption, you will see:

**Status Updates**:
- "Generating encryption key..."
- "Splitting key into three shares..."
- "Creating encrypted capsules..."
- "Compressing audio..."
- "Starting upload to Walrus..."
- "Verifying encrypted upload..."
- "Encryption complete!"

**Progress Bar**: Visual indicator of completion percentage

**Estimated Time**: Based on file size

## Performance Expectations

**Small Files (under 10 MB)**:
- Encryption: 2-5 seconds
- Upload: 5-15 seconds
- Total: Under 30 seconds

**Medium Files (10-100 MB)**:
- Encryption: 5-30 seconds
- Upload: 30 seconds to 2 minutes
- Total: 1-3 minutes

**Large Files (100-500 MB)**:
- Encryption: 30-60 seconds
- Upload: 2-5 minutes
- Total: 3-7 minutes

Times depend on your computer's CPU and internet speed.

## Security During Encryption

### Your Browser Never Shares Keys

- Encryption keys are generated and used only in your browser
- Keys are never sent to any server
- Keys are never logged or stored
- Your browser does not retain them after encryption

### Encryption Keys Are Strong

- 256-bit keys: 2^256 possible combinations
- Would take longer than the age of the universe to brute force
- Meets military and financial standards

### Encryption is Open Source

- SEAL encryption is open source and audited
- Cryptographic algorithms are well-established and peer-reviewed
- You can review the code if desired

## If Encryption Fails

Possible reasons for encryption failures:

**Browser Out of Memory**: Close other applications and try again
**Slow Internet**: Ensure you have a stable connection
**Browser Crash**: Browser may crash on very large files; try splitting into smaller uploads
**File Corrupted**: Try a different audio file first to test
**Unsupported Format**: Ensure file is MP3, WAV, M4A, OGG, or FLAC

Recovery steps:
1. Refresh the page
2. Try again with one smaller file
3. Try a different browser
4. Contact support if issue persists

## Can Anyone See My Audio?

### During Upload

Only encrypted data in transit. No one can see plaintext.

### In Storage

Only encrypted blob stored on Walrus. Encrypted blob is publicly readable but useless without the decryption key.

### Encrypted Blob

The encrypted blob is:
- Too large to bruteforce decrypt
- Authenticated (tampering detected)
- Useless without the key shares
- Accessible by ID, but only decryptable with authorization

### During Verification

Audio is decrypted temporarily, with your authorization, for AI analysis only. Results are stored; plaintext is discarded.

### After Publishing

Your encrypted blob remains encrypted unless someone:
- Purchases the dataset and requests decryption
- Is explicitly authorized by you
- Provides correct SessionKey to key servers

## Session Keys

### What Is a Session Key?

A session key is a one-time signed message from your wallet that proves you are the owner of the audio.

### How It Works

1. You sign a message with your wallet (no transaction, just a signature)
2. This signature becomes your session key
3. You can use it to authorize decryption
4. It expires after a period of time
5. You can create a new one anytime

### Privacy Impact

- Session keys prove ownership without revealing the actual encryption key
- Different session keys can be created for different purposes
- Old session keys can be revoked
- Each session key is unique to your wallet

## Moving Forward

Encryption is automatic and happens in the background. You do not need to do anything special. Just click "Encrypt and Upload" and the process begins.

Once encryption is complete, your audio is safe and secure. It will proceed automatically to the verification step.

For more information:
- [Encryption Technology Details](../technical/seal-encryption.md)
- [Threshold Cryptography Explained](../technical/threshold-cryptography.md)
- [Privacy Guarantees](../getting-started/concepts.md)

## Next Step

Once encryption completes, proceed to [Step 4: Verification](verification.md).
