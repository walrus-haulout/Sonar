# Dual-Signature Sponsor Flow Prototype

## Purpose

This prototype validates that the dual-signature sponsor transaction flow works with:
1. **Ephemeral sub-wallets** (MemoryStorageAdapter - RAM only)
2. **dapp-kit wallet** as sponsor (pays gas)
3. **Trivial transaction** (coin split) to prove the pattern

## How to Test

1. **Start dev server** (if not running):
   ```bash
   bun run dev
   ```

2. **Navigate to**: http://localhost:3001/test/sponsor-prototype

3. **Connect your wallet** using the wallet button in the nav

4. **Click "Run Test"** - This will:
   - Create an ephemeral sub-wallet in RAM
   - Build a trivial transaction (split 1 MIST from gas coin)
   - Sub-wallet signs as sender
   - Your wallet signs as sponsor (you'll see a signature request)
   - Execute with dual signatures
   - Display the result

## What Success Looks Like

If the test succeeds, you should see:
- ✅ All log steps complete without errors
- Transaction digest displayed
- Status: "success"
- Gas costs shown (paid by your wallet as sponsor)

## Key Code Pattern Validated

```typescript
// 1. Create ephemeral sub-wallet
const storageAdapter = new MemoryStorageAdapter();
const orchestrator = new SubWalletOrchestrator({
  rpcUrl: 'https://fullnode.mainnet.sui.io',
  storage: storageAdapter,
  concurrency: 1,
});
const subWallet = await orchestrator.createWallet();
const subWalletKeypair = await storageAdapter.loadKeypair(subWallet.id);

// 2. Build transaction with sub-wallet as sender
const tx = new Transaction();
tx.setSender(subWallet.address);
// ... add transaction logic ...

// 3. Sub-wallet signs
const subWalletSig = await tx.sign({
  client: suiClient,
  signer: subWalletKeypair,
});

// 4. User wallet signs as sponsor
const sponsorResult = await signTransaction({ transaction: tx });

// 5. Execute with dual signatures
const result = await suiClient.executeTransactionBlock({
  transactionBlock: subWalletSig.bytes,
  signature: [subWalletSig.signature, sponsorResult.signature],
  options: { showEffects: true },
});

// 6. Report effects back to wallet
sponsorResult.reportTransactionEffects(result.rawEffects);
```

## Next Steps

Once this trivial transaction succeeds:
1. Extend to Walrus `registerBlob` transaction
2. Test with actual blob registration
3. Document the complete pattern
4. Build production `useSubWalletOrchestrator` hook

## Troubleshooting

**"Please connect your wallet first"**
- Click the wallet button in the navigation
- Connect your Sui wallet (Sui Wallet, Suiet, etc.)

**Signature request doesn't appear**
- Check your wallet extension
- Make sure it's unlocked
- Try refreshing the page

**Transaction fails**
- Check console logs for detailed error
- Ensure you have enough SUI for gas (sponsor pays ~0.01 SUI)
- Verify you're on the correct network (mainnet)
