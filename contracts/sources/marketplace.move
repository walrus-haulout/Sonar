/// SONAR Marketplace Module
///
/// The core protocol contract managing audio submissions, quality rewards,
/// dynamic economics, and dataset purchases.
#[allow(unused_const)]
module sonar::marketplace {
    use std::string::{Self, String};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::event;
    use sui::object;
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sonar::sonar_token::SONAR_TOKEN;
    use sonar::economics::{Self, EconomicConfig};

    // ========== Error Codes ==========

    // Submission errors (2000-2999)
    const E_INVALID_BURN_FEE: u64 = 2001;
    const E_REWARD_POOL_DEPLETED: u64 = 2002;
    const E_ALREADY_FINALIZED: u64 = 2003;
    const E_INVALID_QUALITY_SCORE: u64 = 2004;
    const E_INSUFFICIENT_REWARDS: u64 = 2005;

    // Purchase errors (3000-3999)
    const E_NOT_LISTED: u64 = 3001;
    const E_NOT_APPROVED: u64 = 3002;
    const E_INVALID_PAYMENT: u64 = 3003;

    // Admin errors (5000-5999)
    const E_UNAUTHORIZED: u64 = 5001;
    const E_CIRCUIT_BREAKER_ACTIVE: u64 = 5002;
    const E_COOLDOWN_NOT_ELAPSED: u64 = 5003;
    const E_WITHDRAWAL_TOO_FREQUENT: u64 = 5004;
    const E_WITHDRAWAL_EXCEEDS_LIMIT: u64 = 5005;

    // Vesting errors (6000-6999)
    const E_NOTHING_TO_CLAIM: u64 = 6001;

    // ========== Core Structs ==========

    /// Admin capability for protocol governance
    public struct AdminCap has key, store {
        id: UID
    }

    /// Validator capability for submission finalization
    public struct ValidatorCap has key, store {
        id: UID
    }

    /// Circuit breaker for emergency protection
    public struct CircuitBreaker has store, copy, drop {
        enabled: bool,
        triggered_at_epoch: u64,
        trigger_reason: String,
        cooldown_epochs: u64  // Default 24 epochs (~24 hours)
    }

    /// Withdrawal limits for liquidity vault
    public struct WithdrawalLimits has store, copy, drop {
        max_per_epoch_bps: u64,        // 1000 = 10% max per epoch
        min_epochs_between: u64,       // 7 epochs minimum
        last_withdrawal_epoch: u64,
        total_withdrawn_this_epoch: u64
    }

    /// Vesting schedule for earned rewards
    public struct VestedBalance has store, copy, drop {
        total_amount: u64,              // Total tokens earned
        unlock_start_epoch: u64,        // Epoch when vesting started
        unlock_duration_epochs: u64,    // 90 epochs (~90 days)
        claimed_amount: u64             // Tokens already claimed
    }

    /// Audio submission with Walrus/Seal metadata
    public struct AudioSubmission has key, store {
        id: UID,
        uploader: address,

        // Walrus integration (metadata only, NO blob ID on-chain)
        seal_policy_id: String,         // Mysten Seal policy for decryption
        preview_blob_hash: vector<u8>,  // Optional: hash for verification

        // Submission details
        duration_seconds: u64,
        quality_score: u8,              // 0-100, set by validator
        status: u8,                     // 0=pending, 1=approved, 2=rejected

        // Vesting and earnings
        vested_balance: VestedBalance,
        unlocked_balance: u64,

        // Marketplace
        dataset_price: u64,
        listed_for_sale: bool,
        purchase_count: u64,

        submitted_at_epoch: u64
    }

    /// Main marketplace contract
    public struct QualityMarketplace has key {
        id: UID,

        // Token management
        treasury_cap: TreasuryCap<SONAR_TOKEN>,
        reward_pool: Balance<SONAR_TOKEN>,
        reward_pool_initial: u64,      // 70M for tracking
        liquidity_vault: Balance<SONAR_TOKEN>,

        // Statistics
        total_submissions: u64,
        total_purchases: u64,
        total_burned: u64,

        // Configuration
        treasury_address: address,
        admin_cap_id: ID,              // For verification
        economic_config: EconomicConfig,
        circuit_breaker: CircuitBreaker,
        withdrawal_limits: WithdrawalLimits
    }

    // ========== Events ==========

    public struct MarketplaceInitialized has copy, drop {
        marketplace_id: ID,
        initial_supply: u64,
        reward_pool_funded: u64,
        team_allocation: u64,
        team_wallet: address
    }

    public struct SubmissionCreated has copy, drop {
        submission_id: ID,
        uploader: address,
        seal_policy_id: String,        // ✅ Safe to emit for decryption requests
        duration_seconds: u64,
        burn_fee_paid: u64,
        submitted_at_epoch: u64
        // NO walrus_blob_id! (privacy)
    }

    public struct SubmissionFinalized has copy, drop {
        submission_id: ID,
        uploader: address,
        quality_score: u8,
        status: u8,                    // 1=approved, 2=rejected
        reward_amount: u64,
        vesting_start_epoch: u64,
        vesting_duration_epochs: u64
    }

    public struct DatasetPurchased has copy, drop {
        submission_id: ID,
        buyer: address,
        price: u64,

