# Sponsored Transaction Pattern for Walrus Uploads

## Overview

This document describes the dual-signature sponsored transaction pattern for parallel Walrus uploads using ephemeral sub-wallets.

## Architecture

### Goal
Upload large files (≥1GB) to Walrus in parallel using multiple ephemeral sub-wallets, where:
- **Sub-wallets** are throwaway (RAM-only, no persistence)
- **User's wallet** sponsors gas payments
- **No sweeping** needed (wallets discarded after upload)

### Dual-Signature Sponsor Flow

```
1. Create ephemeral sub-wallet (Ed25519Keypair.generate())
2. Build Walrus transaction with sub-wallet as sender
3. Sub-wallet signs transaction payload
4. User wallet signs same transaction as sponsor
5. Execute with dual signatures: [senderSig, sponsorSig]
6. Gas is paid by user wallet (sponsor)
7. Discard sub-wallet (no cleanup needed)
```

### Validated Pattern (from SDK Research)

From `/Users/angel/Projects/dreamlit-walrus-sdk/sub-wallet-sdk/src/sub-wallet-walrus/core/SponsoredTransactions.ts`:

```typescript
// Build transaction
const tx = new TransactionBlock();
tx.setSender(subWalletAddress);
tx.setGasBudget(gasBudget);
// ... add moveCall for Walrus blob storage

// Step 1: Sub-wallet (sender) signs
const senderSig = await tx.sign({
  client: suiClient,
  signer: subWalletKeypair
});

// Step 2: Sponsor signs
const sponsorSig = await tx.sign({
  client: suiClient,
  signer: sponsorKeypair
});

// Step 3: Execute with both signatures
const result = await suiClient.executeTransactionBlock({
  transactionBlock: senderSig.bytes,
  signature: [senderSig.signature, sponsorSig.signature],
  options: { showEffects: true },
});
```

## Current Limitation

**The Sui SDK's `TransactionBlock.sign()` method always attempts to resolve gas coins from the signer's address during the build phase.**

This works when:
- ✅ Server-side: Both sub-wallet AND sponsor keypairs are available
- ✅ Single signer: Sender has sufficient balance for gas

This FAILS when:
- ❌ Client-side sponsored: Sub-wallet has zero balance, sponsor is browser wallet extension
- ❌ dapp-kit integration: Only signing functions available, not keypair

### Error Encountered

```
Error: No valid gas coins found for the transaction.
    at _TransactionBlock.prepareGasPayment_fn (TransactionBlock.ts:601:10)
```

This error occurs because:
1. `tx.sign()` calls `prepare()` internally
2. `prepare()` tries to resolve gas payment
3. Gas resolution queries coins from sender's address
4. Ephemeral sub-wallet has zero balance
5. No coins found → error

## Workaround Strategies

### 1. Blockberry HTTP API (< 1GB files) ✅ IMPLEMENTED

```typescript
const formData = new FormData();
formData.append('file', encryptedBlob);

const response = await fetch('/api/edge/walrus/upload', {
  method: 'POST',
  body: formData,
});
```

**Pros:**
- Works today
- Simple integration
- User wallet signs via edge function

**Cons:**
- Not parallel
- Size limited by API
- Centralized upload endpoint

### 2. Server-Side Sub-Wallet Orchestration (≥ 1GB files) 🚧 PLANNED

Server API endpoint that:
1. Receives encrypted blob chunks
2. Creates ephemeral sub-wallets server-side
3. Has sponsor keypair or signing delegation
4. Executes dual-signature sponsored transactions
5. Returns blob IDs

**Pros:**
- Fully parallel
- No browser limitations
- Works with any file size

**Cons:**
- Requires server infrastructure
- Sponsor key management
- More complex architecture

### 3. Wait for Sui SDK Support 🔮 FUTURE

Track these issues:
- Sui SDK: Client-side sponsored transaction support
- dapp-kit: Expose more granular signing APIs

## Implementation

### Current Implementation (Blockberry)

