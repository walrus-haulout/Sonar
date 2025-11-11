# Browser-Side Audio Decryption with Mysten Seal

## Overview

SONAR now supports browser-side decryption of purchased audio datasets using Mysten Seal. This provides enhanced privacy and security by decrypting encrypted audio directly in the user's browser without relying on server-side streaming.

## Architecture

### Data Flow

```
1. User purchases dataset on Sui blockchain
2. Encrypted audio stored on Walrus (distributed storage)
3. Dataset metadata stored in PostgreSQL (includes blob_id, seal_policy_id, backup_key)
4. User requests playback → Backend verifies purchase → Returns AccessGrant
5. Frontend fetches encrypted blob from Walrus
6. Frontend requests key shares from Seal key servers (2-of-3 threshold)
7. Frontend decrypts audio in browser using Seal
8. Decrypted audio played via Web Audio API (WaveSurfer.js)
```

### Key Components

#### Backend (`backend/src/services/dataset-service.ts`)

**`createDatasetAccessGrant`** (lines 95-169)
- Verifies user owns dataset (via purchase or on-chain ownership)
- Returns `AccessGrant` containing:
  - `seal_policy_id`: Seal identity for decryption
  - `blob_id`: Walrus blob ID for encrypted audio
  - `backup_key`: Base64-encoded emergency recovery key
  - `download_url`: Fallback server streaming endpoint
  - `expires_at`: Grant expiration timestamp

**`storeSealMetadata`** (lines 252-324)
- Called during upload to store encryption metadata
- Links Seal policy ID, blob ID, and backup key to dataset
- Supports multi-file datasets via `file_index`

#### Frontend Hooks

**`useSealDecryption`** (`frontend/hooks/useSeal.ts`, lines 315-445)
- Manages Seal session lifecycle (create, restore, validate)
- Handles encrypted blob fetching from Walrus
- Orchestrates decryption with progress tracking
- Provides error categorization (policy denial, key server issues, network errors)

**Key Methods:**
- `decryptAudio(options)`: Main decryption entry point
  - Fetches encrypted blob from Walrus aggregator
  - Requests key shares from Seal servers (configured via `NEXT_PUBLIC_SEAL_KEY_SERVERS`)
  - Decrypts data using session key and policy module
  - Returns `Uint8Array` of decrypted audio
- `createSession(options)`: Creates Seal session with wallet signature
- `resetProgress()`: Clears progress state

**Progress Tracking:**
```typescript
interface DecryptionProgress {
  stage: 'fetching' | 'decrypting' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  error?: string;
}
```

#### AudioPlayer Component (`frontend/components/dataset/AudioPlayer.tsx`)

**Playback Modes:**
- `preview`: Public preview (30s teaser, unencrypted)
- `stream`: Legacy server-side streaming (requires JWT)
- `decrypt`: Browser-side decryption (new default for purchased content)

**Decryption Flow (lines 89-225):**
1. User clicks "Unlock Full Audio" button
2. Check authentication and Seal session
3. Request `AccessGrant` from backend (verifies purchase)
4. Call `useSealDecryption.decryptAudio()` with blob ID and policy ID
5. Create Blob URL from decrypted `Uint8Array`
6. Pass Blob URL to `useWaveform` hook for playback
7. Display progress UI with stage-specific messages
8. Show "Download Decrypted Audio" button

**Download Flow (lines 86-106):**
1. User clicks "Download Decrypted Audio" button (visible after successful decryption)
2. Create download link using existing Blob URL
3. Trigger browser download with filename: `{datasetId}-{title}.mp3`
4. Log download event for telemetry

**Error Handling:**
- Policy denial → "Access policy verification failed"
- Key server unavailable → "Key server unavailable"
- Walrus fetch failure → "Failed to fetch encrypted audio"
- Session creation failure → "Wallet signature required"

**Security Measures:**
- Decrypted blobs stay in memory (Blob URL)
- Blob URLs revoked on component unmount
- No decrypted data transmitted over network
- Backup keys never exposed in UI

## Configuration

### Environment Variables

**Frontend (`.env.local`):**
```bash
# Comma-separated Seal key server object IDs (required for decryption)
NEXT_PUBLIC_SEAL_KEY_SERVERS=0xabc...,0xdef...,0x123...

# Walrus aggregator endpoint (required for blob fetching)
NEXT_PUBLIC_WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space

# Sui package ID (required for policy verification)
NEXT_PUBLIC_PACKAGE_ID=0x...
```