        // Dynamic economics (tier-based)
        burned: u64,
        burn_rate_bps: u64,
        liquidity_allocated: u64,
        liquidity_rate_bps: u64,
        uploader_paid: u64,
        uploader_rate_bps: u64,
        treasury_paid: u64,

        // Supply metrics
        circulating_supply: u64,
        economic_tier: u8,

        // Walrus integration
        seal_policy_id: String,        // ✅ For decryption request
        // NO walrus_blob_id!

        purchase_timestamp: u64
    }

    public struct VestedTokensClaimed has copy, drop {
        submission_id: ID,
        uploader: address,
        amount_claimed: u64,
        remaining_vested: u64
    }

    public struct CircuitBreakerActivated has copy, drop {
        reason: String,
        triggered_at_epoch: u64,
        cooldown_epochs: u64
    }

    public struct CircuitBreakerDeactivated has copy, drop {
        deactivated_at_epoch: u64
    }

    public struct LiquidityVaultWithdrawal has copy, drop {
        amount: u64,
        recipient: address,
        reason: String,
        remaining_balance: u64,
        withdrawn_by: address,
        timestamp_epoch: u64
    }

    // ========== Initialization ==========

    /// Initialize the marketplace
    /// Called after token module init to receive TreasuryCap
    fun init(_ctx: &mut TxContext) {
        // This will be called automatically after module publish
        // But the actual setup happens in initialize_marketplace
    }

    /// Initialize marketplace with token minting and distribution
    /// CRITICAL: Mints 100M SONAR and splits 70M/30M as specified
    public fun initialize_marketplace(
        mut treasury_cap: TreasuryCap<SONAR_TOKEN>,
        team_wallet: address,
        treasury_address: address,
        ctx: &mut TxContext
    ) {
        // Mint total supply: 100,000,000 SONAR = 100,000,000,000,000,000 base units
        let total_supply = 100_000_000_000_000_000;
        let mut total_coins = coin::mint(&mut treasury_cap, total_supply, ctx);

        // Split: 70M to reward pool (70,000,000,000,000,000 base units)
        let reward_pool_amount = 70_000_000_000_000_000;
        let reward_coins = coin::split(&mut total_coins, reward_pool_amount, ctx);
        let reward_pool = coin::into_balance(reward_coins);

        // Remaining 30M to team
        let team_coins = total_coins;  // Remaining 30M
        transfer::public_transfer(team_coins, team_wallet);

        // Create capabilities
        let admin_cap = AdminCap { id: object::new(ctx) };
        let validator_cap = ValidatorCap { id: object::new(ctx) };
        let admin_cap_id = object::id(&admin_cap);

        // Create marketplace
        let marketplace = QualityMarketplace {
            id: object::new(ctx),
            treasury_cap,
            reward_pool,
            reward_pool_initial: reward_pool_amount,
            liquidity_vault: balance::zero(),
            total_submissions: 0,
            total_purchases: 0,
            total_burned: 0,
            treasury_address,
            admin_cap_id,
            economic_config: economics::default_config(),
            circuit_breaker: CircuitBreaker {
                enabled: false,
                triggered_at_epoch: 0,
                trigger_reason: string::utf8(b""),
                cooldown_epochs: 24
            },
            withdrawal_limits: WithdrawalLimits {
                max_per_epoch_bps: 1000,  // 10%
                min_epochs_between: 7,
                last_withdrawal_epoch: 0,
                total_withdrawn_this_epoch: 0
            }
        };

        let marketplace_id = object::id(&marketplace);

        // Transfer capabilities to deployer (will be rotated later)
        transfer::transfer(admin_cap, tx_context::sender(ctx));
        transfer::transfer(validator_cap, tx_context::sender(ctx));

        // Share marketplace object
        transfer::share_object(marketplace);

        // Emit initialization event
        event::emit(MarketplaceInitialized {
            marketplace_id,
            initial_supply: total_supply,
            reward_pool_funded: reward_pool_amount,
            team_allocation: 30_000_000_000_000_000,
            team_wallet
        });
    }

    // ========== Helper Functions ==========

    /// Get circulating supply (total - escrowed)
    /// CRITICAL: Excludes reward pool and liquidity vault
    public fun get_circulating_supply(marketplace: &QualityMarketplace): u64 {
        let total = coin::total_supply(&marketplace.treasury_cap);
        let escrowed = balance::value(&marketplace.reward_pool)
                     + balance::value(&marketplace.liquidity_vault);

        if (total > escrowed) {
            total - escrowed
        } else {
            0  // Safety check
        }
    }

    /// Check if circuit breaker is active
    /// Auto-disables after cooldown period
    public fun is_circuit_breaker_active(
        breaker: &CircuitBreaker,
        ctx: &TxContext
    ): bool {
        if (!breaker.enabled) {
            return false
        };

        let current_epoch = tx_context::epoch(ctx);
        let auto_disable_epoch = breaker.triggered_at_epoch + breaker.cooldown_epochs;

        // Still within cooldown?
        current_epoch < auto_disable_epoch
    }

    // ========== Placeholder for Additional Functions ==========
    // To be implemented: submit_audio, finalize_submission, purchase_dataset,
    // vesting functions, admin operations, view functions
}