```typescript
import { useWalrusParallelUpload } from '@/hooks/useWalrusParallelUpload';

function UploadComponent() {
  const { uploadBlob, progress } = useWalrusParallelUpload();

  const handleUpload = async (encryptedBlob: Blob) => {
    // Auto-selects Blockberry for < 1GB files
    const result = await uploadBlob(
      encryptedBlob,
      seal_policy_id,
      {
        ...metadata,
        originalMimeType: audioFile.type,
      },
      {
        mimeType: audioFile.type,
        previewBlob,
        previewMimeType: previewBlob?.type,
      }
    );

    console.log('Blob uploaded:', result.blobId);
  };
}
```

### Future Implementation (Sponsored Parallel)

```typescript
import { useSubWalletOrchestrator } from '@/hooks/useSubWalletOrchestrator';

function LargeFileUpload() {
  const orchestrator = useSubWalletOrchestrator();

  const handleLargeUpload = async (encryptedBlob: Blob) => {
    // Calculate optimal wallet count
    const walletCount = orchestrator.calculateWalletCount(encryptedBlob.size);

    // Create ephemeral wallets
    const wallets = orchestrator.createWallets(walletCount);

    // TODO: Implement server-side or SDK-supported sponsor flow
    // This is where dual-signature transactions would execute

    // Cleanup
    orchestrator.discardAllWallets();
  };
}
```

## Walrus Transaction API

### Mainnet Package IDs

From research of `@mysten/walrus` SDK:

```typescript
const WALRUS_SYSTEM_OBJECT = process.env.NEXT_PUBLIC_WALRUS_SYSTEM_OBJECT!;

const WALRUS_PACKAGE_ID = process.env.NEXT_PUBLIC_WALRUS_PACKAGE_ID!;

const WAL_TOKEN_PACKAGE = process.env.NEXT_PUBLIC_WAL_TOKEN_PACKAGE!;
```

### Register Blob Transaction

```typescript
// Using @mysten/walrus SDK (server-side)
import { WalrusClient } from '@mysten/walrus';

const walrusClient = new WalrusClient({
  network: 'mainnet',
  suiClient,
});

// Encode blob (generates blobId, rootHash, metadata)
const { blobId, rootHash, metadata, sliversByNode } =
  await walrusClient.encodeBlob(blob);

// Register blob on-chain
const tx = walrusClient.registerBlobTransaction({
  size: blob.length,
  epochs: 50,
  blobId,
  rootHash,
  deletable: true,
  owner: myAddress,
});

// Execute (this is where sponsor pattern would apply)
const result = await tx.execute({ signer });
```

### Required Arguments

- `size` (u64): Blob size in bytes
- `epochs` (u32): Storage duration (default: 50, max: 200)
- `blobId` (u256): Computed blob identifier
- `rootHash` (bytes): Root hash from erasure coding
- `deletable` (bool): Whether blob can be deleted later
- `owner` (address): Optional owner address
- `attributes` (map): Optional metadata key-value pairs

## Testing

### Prototype Page

Location: `/app/test/sponsor-prototype/page.tsx`

The prototype demonstrates:
1. ✅ Ephemeral wallet creation
2. ✅ Gas coin fetching from sponsor
3. ✅ Transaction building with moveCall
4. ❌ Dual-signature execution (blocked by SDK limitation)

Run: http://localhost:3000/test/sponsor-prototype

## References

### SDK Source Code Research

- `SubWalletOrchestrator.ts` - High-level wallet management
- `SponsoredTransactions.ts` - Dual-signature sponsor flow
- `MemoryStorageAdapter.ts` - RAM-only wallet storage
- `@mysten/walrus` - Walrus transaction builders

### Key Findings

1. **Dual-signature pattern validated** through SDK code analysis
2. **Transaction structure documented** from Walrus SDK
3. **Browser limitation identified** in TransactionBlock.sign()
4. **Workaround strategies defined** for production use

## Next Steps

1. ✅ Use Blockberry API for files < 1GB
2. 🚧 Implement server-side orchestration for ≥ 1GB files
3. 🔮 Monitor Sui SDK for client-side sponsor support
4. 📝 Update implementation when SDK limitations resolved

## Conclusion

The sponsored transaction pattern is **architecturally sound** and **validated through research**, but currently **blocked by SDK limitations** for client-side browser execution.

The recommended path forward:
- **Short-term**: Use Blockberry API (working today)
- **Medium-term**: Implement server-side sub-wallet orchestration
- **Long-term**: Adopt SDK support when available

This ensures users can upload today while maintaining the architecture for future parallel uploads.