**Backend (`.env`):**
```bash
# Walrus aggregator for server-side streaming (fallback mode)
WALRUS_AGGREGATOR_URL=https://aggregator.walrus-testnet.walrus.space
```

### Key Server Setup

Seal requires a 2-of-3 threshold configuration:
- Minimum 2 key servers must be available
- Threshold set automatically in `useSeal.ts` (line 65)
- Key servers specified as Sui object IDs

**Example:**
```typescript
const keyServers = [
  { objectId: '0xabc...', weight: 1 },
  { objectId: '0xdef...', weight: 1 },
  { objectId: '0x123...', weight: 1 },
];
```

## Testing

### Manual Test Plan

**Prerequisites:**
1. Wallet connected (Mysten Wallet, Sui Wallet, or Ethos)
2. Dataset purchased on testnet/mainnet
3. Key servers configured and operational

**Happy Path:**
1. Navigate to dataset detail page (`/dataset/[id]`)
2. Verify "Preview Mode" displays (preview audio plays)
3. Click "Unlock Full Audio (Browser Decryption)" button
4. Sign wallet message to create Seal session
5. Observe progress:
   - "Creating secure session..." (5%)
   - "Verifying purchase and requesting access..." (10%)
   - "Fetching encrypted audio from Walrus..." (30%)
   - "Requesting key shares from Seal servers..." (40%)
   - "Decrypting audio... 50-90%" (incremental)
   - "Audio decrypted successfully" (100%)
6. Verify audio player switches to "Browser Decryption" mode
7. Play decrypted audio (full length, no 30s limit)
8. Click "Download Decrypted Audio" button
9. Verify browser downloads `.mp3` file to local device
10. Check browser console for telemetry logs (`[AudioPlayer]` prefix)

**Error Scenarios:**
- **No purchase**: Expect "Purchase required to access full audio"
- **Key server down**: Expect "Key server unavailable"
- **Invalid policy**: Expect "Access policy verification failed"
- **User rejects signature**: Expect "Wallet signature required to create secure session"
- **Network timeout**: Expect "Failed to fetch encrypted audio"

### Automated Tests (Recommended)

**Unit Tests:**
```typescript
// Test useSealDecryption hook
describe('useSealDecryption', () => {
  it('should fetch and decrypt audio blob', async () => {
    const { decryptAudio } = renderHook(() => useSealDecryption());
    const result = await decryptAudio({
      blobId: 'test-blob-id',
      sealPolicyId: '0xpolicy123',
    });
    expect(result).toBeInstanceOf(Uint8Array);
  });
});
```

**Integration Tests (Cypress/Playwright):**
```typescript
it('should decrypt and play purchased audio', () => {
  cy.visit('/dataset/test-dataset-id');
  cy.contains('Unlock Full Audio').click();
  cy.get('[data-testid=wallet-signature]').click(); // Mock wallet
  cy.contains('Browser Decryption', { timeout: 30000 });
  cy.get('[data-testid=audio-player]').should('be.visible');
});
```

## Telemetry & Monitoring

### Console Logging

All decryption stages logged with `[AudioPlayer]` prefix:
```typescript
console.log('[AudioPlayer] Starting browser decryption flow', { datasetId, hasSession });
console.log('[AudioPlayer] Creating new Seal session');
console.log('[AudioPlayer] Access grant received', { blobId, policyId });
console.log('[AudioPlayer] Starting decryption', { policyModule, policyId });
console.log('[AudioPlayer] Decryption progress:', progress);
console.log('[AudioPlayer] Decryption successful', { decryptedSize, decryptedSizeMB });
console.error('[AudioPlayer] Decryption flow failed:', error);
```

### Metrics to Monitor (Future)

- Decryption success rate
- Average decryption time (by file size)
- Key server availability per request
- Session creation success rate
- Policy denial rate
- User abandonment during decryption

### Error Categorization

- `policy`: On-chain policy denied access
- `key_share`: Key server unavailable or unresponsive
- `walrus`: Blob fetch failed
- `session`: Wallet signature rejected
- `network`: General network timeout

## Security Considerations

### Zero-Knowledge Decryption

