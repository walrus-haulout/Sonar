# Walrus Integration Reference

_Last reviewed: 2025-11-11_

SONAR stores encrypted audio on Walrus and uses Mysten Seal for access control. This document describes how the Move contracts, edge functions, and frontend coordinate.

## On-Chain Metadata
The `AudioSubmission` struct keeps Walrus and Seal identifiers on-chain so the frontend never needs a private metadata database:
```move
struct AudioSubmission has key, store {
    id: UID,
    uploader: address,
    walrus_blob_id: String,
    preview_blob_id: String,
    seal_policy_id: String,
    preview_blob_hash: Option<vector<u8>>,
    duration_seconds: u64,
    quality_score: u8,
    status: u8,
    vested_balance: VestedBalance,
    unlocked_balance: u64,
    dataset_price: u64,
    listed_for_sale: bool,
    purchase_count: u64,
    submitted_at_epoch: u64,
}
```
Relevant events:
- `SubmissionCreated` emits `walrus_blob_id`, `preview_blob_id`, `seal_policy_id` for indexers.
- `DatasetPurchased` emits `seal_policy_id` (no blob ID) alongside economic breakdowns.

Dataset bundles (`DatasetSubmission`) mirror the same fields for multiple files.

## Upload Pipeline (Client → Edge → Walrus)
1. **Encrypt**: The upload wizard uses Mysten Seal (`packages/seal`, `useWalrusUpload`) to encrypt audio in-browser and capture the `seal_policy_id`.
2. **Walrus upload**: `/api/edge/walrus/upload` streams the encrypted blob to the Walrus publisher (`PUT /v1/blobs`).
3. **Preview upload**: `/api/edge/walrus/preview` handles short public clips (≤10 MB) via the same publisher endpoint.
4. **Metadata capture**: The wizard surfaces both blob IDs so the user can embed them when calling `marketplace::submit_audio` or finalising verification sessions.

**MVP Limitation**: Files are limited to 1GB. Blockberry HTTP API handles publisher registration automatically; the browser only needs to call `marketplace::submit_blobs` for fee collection and event emission.

## Purchase & Access Flow
1. **Purchase**: `usePurchase` calls `marketplace::purchase_dataset`. The contract burns/allocates tokens and mints a receipt via `purchase_policy::mint_receipt` for Seal policy checks.
2. **Ownership check**: `usePurchaseVerification` queries `DatasetPurchased` events using the configured package ID, avoiding any backend state.
3. **Blob fetch**: `useSealDecryption` downloads the encrypted blob through `/api/edge/walrus/proxy/[blobId]`, which simply streams data from the aggregator (`GET /v1/<blobId>`).
4. **Seal shares**: Configured key servers (2-of-3 by default) issue shares that the browser combines to decrypt the blob. No Walrus blob identifiers are concealed once the user owns the dataset—the security boundary is the Seal policy.

## Configuration Summary
- **Contract IDs**: `NEXT_PUBLIC_PACKAGE_ID`, `NEXT_PUBLIC_MARKETPLACE_ID` (with fallbacks in `contracts/deployments/*.json`).
- **Walrus endpoints**: `NEXT_PUBLIC_WALRUS_PUBLISHER_URL`, `NEXT_PUBLIC_WALRUS_AGGREGATOR_URL`.
- **Blockberry** (optional): `BLOCKBERRY_API_KEY` (server-side only) to authenticate with Blockberry's Walrus proxy.
- **Seal key servers**: `NEXT_PUBLIC_SEAL_KEY_SERVERS` (comma-separated object IDs). Threshold defaults to `min(2, len)`.
- **Feature flag**: `NEXT_PUBLIC_USE_BLOCKCHAIN=false` switches to seed data, bypassing Walrus entirely (development only).

## Security Notes
- Blob IDs are stored on-chain because data remains encrypted; access is enforced cryptographically by Mysten Seal policies.
- Backup key handling is still TODO in the upload wizard (`components/upload/*`); keys are currently in-memory only.
- The liquidity vault and reward pool live on-chain; purchases never expose private blob IDs beyond what the smart contract already publishes.

## Troubleshooting
- **Blob not found**: verify the Walrus aggregator URL, confirm upload succeeded (script appends to `walrus-uploads.txt`).
- **Seal policy denied**: ensure the wallet performing decryption matches the buyer address from the purchase event.
- **Preview playback fails**: check that the preview blob was uploaded and referenced by the dataset (hover card hits `/api/edge/walrus/preview`).

## Related Code
- **Edge routes**: `frontend/app/api/edge/walrus/*` (Blockberry HTTP uploads)
- **Frontend hooks**: `useWalrusParallelUpload` (MVP: Blockberry-only strategy)
- **Decryption hooks**: `useSealDecryption`
- **Move modules**: `marketplace.move`, `storage_lease.move`, `purchase_policy.move`
- **Upload script**: `scripts/upload-to-walrus.sh`
- **Strategy selection**: `getUploadStrategy()` (always returns 'blockberry' in MVP)
