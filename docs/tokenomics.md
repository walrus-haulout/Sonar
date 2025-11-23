# SNR Tokenomics (Move Implementation)

_Last reviewed: 2025-11-11_

**Early alpha users are earning points now for a future SNR airdrop.** As you upload datasets and participate in the marketplace, you accumulate points that will be redeemable for SNR tokens when token trading launches.

All numbers below are mirrored directly from the on-chain contracts in `contracts/sources/marketplace.move` and `contracts/sources/economics.move`. Update this file whenever those constants change.

## Supply & Initial Distribution

- **Total supply**: `100_000_000_000_000_000` base units (100 M SNR with 9 decimals).
- `marketplace::initialize_marketplace` mints the full supply once and performs a two-way split:
  - **70 M SNR** → reward pool (`reward_pool_initial`, held inside the marketplace object).
  - **30 M SNR** → team wallet supplied during initialization.
- All subsequent balances are tracked via the `TreasuryCap<SONAR_TOKEN>` stored in the `QualityMarketplace` object.

## Circulating Supply

`marketplace::get_circulating_supply` deducts the reward pool and liquidity vault balances from the total supply:

```
circulating = coin::total_supply(&treasury_cap)
            - balance::value(&reward_pool)
            - balance::value(&liquidity_vault)
```

- At genesis, the reward pool contains 70 M and the liquidity vault is empty ⇒ circulating supply starts at 30 M.
- Liquidity allocations from purchases accumulate in `liquidity_vault`, reducing circulating supply until withdrawn with admin controls.

## Economic Tiers (`economics::default_config`)

Circulating supply thresholds and basis-point splits:

| Tier | Circulating Supply >          | Burn bps    | Liquidity bps | Treasury bps | Uploader bps\* |
| ---- | ----------------------------- | ----------- | ------------- | ------------ | -------------- |
| 1    | 50 000 000 000 000 000 (50 M) | 6000 (60 %) | 0             | 1000 (10 %)  | 3000 (30 %)    |
| 2    | 35 000 000 000 000 000 (35 M) | 4500 (45 %) | 1000 (10 %)   | 1000 (10 %)  | 3500 (35 %)    |
| 3    | 20 000 000 000 000 000 (20 M) | 3000 (30 %) | 1500 (15 %)   | 1000 (10 %)  | 4500 (45 %)    |
| 4    | ≤ 20 000 000 000 000 000      | 2000 (20 %) | 2000 (20 %)   | 1000 (10 %)  | 5000 (50 %)    |

\*Uploader share is calculated as `10_000 - burn - liquidity - treasury` inside `economics::uploader_bps`.

`economics::calculate_purchase_splits(price, circulating, config)` applies those splits to every purchase and returns `(burn_amount, liquidity_amount, uploader_amount, treasury_amount)`.

## Submission Economics

- **Upload fee**: A variable fee of **0.5 to 10 SUI per file** is charged based on quality score. Multi-file datasets receive a 10% bundle discount.
- **Quality rewards** (`economics::calculate_reward`):
  - `<30` → 0 (rejected)
  - `30–49` → `0.001 %` of circulating supply
  - `50–69` → `0.0025 %`
  - `70–89` → `0.004 %`
  - `≥90` → `0.005 %`
- Rewards vest over **90 epochs** via `VestedBalance`. `calculate_unlocked_amount` provides linear unlocks; `claim_vested_tokens` transfers unlocked rewards and releases the allocated portion of the reward pool.

## Events & Bookkeeping

- `SubmissionCreated` emits `walrus_blob_id`, `preview_blob_id`, and `seal_policy_id` to link Walrus assets with the on-chain submission.
- `DatasetPurchased` event payload:
  - Pricing: `price`, `burned`, `liquidity_allocated`, `uploader_paid`, `treasury_paid`
  - Rates: `burn_rate_bps`, `liquidity_rate_bps`, `uploader_rate_bps`
  - Supply context: `circulating_supply`, `economic_tier`
  - Access: `seal_policy_id`, `purchase_timestamp`
- Total burns, submissions, and purchases accumulate on the `QualityMarketplace` object for analytics (`get_marketplace_stats`).

## Error Codes (excerpt)

- **Submissions** (`2000` range): `E_INVALID_BURN_FEE`, `E_REWARD_POOL_DEPLETED`, `E_INVALID_QUALITY_SCORE`.
- **Purchases** (`3000` range): `E_NOT_APPROVED`, `E_NOT_LISTED`, `E_INVALID_PAYMENT`.
- **Admin / circuit breaker** (`5000` range): `E_UNAUTHORIZED`, `E_CIRCUIT_BREAKER_ACTIVE`, `E_WITHDRAWAL_TOO_FREQUENT`.

## Testing References

- `contracts/tests/economics_tests.move` validates tier boundaries and split math.
- `contracts/tests/integration_tests.move` exercises purchase + vesting flows end-to-end.
- The frontend relies on `usePurchaseVerification` to re-check ownership against emitted `DatasetPurchased` events; see `frontend/lib/sui/purchase-verification.ts`.