1. **Session Key**: Created with wallet signature, stored in IndexedDB
2. **Key Shares**: Retrieved from 2-of-3 Seal key servers (threshold cryptography)
3. **Policy Verification**: On-chain policy module (`purchase_policy`) verifies purchase
4. **No Server Decryption**: Encrypted blob bytes never touch backend servers
5. **Memory-Only**: Decrypted audio exists only as in-memory Blob URL

### Backup Key Handling

- **Storage**: Base64-encoded in PostgreSQL (TODO: encrypt with user's public key)
- **Transmission**: Included in `AccessGrant` API response (requires JWT)
- **Usage**: Emergency recovery if Seal key servers unavailable
- **Security Risk**: Currently stored unencrypted (acceptable for testnet, fix for mainnet)

**Recommended Fix:**
```typescript
// During upload: Encrypt backup key with user's public key
const encryptedBackupKey = await encryptWithUserPublicKey(backupKey, userAddress);
// During access: Decrypt backup key with user's private key (via wallet)
const backupKey = await decryptWithUserPrivateKey(encryptedBackupKey);
```

### CORS Configuration

Walrus aggregator must allow cross-origin requests:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD
```

### CSP Headers

Next.js must permit Walrus and key server connections:
```typescript
// next.config.js
headers: [
  {
    key: 'Content-Security-Policy',
    value: "connect-src 'self' https://aggregator.walrus-testnet.walrus.space https://*.sui.io"
  }
]
```

## Rollback Plan

If browser decryption fails in production:

1. **Immediate**: User can still use preview mode (30s)
2. **Fallback**: Revert to server streaming by setting `mode='stream'` in AudioPlayer
3. **Backend Toggle**: Add feature flag to `AccessGrant` response:
   ```typescript
   {
     browser_decryption_enabled: boolean;
   }
   ```
4. **Monitor**: Check error rate via console logs or telemetry
5. **Hotfix**: Disable "Unlock Full Audio" button via environment variable

## Features

### Browser Playback ✅
- Decrypt and play audio directly in browser
- Progress tracking with 5 decryption stages
- WaveSurfer.js integration for waveform visualization
- Support for preview mode (30s) and full decryption

### Download to Device ✅
- Download decrypted audio to user's device
- Automatic filename generation (`{datasetId}-{title}.mp3`)
- One-click download from Blob URL
- No re-decryption required (uses cached Blob)

### Security ✅
- Zero-knowledge decryption (2-of-3 Seal key servers)
- Session persistence via IndexedDB
- Policy verification before decryption
- Memory-safe Blob URL cleanup

## Future Enhancements

- [ ] Encrypt backup keys with user's public key (client-side)
- [ ] Add telemetry SDK (PostHog, Mixpanel) for production metrics
- [ ] Implement backup key recovery flow (if key servers down)
- [ ] Cache decrypted blobs in IndexedDB for offline playback
- [ ] Support progressive decryption (stream while decrypting)
- [ ] Add Seal session refresh (before 10-min expiry)
- [ ] Multi-file dataset support (decrypt bundle, select track)
- [ ] Waveform preview during decryption (use partial data)
- [ ] Download progress indicator (for very large files)
- [ ] Format selection (MP3, WAV, FLAC)

## Troubleshooting

### "Seal client disabled: missing key server configuration"

**Cause**: `NEXT_PUBLIC_SEAL_KEY_SERVERS` not set
**Fix**: Add comma-separated key server object IDs to `.env.local`

### "No active session. Please create a session first."

**Cause**: User hasn't signed wallet message yet
**Fix**: Call `createSession()` automatically before decryption (already implemented)

### "Failed to fetch blob from Walrus"

**Cause**: Blob ID invalid or Walrus aggregator down
**Fix**: Verify blob exists via `curl https://aggregator.../v1/{blobId}`

### "Access policy verification failed"

**Cause**: User doesn't own dataset or on-chain policy denies
**Fix**: Verify purchase via `verifyUserOwnsDataset()` or check Sui Explorer

### "Key server unavailable"

**Cause**: One or more key servers unresponsive
**Fix**: Check key server health, ensure 2-of-3 threshold met

## References

- [Mysten Seal Documentation](https://docs.sui.io/concepts/cryptography/seal)
- [Walrus Storage Protocol](https://docs.walrus.xyz/)
- [WaveSurfer.js Audio Library](https://wavesurfer-js.org/)
- [Sui TypeScript SDK](https://sdk.mystenlabs.com/)
