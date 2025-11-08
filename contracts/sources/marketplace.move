/// SONAR Marketplace Module
///
/// The core protocol contract managing audio submissions, quality rewards,
/// dynamic economics, and dataset purchases.
#[allow(unused_const, duplicate_alias, lint(self_transfer, public_entry))]
module sonar::marketplace {
    use std::option::Option;
    use std::string::{Self, String};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::event;
    use sui::object;
    use sui::sui::SUI;
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::dynamic_field;
    use sui::vec_set::{Self, VecSet};
    use sonar::sonar_token::SONAR_TOKEN;
    use sonar::economics::{Self, EconomicConfig};
    use sonar::purchase_policy;

    // ========== Error Codes ==========

    // Submission errors (2000-2999)
    const E_INVALID_BURN_FEE: u64 = 2001;
    const E_REWARD_POOL_DEPLETED: u64 = 2002;
    const E_ALREADY_FINALIZED: u64 = 2003;
    const E_INVALID_QUALITY_SCORE: u64 = 2004;
    const E_INSUFFICIENT_REWARDS: u64 = 2005;
    const E_INVALID_PARAMETER: u64 = 2006;

    // Purchase errors (3000-3999)
    const E_NOT_LISTED: u64 = 3001;
    const E_NOT_APPROVED: u64 = 3002;
    const E_INVALID_PAYMENT: u64 = 3003;

    // Kiosk errors (4000-4999)
    const E_INSUFFICIENT_KIOSK_RESERVE: u64 = 4001;
    const E_INVALID_KIOSK_PRICE: u64 = 4002;
    const E_INVALID_SUI_CUT_PERCENTAGE: u64 = 4003;

    // Admin errors (5000-5999)
    const E_UNAUTHORIZED: u64 = 5001;
    const E_CIRCUIT_BREAKER_ACTIVE: u64 = 5002;
    const E_COOLDOWN_NOT_ELAPSED: u64 = 5003;
    const E_WITHDRAWAL_TOO_FREQUENT: u64 = 5004;
    const E_WITHDRAWAL_EXCEEDS_LIMIT: u64 = 5005;

    // Vesting errors (6000-6999)
    const E_NOTHING_TO_CLAIM: u64 = 6001;

    // Voting errors (7000-7999)
    const E_ALREADY_VOTED: u64 = 7001;
    const E_VOTE_NOT_FOUND: u64 = 7002;
    const E_CANNOT_VOTE_OWN_SUBMISSION: u64 = 7003;

    const SUI_BASE_UNITS: u64 = 1_000_000_000;
    const GRADUATION_THRESHOLD: u64 = 10;  // Net votes needed for auto-graduation

    // ========== Core Structs ==========

    /// Key for voting stats dynamic field
    public struct VotingStatsKey has copy, drop, store {}

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

    /// Kiosk liquidity reserve for user SONAR/SUI trading and dataset purchases
    public struct KioskDesk has store {
        sonar_reserve: Balance<SONAR_TOKEN>,    // SONAR available for sell_sonar
        sui_reserve: Balance<SUI>,              // SUI collected from marketplace auto-cut
        base_sonar_price: u64,                  // Base price in SUI per SONAR (tier-dependent)
        price_override: Option<u64>,            // Admin override: if set, use instead of base_price
        current_tier: u8,                       // Cached tier (1-4) for pricing
        sui_cut_percentage: u64,                // % of purchase SUI routed to kiosk (e.g., 5 = 5%)
        total_sonar_sold: u64,                  // Track cumulative SONAR sold via kiosk
        total_datasets_purchased: u64           // Track purchases via kiosk
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

    /// Voting statistics for community curation
    public struct VotingStats has store, copy, drop {
        upvotes: u64,
        downvotes: u64,
        voters: VecSet<address>  // Prevents double voting
    }

    /// Audio submission with Walrus/Seal metadata
    public struct AudioSubmission has key, store {
        id: UID,
        uploader: address,

        // Walrus integration
        walrus_blob_id: String,              // Walrus blob ID for encrypted audio retrieval
        seal_policy_id: String,              // Mysten Seal policy for decryption
        preview_blob_hash: Option<vector<u8>>,  // Optional: hash for verification

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

    /// Audio file entry within a dataset
    public struct AudioFileEntry has store, copy, drop {
        blob_id: String,
        preview_blob_id: String,
        seal_policy_id: String,
        duration: u64
    }

    /// Dataset submission containing multiple audio files
    public struct DatasetSubmission has key, store {
        id: UID,
        uploader: address,

        // Multiple audio files
        files: vector<AudioFileEntry>,
        total_duration: u64,
        file_count: u64,

        // Economics
        bundle_discount_bps: u64,      // Basis points (2000 = 20% discount)
        quality_score: u8,              // Average quality across all files
        status: u8,                     // 0=pending, 1=approved, 2=rejected

        // Vesting and earnings (for entire dataset)
        vested_balance: VestedBalance,
        unlocked_balance: u64,

        // Marketplace
        dataset_price: u64,             // Price for bundle
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
        reward_pool_allocated: u64,    // Total rewards reserved for vesting (not yet claimed)
        liquidity_vault: Balance<SONAR_TOKEN>,

        // Kiosk liquidity system
        kiosk: KioskDesk,

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
        walrus_blob_id: String,        // ✅ For backend authenticated delivery
        duration_seconds: u64,
        burn_fee_paid: u64,
        submitted_at_epoch: u64
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

    public struct DatasetSubmissionCreated has copy, drop {
        submission_id: ID,
        uploader: address,
        file_count: u64,
        total_duration: u64,
        bundle_discount_bps: u64,
        burn_fee_paid: u64,
        submitted_at_epoch: u64
    }

    #[allow(unused_field)]
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

    #[allow(unused_field)]
    public struct CircuitBreakerActivated has copy, drop {
        reason: String,
        triggered_at_epoch: u64,
        cooldown_epochs: u64
    }

    #[allow(unused_field)]
    public struct CircuitBreakerDeactivated has copy, drop {
        deactivated_at_epoch: u64
    }

    #[allow(unused_field)]
    public struct LiquidityVaultWithdrawal has copy, drop {
        amount: u64,
        recipient: address,
        reason: String,
        remaining_balance: u64,
        withdrawn_by: address,
        timestamp_epoch: u64
    }

    public struct KioskFunded has copy, drop {
        amount: u64
    }

    public struct SonarSold has copy, drop {
        buyer: address,
        sui_amount: u64,
        sonar_amount: u64
    }

    public struct DatasetPurchasedViaKiosk has copy, drop {
        buyer: address,
        dataset_id: ID,
        sonar_amount: u64
    }

    public struct KioskPriceUpdated has copy, drop {
        base_price: u64,
        override_price: Option<u64>,
        tier: u8
    }

    public struct KioskSuiCutUpdated has copy, drop {
        percentage: u64
    }

    public struct VoteCast has copy, drop {
        submission_id: ID,
        voter: address,
        is_upvote: bool,
        new_upvotes: u64,
        new_downvotes: u64,
        net_score: u64,
        timestamp: u64
    }

    public struct VoteRemoved has copy, drop {
        submission_id: ID,
        voter: address,
        was_upvote: bool,
        new_upvotes: u64,
        new_downvotes: u64,
        net_score: u64
    }

    public struct SubmissionGraduated has copy, drop {
        submission_id: ID,
        uploader: address,
        net_score: u64,
        timestamp: u64
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
            reward_pool_allocated: 0,  // No rewards allocated yet
            liquidity_vault: balance::zero(),
            kiosk: KioskDesk {
                sonar_reserve: balance::zero(),
                sui_reserve: balance::zero(),
                base_sonar_price: 1_000_000_000,  // 1 SUI per SONAR initially (1e9 base units)
                price_override: std::option::none(),
                current_tier: 1,
                sui_cut_percentage: 5,  // 5% of purchases to kiosk SUI reserve
                total_sonar_sold: 0,
                total_datasets_purchased: 0
            },
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

    /// Update kiosk tier and base price based on circulating supply
    /// CRITICAL: Only updates base_price if no admin override is active
    fun update_kiosk_tier_and_price(marketplace: &mut QualityMarketplace) {
        let circulating = get_circulating_supply(marketplace);
        let new_tier = economics::get_tier(circulating, &marketplace.economic_config);

        // Only update base_price if no admin override is set
        if (option::is_none(&marketplace.kiosk.price_override)) {
            // Tier-based pricing: Higher tier (lower supply) = higher price to encourage buying
            // Tier 1 (>50M): 1.0 SUI per SONAR (high supply, standard price)
            // Tier 2 (35-50M): 0.8 SUI per SONAR (moderate supply, discount)
            // Tier 3 (20-35M): 0.6 SUI per SONAR (low supply, bigger discount)
            // Tier 4 (<20M): 0.4 SUI per SONAR (very low supply, maximum discount to encourage buying)
            if (new_tier == 1) {
                marketplace.kiosk.base_sonar_price = 1_000_000_000;  // 1 SUI
            } else if (new_tier == 2) {
                marketplace.kiosk.base_sonar_price = 800_000_000;    // 0.8 SUI
            } else if (new_tier == 3) {
                marketplace.kiosk.base_sonar_price = 600_000_000;    // 0.6 SUI
            } else if (new_tier == 4) {
                marketplace.kiosk.base_sonar_price = 400_000_000;    // 0.4 SUI
            } else {
                marketplace.kiosk.base_sonar_price = 1_000_000_000;  // Default fallback
            };
        };

        marketplace.kiosk.current_tier = new_tier;
    }

    fun ceil_div_sui_payment(amount: u64, price_per_sonar: u64): u64 {
        let whole = amount / SUI_BASE_UNITS;
        let remainder = amount % SUI_BASE_UNITS;

        let mut required = whole * price_per_sonar;

        if (remainder > 0) {
            let fractional = (remainder * price_per_sonar + (SUI_BASE_UNITS - 1)) / SUI_BASE_UNITS;
            required = required + fractional;
        };

        required
    }

    // ========== Submission Functions ==========

    /// Submit audio with Walrus metadata
    /// Burns submission fee (0.001% of circulating supply)
    /// Creates AudioSubmission object owned by uploader
    public entry fun submit_audio(
        marketplace: &mut QualityMarketplace,
        burn_fee: Coin<SONAR_TOKEN>,
        walrus_blob_id: String,
        seal_policy_id: String,
        preview_blob_hash: Option<vector<u8>>,
        duration_seconds: u64,
        ctx: &mut TxContext
    ) {
        // Circuit breaker check
        assert!(
            !is_circuit_breaker_active(&marketplace.circuit_breaker, ctx),
            E_CIRCUIT_BREAKER_ACTIVE
        );

        // Calculate required burn fee based on circulating supply
        let circulating = get_circulating_supply(marketplace);
        let required_fee = economics::calculate_burn_fee(circulating);
        let paid_fee = coin::value(&burn_fee);

        assert!(paid_fee >= required_fee, E_INVALID_BURN_FEE);

        // Burn the submission fee
        let burn_balance = coin::into_balance(burn_fee);
        balance::decrease_supply(
            coin::supply_mut(&mut marketplace.treasury_cap),
            burn_balance
        );
        marketplace.total_burned = marketplace.total_burned + paid_fee;

        // Check reward pool can cover minimum reward (30+ quality score)
        let min_reward = economics::calculate_reward(circulating, 30);
        let pool_balance = balance::value(&marketplace.reward_pool);
        assert!(pool_balance >= min_reward, E_REWARD_POOL_DEPLETED);

        // Create submission object
        let submission_id = object::new(ctx);
        let submission_id_copy = object::uid_to_inner(&submission_id);
        let uploader = tx_context::sender(ctx);

        let submission = AudioSubmission {
            id: submission_id,
            uploader,
            walrus_blob_id: walrus_blob_id,
            seal_policy_id: seal_policy_id,
            preview_blob_hash,
            duration_seconds,
            quality_score: 0,  // Set by validator
            status: 0,         // 0 = pending
            vested_balance: VestedBalance {
                total_amount: 0,
                unlock_start_epoch: 0,
                unlock_duration_epochs: 90,
                claimed_amount: 0
            },
            unlocked_balance: 0,
            dataset_price: 0,
            listed_for_sale: false,
            purchase_count: 0,
            submitted_at_epoch: tx_context::epoch(ctx)
        };

        marketplace.total_submissions = marketplace.total_submissions + 1;

        // Emit event with blob_id for backend access
        event::emit(SubmissionCreated {
            submission_id: submission_id_copy,
            uploader,
            seal_policy_id: submission.seal_policy_id,
            walrus_blob_id: submission.walrus_blob_id,
            duration_seconds,
            burn_fee_paid: paid_fee,
            submitted_at_epoch: tx_context::epoch(ctx)
        });

        // Transfer submission to uploader
        transfer::transfer(submission, uploader);
    }

    /// Submit multiple audio files as a dataset
    /// Creates a DatasetSubmission containing multiple audio files
    public entry fun submit_audio_dataset(
        marketplace: &mut QualityMarketplace,
        burn_fee: Coin<SONAR_TOKEN>,
        blob_ids: vector<String>,
        preview_blob_ids: vector<String>,
        seal_policy_ids: vector<String>,
        durations: vector<u64>,
        bundle_discount_bps: u64,      // Basis points: 2000 = 20% discount
        ctx: &mut TxContext
    ) {
        // Circuit breaker check
        assert!(
            !is_circuit_breaker_active(&marketplace.circuit_breaker, ctx),
            E_CIRCUIT_BREAKER_ACTIVE
        );

        // Validate inputs
        let file_count = vector::length(&blob_ids);
        assert!(file_count > 0, E_INVALID_PARAMETER);
        assert!(file_count <= 100, E_INVALID_PARAMETER); // Max 100 files per dataset
        assert!(vector::length(&preview_blob_ids) == file_count, E_INVALID_PARAMETER);
        assert!(vector::length(&seal_policy_ids) == file_count, E_INVALID_PARAMETER);
        assert!(vector::length(&durations) == file_count, E_INVALID_PARAMETER);
        assert!(bundle_discount_bps <= 5000, E_INVALID_PARAMETER); // Max 50% discount

        // Calculate required burn fee based on circulating supply
        let circulating = get_circulating_supply(marketplace);
        let required_fee = economics::calculate_burn_fee(circulating);
        let paid_fee = coin::value(&burn_fee);

        assert!(paid_fee >= required_fee, E_INVALID_BURN_FEE);

        // Burn the submission fee
        let burn_balance = coin::into_balance(burn_fee);
        balance::decrease_supply(
            coin::supply_mut(&mut marketplace.treasury_cap),
            burn_balance
        );
        marketplace.total_burned = marketplace.total_burned + paid_fee;

        // Check reward pool can cover minimum reward (30+ quality score)
        let min_reward = economics::calculate_reward(circulating, 30);
        let pool_balance = balance::value(&marketplace.reward_pool);
        assert!(pool_balance >= min_reward, E_REWARD_POOL_DEPLETED);

        // Build vector of AudioFileEntry structs
        let mut files = vector::empty<AudioFileEntry>();
        let mut total_duration: u64 = 0;
        let mut i: u64 = 0;

        while (i < file_count) {
            let file_entry = AudioFileEntry {
                blob_id: *vector::borrow(&blob_ids, i),
                preview_blob_id: *vector::borrow(&preview_blob_ids, i),
                seal_policy_id: *vector::borrow(&seal_policy_ids, i),
                duration: *vector::borrow(&durations, i)
            };
            total_duration = total_duration + *vector::borrow(&durations, i);
            vector::push_back(&mut files, file_entry);
            i = i + 1;
        };

        // Create dataset submission object
        let submission_id = object::new(ctx);
        let submission_id_copy = object::uid_to_inner(&submission_id);
        let uploader = tx_context::sender(ctx);

        let dataset = DatasetSubmission {
            id: submission_id,
            uploader,
            files,
            total_duration,
            file_count,
            bundle_discount_bps,
            quality_score: 0,       // Set by validator
            status: 0,              // 0 = pending
            vested_balance: VestedBalance {
                total_amount: 0,
                unlock_start_epoch: 0,
                unlock_duration_epochs: 90,
                claimed_amount: 0
            },
            unlocked_balance: 0,
            dataset_price: 0,
            listed_for_sale: false,
            purchase_count: 0,
            submitted_at_epoch: tx_context::epoch(ctx)
        };

        marketplace.total_submissions = marketplace.total_submissions + 1;

        // Emit event for backend
        event::emit(DatasetSubmissionCreated {
            submission_id: submission_id_copy,
            uploader,
            file_count,
            total_duration,
            bundle_discount_bps,
            burn_fee_paid: paid_fee,
            submitted_at_epoch: tx_context::epoch(ctx)
        });

        // Transfer dataset to uploader
        transfer::transfer(dataset, uploader);
    }

    /// Finalize submission with quality score (ValidatorCap required)
    /// Calculates reward based on quality and vests over 90 epochs
    /// CRITICAL: Reserves reward from pool to prevent over-allocation
    public entry fun finalize_submission(
        _cap: &ValidatorCap,
        marketplace: &mut QualityMarketplace,
        submission: &mut AudioSubmission,
        quality_score: u8,
        ctx: &mut TxContext
    ) {
        // Validation checks
        assert!(submission.status == 0, E_ALREADY_FINALIZED);
        assert!(quality_score <= 100, E_INVALID_QUALITY_SCORE);

        // Calculate reward based on quality score
        let circulating = get_circulating_supply(marketplace);
        let reward_amount = economics::calculate_reward(circulating, quality_score);

        // Determine status (approved if score >= 30)
        let status = if (quality_score >= 30) { 1 } else { 2 };

        // Reserve reward from pool if approved
        if (status == 1) {
            let pool_balance = balance::value(&marketplace.reward_pool);
            let available = pool_balance - marketplace.reward_pool_allocated;
            assert!(available >= reward_amount, E_INSUFFICIENT_REWARDS);

            // Reserve the reward (increment allocated counter)
            marketplace.reward_pool_allocated = marketplace.reward_pool_allocated + reward_amount;

            // Initialize vesting schedule
            let current_epoch = tx_context::epoch(ctx);
            submission.vested_balance = VestedBalance {
                total_amount: reward_amount,
                unlock_start_epoch: current_epoch,
                unlock_duration_epochs: 90,
                claimed_amount: 0
            };

            // Emit finalization event
            event::emit(SubmissionFinalized {
                submission_id: object::uid_to_inner(&submission.id),
                uploader: submission.uploader,
                quality_score,
                status,
                reward_amount,
                vesting_start_epoch: current_epoch,
                vesting_duration_epochs: 90
            });
        } else {
            // Rejected submission
            event::emit(SubmissionFinalized {
                submission_id: object::uid_to_inner(&submission.id),
                uploader: submission.uploader,
                quality_score,
                status,
                reward_amount: 0,
                vesting_start_epoch: 0,
                vesting_duration_epochs: 0
            });
        };

        // Update submission
        submission.quality_score = quality_score;
        submission.status = status;
    }

    // ========== Vesting Functions ==========

    /// Calculate unlocked amount based on linear vesting
    /// Returns amount currently unlocked (not yet claimed)
    public fun calculate_unlocked_amount(
        vested: &VestedBalance,
        current_epoch: u64
    ): u64 {
        if (vested.total_amount == 0) {
            return 0
        };

        let elapsed = if (current_epoch > vested.unlock_start_epoch) {
            current_epoch - vested.unlock_start_epoch
        } else {
            0
        };

        // Linear vesting over duration_epochs
        let unlocked_total = if (elapsed >= vested.unlock_duration_epochs) {
            vested.total_amount  // Fully vested
        } else {
            (vested.total_amount * elapsed) / vested.unlock_duration_epochs
        };

        // Return amount not yet claimed
        if (unlocked_total > vested.claimed_amount) {
            unlocked_total - vested.claimed_amount
        } else {
            0
        }
    }

    /// Claim vested tokens
    /// Transfers unlocked tokens from reward pool to uploader
    /// CRITICAL: Decrements allocated counter as rewards are distributed
    public entry fun claim_vested_tokens(
        marketplace: &mut QualityMarketplace,
        submission: &mut AudioSubmission,
        ctx: &mut TxContext
    ) {
        // Only uploader can claim
        assert!(tx_context::sender(ctx) == submission.uploader, E_UNAUTHORIZED);

        // Calculate unlocked amount
        let current_epoch = tx_context::epoch(ctx);
        let claimable = calculate_unlocked_amount(&submission.vested_balance, current_epoch);

        assert!(claimable > 0, E_NOTHING_TO_CLAIM);

        // Debit from reward pool
        let reward_coins = coin::take(
            &mut marketplace.reward_pool,
            claimable,
            ctx
        );

        // Update claimed amount
        submission.vested_balance.claimed_amount =
            submission.vested_balance.claimed_amount + claimable;

        // Release allocated reservation (these tokens are now distributed)
        marketplace.reward_pool_allocated = marketplace.reward_pool_allocated - claimable;

        // Emit event
        event::emit(VestedTokensClaimed {
            submission_id: object::uid_to_inner(&submission.id),
            uploader: submission.uploader,
            amount_claimed: claimable,
            remaining_vested: submission.vested_balance.total_amount -
                             submission.vested_balance.claimed_amount
        });

        // Transfer to uploader
        transfer::public_transfer(reward_coins, submission.uploader);
    }

    // ========== Purchase Functions ==========

    /// Purchase dataset with dynamic tier-based economics
    /// Splits payment across burn/liquidity/uploader/treasury based on circulating supply tier
    public entry fun purchase_dataset(
        marketplace: &mut QualityMarketplace,
        submission: &mut AudioSubmission,
        mut payment: Coin<SONAR_TOKEN>,
        ctx: &mut TxContext
    ) {
        // Circuit breaker check
        assert!(
            !is_circuit_breaker_active(&marketplace.circuit_breaker, ctx),
            E_CIRCUIT_BREAKER_ACTIVE
        );

        // Validation: submission must be approved and listed
        assert!(submission.status == 1, E_NOT_APPROVED);
        assert!(submission.listed_for_sale, E_NOT_LISTED);

        // Validate payment amount
        let price = submission.dataset_price;
        let paid = coin::value(&payment);
        assert!(paid >= price, E_INVALID_PAYMENT);

        // Calculate circulating supply and tier
        let circulating = get_circulating_supply(marketplace);
        let tier = economics::get_tier(circulating, &marketplace.economic_config);

        // Update kiosk tier and pricing
        update_kiosk_tier_and_price(marketplace);

        // Calculate dynamic splits based on current tier
        let (burn_amount, liquidity_amount, uploader_amount, treasury_amount) =
            economics::calculate_purchase_splits(
                price,
                circulating,
                &marketplace.economic_config
            );

        // Get rates for event
        let burn_rate = economics::burn_bps(circulating, &marketplace.economic_config);
        let liquidity_rate = economics::liquidity_bps(circulating, &marketplace.economic_config);
        let uploader_rate = economics::uploader_bps(circulating, &marketplace.economic_config);

        // 1. Burn portion
        if (burn_amount > 0) {
            let burn_coin = coin::split(&mut payment, burn_amount, ctx);
            let burn_balance = coin::into_balance(burn_coin);
            balance::decrease_supply(
                coin::supply_mut(&mut marketplace.treasury_cap),
                burn_balance
            );
            marketplace.total_burned = marketplace.total_burned + burn_amount;
        };

        // 2. Liquidity vault portion (with auto-refill to kiosk)
        if (liquidity_amount > 0) {
            let mut liquidity_coin = coin::split(&mut payment, liquidity_amount, ctx);

            // Calculate kiosk auto-refill amount
            let kiosk_refill = (liquidity_amount * marketplace.kiosk.sui_cut_percentage) / 100;
            let vault_amount = liquidity_amount - kiosk_refill;

            // Route kiosk portion to sonar_reserve
            if (kiosk_refill > 0) {
                let kiosk_coin = coin::split(&mut liquidity_coin, kiosk_refill, ctx);
                balance::join(
                    &mut marketplace.kiosk.sonar_reserve,
                    coin::into_balance(kiosk_coin)
                );
            };

            // Route remainder to liquidity vault
            if (vault_amount > 0) {
                balance::join(
                    &mut marketplace.liquidity_vault,
                    coin::into_balance(liquidity_coin)
                );
            } else {
                coin::destroy_zero(liquidity_coin);
            };
        };

        // 3. Treasury portion
        if (treasury_amount > 0) {
            let treasury_coin = coin::split(&mut payment, treasury_amount, ctx);
            transfer::public_transfer(treasury_coin, marketplace.treasury_address);
        };

        // 4. Uploader portion (remaining balance)
        if (uploader_amount > 0) {
            let uploader_coin = coin::split(&mut payment, uploader_amount, ctx);
            transfer::public_transfer(uploader_coin, submission.uploader);
        };

        // Return any excess payment to buyer
        if (coin::value(&payment) > 0) {
            transfer::public_transfer(payment, tx_context::sender(ctx));
        } else {
            coin::destroy_zero(payment);
        };

        // Unlock vested rewards for uploader upon purchase
        let current_epoch = tx_context::epoch(ctx);
        let claimable_vesting = calculate_unlocked_amount(&submission.vested_balance, current_epoch);

        if (claimable_vesting > 0) {
            // Transfer vested tokens from reward pool to uploader
            let vesting_coins = coin::take(
                &mut marketplace.reward_pool,
                claimable_vesting,
                ctx
            );

            // Update claimed amount in vesting record
            submission.vested_balance.claimed_amount =
                submission.vested_balance.claimed_amount + claimable_vesting;

            // Release allocated reservation
            marketplace.reward_pool_allocated = marketplace.reward_pool_allocated - claimable_vesting;

            // Update unlocked balance tracking
            submission.unlocked_balance = submission.unlocked_balance + claimable_vesting;

            // Transfer to uploader
            transfer::public_transfer(vesting_coins, submission.uploader);
        };

        // Update statistics
        submission.purchase_count = submission.purchase_count + 1;
        marketplace.total_purchases = marketplace.total_purchases + 1;

        // Mint purchase receipt for SEAL access control
        let buyer_address = tx_context::sender(ctx);
        let receipt = purchase_policy::mint_receipt(
            submission.seal_policy_id,
            object::uid_to_inner(&submission.id),
            buyer_address,
            ctx
        );
        transfer::public_transfer(receipt, buyer_address);

        // Emit purchase event (NO walrus_blob_id!)
        event::emit(DatasetPurchased {
            submission_id: object::uid_to_inner(&submission.id),
            buyer: buyer_address,
            price,
            burned: burn_amount,
            burn_rate_bps: burn_rate,
            liquidity_allocated: liquidity_amount,
            liquidity_rate_bps: liquidity_rate,
            uploader_paid: uploader_amount,
            uploader_rate_bps: uploader_rate,
            treasury_paid: treasury_amount,
            circulating_supply: circulating,
            economic_tier: tier,
            seal_policy_id: submission.seal_policy_id,
            purchase_timestamp: tx_context::epoch(ctx)
        });
    }

    // ========== Submission Management Functions ==========

    /// List submission for sale (uploader only)
    public entry fun list_for_sale(
        submission: &mut AudioSubmission,
        dataset_price: u64,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == submission.uploader, E_UNAUTHORIZED);
        assert!(submission.status == 1, E_NOT_APPROVED);  // Must be approved

        submission.listed_for_sale = true;
        submission.dataset_price = dataset_price;
    }

    /// Unlist submission from sale (uploader only)
    public entry fun unlist_from_sale(
        submission: &mut AudioSubmission,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == submission.uploader, E_UNAUTHORIZED);

        submission.listed_for_sale = false;
    }

    /// Update dataset price (uploader only)
    public entry fun update_price(
        submission: &mut AudioSubmission,
        new_price: u64,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == submission.uploader, E_UNAUTHORIZED);

        submission.dataset_price = new_price;
    }

    // ========== Circuit Breaker Functions ==========

    /// Activate circuit breaker for emergency protection
    /// Only AdminCap holder can activate
    public entry fun activate_circuit_breaker(
        _cap: &AdminCap,
        marketplace: &mut QualityMarketplace,
        reason: String,
        ctx: &mut TxContext
    ) {
        let current_epoch = tx_context::epoch(ctx);

        marketplace.circuit_breaker.enabled = true;
        marketplace.circuit_breaker.triggered_at_epoch = current_epoch;
        marketplace.circuit_breaker.trigger_reason = reason;

        event::emit(CircuitBreakerActivated {
            reason: marketplace.circuit_breaker.trigger_reason,
            triggered_at_epoch: current_epoch,
            cooldown_epochs: marketplace.circuit_breaker.cooldown_epochs
        });
    }

    /// Deactivate circuit breaker manually
    /// Only AdminCap holder can deactivate
    /// Auto-deactivation happens after cooldown period via is_circuit_breaker_active check
    public entry fun deactivate_circuit_breaker(
        _cap: &AdminCap,
        marketplace: &mut QualityMarketplace,
        ctx: &mut TxContext
    ) {
        marketplace.circuit_breaker.enabled = false;

        event::emit(CircuitBreakerDeactivated {
            deactivated_at_epoch: tx_context::epoch(ctx)
        });
    }

    // ========== Admin Operations ==========

    /// Update economic configuration with individual parameters
    /// Externally callable entry point for AdminCap holders
    public entry fun update_economic_config_entry(
        _cap: &AdminCap,
        marketplace: &mut QualityMarketplace,
        tier_1_floor: u64,
        tier_2_floor: u64,
        tier_3_floor: u64,
        tier_1_burn_bps: u64,
        tier_2_burn_bps: u64,
        tier_3_burn_bps: u64,
        tier_4_burn_bps: u64,
        tier_1_liquidity_bps: u64,
        tier_2_liquidity_bps: u64,
        tier_3_liquidity_bps: u64,
        tier_4_liquidity_bps: u64,
        treasury_bps: u64
    ) {
        let new_config = economics::create_config(
            tier_1_floor,
            tier_2_floor,
            tier_3_floor,
            tier_1_burn_bps,
            tier_2_burn_bps,
            tier_3_burn_bps,
            tier_4_burn_bps,
            tier_1_liquidity_bps,
            tier_2_liquidity_bps,
            tier_3_liquidity_bps,
            tier_4_liquidity_bps,
            treasury_bps
        );

        update_economic_config(_cap, marketplace, new_config);
    }

    /// Update economic configuration
    /// CRITICAL: New config must pass validation (all tiers sum to 100%)
    /// Note: Use update_economic_config_entry for direct AdminCap transactions
    public fun update_economic_config(
        _cap: &AdminCap,
        marketplace: &mut QualityMarketplace,
        new_config: EconomicConfig
    ) {
        // Validate new config
        assert!(economics::validate_config(&new_config), E_UNAUTHORIZED);

        marketplace.economic_config = new_config;
    }

    /// Withdraw from liquidity vault
    /// Subject to withdrawal limits (10% per epoch, 7 epoch minimum between)
    /// CRITICAL: Checks cooldown BEFORE resetting epoch counter
    public entry fun withdraw_liquidity_vault(
        _cap: &AdminCap,
        marketplace: &mut QualityMarketplace,
        amount: u64,
        recipient: address,
        reason: String,
        ctx: &mut TxContext
    ) {
        let current_epoch = tx_context::epoch(ctx);
        let vault_balance = balance::value(&marketplace.liquidity_vault);

        // Check withdrawal limits
        let limits = &mut marketplace.withdrawal_limits;

        // Check minimum epochs between withdrawals BEFORE resetting
        // Allow first withdrawal unconditionally (last_withdrawal_epoch initialized to 0)
        // For subsequent withdrawals, enforce 7-epoch cooldown
        if (limits.last_withdrawal_epoch > 0) {
            assert!(
                current_epoch >= limits.last_withdrawal_epoch + limits.min_epochs_between,
                E_WITHDRAWAL_TOO_FREQUENT
            );
        };

        // Reset epoch counter if new epoch
        if (current_epoch > limits.last_withdrawal_epoch) {
            limits.total_withdrawn_this_epoch = 0;
        };

        // Check max per epoch limit (10% of vault)
        let max_withdrawal = (vault_balance * limits.max_per_epoch_bps) / 10_000;
        assert!(
            limits.total_withdrawn_this_epoch + amount <= max_withdrawal,
            E_WITHDRAWAL_EXCEEDS_LIMIT
        );

        // Execute withdrawal
        let withdrawal_coins = coin::take(&mut marketplace.liquidity_vault, amount, ctx);
        transfer::public_transfer(withdrawal_coins, recipient);

        // Update limits
        limits.total_withdrawn_this_epoch = limits.total_withdrawn_this_epoch + amount;
        limits.last_withdrawal_epoch = current_epoch;

        // Emit event
        event::emit(LiquidityVaultWithdrawal {
            amount,
            recipient,
            reason,
            remaining_balance: balance::value(&marketplace.liquidity_vault),
            withdrawn_by: tx_context::sender(ctx),
            timestamp_epoch: current_epoch
        });
    }

    // ========== Kiosk Functions ==========

    /// Fund kiosk with SONAR tokens (AdminCap required)
    public entry fun fund_kiosk_sonar(
        _cap: &AdminCap,
        marketplace: &mut QualityMarketplace,
        sonar_coins: Coin<SONAR_TOKEN>
    ) {
        let amount = coin::value(&sonar_coins);
        balance::join(&mut marketplace.kiosk.sonar_reserve, coin::into_balance(sonar_coins));

        event::emit(KioskFunded { amount });
    }

    /// Get the current active kiosk price (base or override)
    public fun get_kiosk_price(_marketplace: &QualityMarketplace): u64 {
        if (option::is_some(&_marketplace.kiosk.price_override)) {
            *option::borrow(&_marketplace.kiosk.price_override)
        } else {
            _marketplace.kiosk.base_sonar_price
        }
    }

    /// Sell SONAR: user pays SUI, receives SONAR from kiosk reserve
    public entry fun sell_sonar(
        marketplace: &mut QualityMarketplace,
        mut sui_payment: Coin<SUI>,
        ctx: &mut TxContext
    ) {
        // Update tier and pricing before transaction
        update_kiosk_tier_and_price(marketplace);

        // Get current price
        let price = get_kiosk_price(marketplace);
        assert!(price > 0, E_INVALID_KIOSK_PRICE);

        let sui_amount = coin::value(&sui_payment);

        // Require minimum payment: at least the base price
        assert!(sui_amount >= price, E_INVALID_PAYMENT);

        // Calculate SONAR received: (sui_amount * 1e9) / price
        // SUI is 1e9 base units, SONAR is also 1e9 base units
        let sonar_amount = (sui_amount * 1_000_000_000) / price;

        // Prevent zero SONAR returns (protects users from losing SUI due to rounding)
        assert!(sonar_amount > 0, E_INVALID_PAYMENT);

        // Check kiosk SONAR reserve
        let reserve = balance::value(&marketplace.kiosk.sonar_reserve);
        assert!(reserve >= sonar_amount, E_INSUFFICIENT_KIOSK_RESERVE);

        // Split SUI: keep exact price amount, return change to user
        let kiosk_sui = coin::split(&mut sui_payment, price, ctx);
        let kiosk_sui_balance = coin::into_balance(kiosk_sui);
        balance::join(&mut marketplace.kiosk.sui_reserve, kiosk_sui_balance);

        // Return any overpayment (change) to user
        if (coin::value(&sui_payment) > 0) {
            transfer::public_transfer(sui_payment, tx_context::sender(ctx));
        } else {
            coin::destroy_zero(sui_payment);
        };

        // Transfer SONAR from kiosk to user
        let sonar_coin = coin::take(&mut marketplace.kiosk.sonar_reserve, sonar_amount, ctx);
        transfer::public_transfer(sonar_coin, tx_context::sender(ctx));

        // Update statistics
        marketplace.kiosk.total_sonar_sold = marketplace.kiosk.total_sonar_sold + sonar_amount;

        event::emit(SonarSold {
            buyer: tx_context::sender(ctx),
            sui_amount,
            sonar_amount
        });
    }

    /// Purchase dataset via kiosk: user pays SONAR from kiosk
    /// CRITICAL: Triggers backend purchase event with no wallet signature needed on Purchase side
    public entry fun purchase_dataset_kiosk(
        marketplace: &mut QualityMarketplace,
        submission: &mut AudioSubmission,
        mut sonar_payment: Coin<SONAR_TOKEN>,
        ctx: &mut TxContext
    ) {
        // Circuit breaker check
        assert!(
            !is_circuit_breaker_active(&marketplace.circuit_breaker, ctx),
            E_CIRCUIT_BREAKER_ACTIVE
        );

        // Validation: submission must be approved and listed
        assert!(submission.status == 1, E_NOT_APPROVED);
        assert!(submission.listed_for_sale, E_NOT_LISTED);

        let price = submission.dataset_price;
        let paid = coin::value(&sonar_payment);
        assert!(paid >= price, E_INVALID_PAYMENT);

        // Calculate circulating supply and tier
        let circulating = get_circulating_supply(marketplace);
        let tier = economics::get_tier(circulating, &marketplace.economic_config);

        // Update kiosk tier and pricing
        update_kiosk_tier_and_price(marketplace);

        // Calculate dynamic splits based on current tier
        let (burn_amount, liquidity_amount, uploader_amount, treasury_amount) =
            economics::calculate_purchase_splits(
                price,
                circulating,
                &marketplace.economic_config
            );

        // Get rates for event
        let burn_rate = economics::burn_bps(circulating, &marketplace.economic_config);
        let liquidity_rate = economics::liquidity_bps(circulating, &marketplace.economic_config);
        let uploader_rate = economics::uploader_bps(circulating, &marketplace.economic_config);

        // 1. Burn portion
        if (burn_amount > 0) {
            let burn_coin = coin::split(&mut sonar_payment, burn_amount, ctx);
            let burn_balance = coin::into_balance(burn_coin);
            balance::decrease_supply(
                coin::supply_mut(&mut marketplace.treasury_cap),
                burn_balance
            );
            marketplace.total_burned = marketplace.total_burned + burn_amount;
        };

        // 2. Liquidity vault portion (with auto-refill to kiosk)
        if (liquidity_amount > 0) {
            let mut liquidity_coin = coin::split(&mut sonar_payment, liquidity_amount, ctx);

            // Calculate kiosk auto-refill amount
            let kiosk_refill = (liquidity_amount * marketplace.kiosk.sui_cut_percentage) / 100;
            let vault_amount = liquidity_amount - kiosk_refill;

            // Route kiosk portion to sonar_reserve
            if (kiosk_refill > 0) {
                let kiosk_coin = coin::split(&mut liquidity_coin, kiosk_refill, ctx);
                balance::join(
                    &mut marketplace.kiosk.sonar_reserve,
                    coin::into_balance(kiosk_coin)
                );
            };

            // Route remainder to liquidity vault
            if (vault_amount > 0) {
                balance::join(
                    &mut marketplace.liquidity_vault,
                    coin::into_balance(liquidity_coin)
                );
            } else {
                coin::destroy_zero(liquidity_coin);
            };
        };

        // 3. Treasury portion
        if (treasury_amount > 0) {
            let treasury_coin = coin::split(&mut sonar_payment, treasury_amount, ctx);
            transfer::public_transfer(treasury_coin, marketplace.treasury_address);
        };

        // 4. Uploader portion (remaining balance)
        if (uploader_amount > 0) {
            let uploader_coin = coin::split(&mut sonar_payment, uploader_amount, ctx);
            transfer::public_transfer(uploader_coin, submission.uploader);
        };

        // Return any excess payment to buyer
        if (coin::value(&sonar_payment) > 0) {
            transfer::public_transfer(sonar_payment, tx_context::sender(ctx));
        } else {
            coin::destroy_zero(sonar_payment);
        };

        // Unlock vested rewards for uploader upon purchase
        let current_epoch = tx_context::epoch(ctx);
        let claimable_vesting = calculate_unlocked_amount(&submission.vested_balance, current_epoch);

        if (claimable_vesting > 0) {
            let vesting_coins = coin::take(
                &mut marketplace.reward_pool,
                claimable_vesting,
                ctx
            );

            submission.vested_balance.claimed_amount =
                submission.vested_balance.claimed_amount + claimable_vesting;

            marketplace.reward_pool_allocated = marketplace.reward_pool_allocated - claimable_vesting;
            submission.unlocked_balance = submission.unlocked_balance + claimable_vesting;

            transfer::public_transfer(vesting_coins, submission.uploader);
        };

        // Update statistics
        submission.purchase_count = submission.purchase_count + 1;
        marketplace.total_purchases = marketplace.total_purchases + 1;
        marketplace.kiosk.total_datasets_purchased = marketplace.kiosk.total_datasets_purchased + 1;

        // Emit purchase event for backend event listener
        event::emit(DatasetPurchasedViaKiosk {
            buyer: tx_context::sender(ctx),
            dataset_id: object::uid_to_inner(&submission.id),
            sonar_amount: price
        });

        // Emit regular purchase event for analytics
        event::emit(DatasetPurchased {
            submission_id: object::uid_to_inner(&submission.id),
            buyer: tx_context::sender(ctx),
            price,
            burned: burn_amount,
            burn_rate_bps: burn_rate,
            liquidity_allocated: liquidity_amount,
            liquidity_rate_bps: liquidity_rate,
            uploader_paid: uploader_amount,
            uploader_rate_bps: uploader_rate,
            treasury_paid: treasury_amount,
            circulating_supply: circulating,
            economic_tier: tier,
            seal_policy_id: submission.seal_policy_id,
            purchase_timestamp: tx_context::epoch(ctx)
        });
    }

    /// Purchase dataset via kiosk using SUI directly.
    /// Kiosk consumes its SONAR reserve to complete purchase, burning according to tier economics.
    public entry fun purchase_dataset_kiosk_with_sui(
        marketplace: &mut QualityMarketplace,
        submission: &mut AudioSubmission,
        mut sui_payment: Coin<SUI>,
        ctx: &mut TxContext
    ) {
        assert!(submission.status == 1, E_NOT_APPROVED);
        assert!(submission.listed_for_sale, E_NOT_LISTED);

        update_kiosk_tier_and_price(marketplace);

        let price_per_sonar = get_kiosk_price(marketplace);
        assert!(price_per_sonar > 0, E_INVALID_KIOSK_PRICE);

        let dataset_price = submission.dataset_price;
        let required_sui = ceil_div_sui_payment(dataset_price, price_per_sonar);
        let provided_sui = coin::value(&sui_payment);

        assert!(provided_sui >= required_sui, E_INVALID_PAYMENT);

        let kiosk_reserve = balance::value(&marketplace.kiosk.sonar_reserve);
        assert!(kiosk_reserve >= dataset_price, E_INSUFFICIENT_KIOSK_RESERVE);

        // Deposit required SUI into kiosk reserve and refund any change
        let kiosk_sui_coin = coin::split(&mut sui_payment, required_sui, ctx);
        balance::join(&mut marketplace.kiosk.sui_reserve, coin::into_balance(kiosk_sui_coin));

        if (coin::value(&sui_payment) > 0) {
            transfer::public_transfer(sui_payment, tx_context::sender(ctx));
        } else {
            coin::destroy_zero(sui_payment);
        };

        // Withdraw SONAR from kiosk reserve for purchase processing
        let mut sonar_payment = coin::take(&mut marketplace.kiosk.sonar_reserve, dataset_price, ctx);

        // Calculate circulating supply and tier
        let circulating = get_circulating_supply(marketplace);
        let tier = economics::get_tier(circulating, &marketplace.economic_config);

        // Calculate dynamic splits based on current tier
        let (burn_amount, liquidity_amount, uploader_amount, treasury_amount) =
            economics::calculate_purchase_splits(
                dataset_price,
                circulating,
                &marketplace.economic_config
            );

        // Get rates for event
        let burn_rate = economics::burn_bps(circulating, &marketplace.economic_config);
        let liquidity_rate = economics::liquidity_bps(circulating, &marketplace.economic_config);
        let uploader_rate = economics::uploader_bps(circulating, &marketplace.economic_config);

        // 1. Burn portion
        if (burn_amount > 0) {
            let burn_coin = coin::split(&mut sonar_payment, burn_amount, ctx);
            let burn_balance = coin::into_balance(burn_coin);
            balance::decrease_supply(
                coin::supply_mut(&mut marketplace.treasury_cap),
                burn_balance
            );
            marketplace.total_burned = marketplace.total_burned + burn_amount;
        };

        // 2. Liquidity vault portion (with auto-refill to kiosk)
        if (liquidity_amount > 0) {
            let mut liquidity_coin = coin::split(&mut sonar_payment, liquidity_amount, ctx);

            let kiosk_refill = (liquidity_amount * marketplace.kiosk.sui_cut_percentage) / 100;
            let vault_amount = liquidity_amount - kiosk_refill;

            if (kiosk_refill > 0) {
                let kiosk_coin = coin::split(&mut liquidity_coin, kiosk_refill, ctx);
                balance::join(
                    &mut marketplace.kiosk.sonar_reserve,
                    coin::into_balance(kiosk_coin)
                );
            };

            if (vault_amount > 0) {
                balance::join(
                    &mut marketplace.liquidity_vault,
                    coin::into_balance(liquidity_coin)
                );
            } else {
                coin::destroy_zero(liquidity_coin);
            };
        };

        // 3. Treasury portion
        if (treasury_amount > 0) {
            let treasury_coin = coin::split(&mut sonar_payment, treasury_amount, ctx);
            transfer::public_transfer(treasury_coin, marketplace.treasury_address);
        };

        // 4. Uploader portion (remaining balance)
        if (uploader_amount > 0) {
            let uploader_coin = coin::split(&mut sonar_payment, uploader_amount, ctx);
            transfer::public_transfer(uploader_coin, submission.uploader);
        };

        // Any residual SONAR (from rounding) returns to kiosk reserve
        if (coin::value(&sonar_payment) > 0) {
            balance::join(
                &mut marketplace.kiosk.sonar_reserve,
                coin::into_balance(sonar_payment)
            );
        } else {
            coin::destroy_zero(sonar_payment);
        };

        // Unlock vested rewards for uploader upon purchase
        let current_epoch = tx_context::epoch(ctx);
        let claimable_vesting = calculate_unlocked_amount(&submission.vested_balance, current_epoch);

        if (claimable_vesting > 0) {
            let vesting_coins = coin::take(
                &mut marketplace.reward_pool,
                claimable_vesting,
                ctx
            );

            submission.vested_balance.claimed_amount =
                submission.vested_balance.claimed_amount + claimable_vesting;

            marketplace.reward_pool_allocated = marketplace.reward_pool_allocated - claimable_vesting;
            submission.unlocked_balance = submission.unlocked_balance + claimable_vesting;

            transfer::public_transfer(vesting_coins, submission.uploader);
        };

        submission.purchase_count = submission.purchase_count + 1;
        marketplace.total_purchases = marketplace.total_purchases + 1;
        marketplace.kiosk.total_datasets_purchased = marketplace.kiosk.total_datasets_purchased + 1;

        event::emit(DatasetPurchasedViaKiosk {
            buyer: tx_context::sender(ctx),
            dataset_id: object::uid_to_inner(&submission.id),
            sonar_amount: dataset_price
        });

        event::emit(DatasetPurchased {
            submission_id: object::uid_to_inner(&submission.id),
            buyer: tx_context::sender(ctx),
            price: dataset_price,
            burned: burn_amount,
            burn_rate_bps: burn_rate,
            liquidity_allocated: liquidity_amount,
            liquidity_rate_bps: liquidity_rate,
            uploader_paid: uploader_amount,
            uploader_rate_bps: uploader_rate,
            treasury_paid: treasury_amount,
            circulating_supply: circulating,
            economic_tier: tier,
            seal_policy_id: submission.seal_policy_id,
            purchase_timestamp: tx_context::epoch(ctx)
        });
    }

    /// Update kiosk price override (AdminCap required)
    /// None = use tier-based price; Some(value) = use fixed override
    public entry fun update_kiosk_price_override(
        _cap: &AdminCap,
        marketplace: &mut QualityMarketplace,
        new_price: Option<u64>,
        _ctx: &mut TxContext
    ) {
        // Validate: if Some, price must be > 0
        if (option::is_some(&new_price)) {
            assert!(*option::borrow(&new_price) > 0, E_INVALID_KIOSK_PRICE);
        };

        marketplace.kiosk.price_override = new_price;

        // If clearing override, refresh base_sonar_price from tier
        // If setting override, this updates tier cache and leaves base_sonar_price unchanged
        update_kiosk_tier_and_price(marketplace);

        event::emit(KioskPriceUpdated {
            base_price: marketplace.kiosk.base_sonar_price,
            override_price: marketplace.kiosk.price_override,
            tier: marketplace.kiosk.current_tier
        });
    }

    /// Update kiosk SUI cut percentage (AdminCap required)
    /// Percentage is in basis points (e.g., 5 = 5%)
    /// Valid range: 1-20
    public entry fun update_kiosk_sui_cut(
        _cap: &AdminCap,
        marketplace: &mut QualityMarketplace,
        percentage: u64
    ) {
        assert!(percentage >= 1 && percentage <= 20, E_INVALID_SUI_CUT_PERCENTAGE);

        marketplace.kiosk.sui_cut_percentage = percentage;

        event::emit(KioskSuiCutUpdated { percentage });
    }

    /// Withdraw SUI from kiosk reserve (AdminCap required)
    public entry fun withdraw_kiosk_sui(
        _cap: &AdminCap,
        marketplace: &mut QualityMarketplace,
        amount: u64,
        ctx: &mut TxContext
    ) {
        let reserve = balance::value(&marketplace.kiosk.sui_reserve);
        assert!(reserve >= amount, E_INSUFFICIENT_KIOSK_RESERVE);

        let sui_coins = coin::take(&mut marketplace.kiosk.sui_reserve, amount, ctx);
        transfer::public_transfer(sui_coins, tx_context::sender(ctx));
    }

    // ========== View Functions ==========

    /// Get marketplace statistics
    public fun get_marketplace_stats(marketplace: &QualityMarketplace): (u64, u64, u64, u64, u64) {
        (
            marketplace.total_submissions,
            marketplace.total_purchases,
            marketplace.total_burned,
            balance::value(&marketplace.reward_pool),
            balance::value(&marketplace.liquidity_vault)
        )
    }

    /// Get current economic tier
    public fun get_current_tier(marketplace: &QualityMarketplace): u8 {
        let circulating = get_circulating_supply(marketplace);
        economics::get_tier(circulating, &marketplace.economic_config)
    }

    /// Get current burn rate
    public fun get_current_burn_rate(marketplace: &QualityMarketplace): u64 {
        let circulating = get_circulating_supply(marketplace);
        economics::burn_bps(circulating, &marketplace.economic_config)
    }

    /// Get submission details
    public fun get_submission_info(submission: &AudioSubmission): (
        address,  // uploader
        u8,       // quality_score
        u8,       // status
        u64,      // dataset_price
        bool,     // listed_for_sale
        u64       // purchase_count
    ) {
        (
            submission.uploader,
            submission.quality_score,
            submission.status,
            submission.dataset_price,
            submission.listed_for_sale,
            submission.purchase_count
        )
    }

    /// Get vesting info
    public fun get_vesting_info(submission: &AudioSubmission, ctx: &TxContext): (
        u64,  // total_amount
        u64,  // claimed_amount
        u64   // claimable_now
    ) {
        let claimable = calculate_unlocked_amount(
            &submission.vested_balance,
            tx_context::epoch(ctx)
        );

        (
            submission.vested_balance.total_amount,
            submission.vested_balance.claimed_amount,
            claimable
        )
    }

    // ========== Voting Functions (Using Dynamic Fields) ==========

    /// Helper: Get or create voting stats from dynamic field
    fun get_or_create_voting_stats(submission: &mut AudioSubmission): &mut VotingStats {
        let key = VotingStatsKey {};
        if (!dynamic_field::exists_(&submission.id, key)) {
            dynamic_field::add(&mut submission.id, key, VotingStats {
                upvotes: 0,
                downvotes: 0,
                voters: vec_set::empty()
            });
        };
        dynamic_field::borrow_mut(&mut submission.id, key)
    }

    /// Helper: Get voting stats (read-only), returns default if not exists
    fun get_voting_stats(submission: &AudioSubmission): VotingStats {
        let key = VotingStatsKey {};
        if (dynamic_field::exists_(&submission.id, key)) {
            *dynamic_field::borrow(&submission.id, key)
        } else {
            VotingStats {
                upvotes: 0,
                downvotes: 0,
                voters: vec_set::empty()
            }
        }
    }

    /// Vote on a submission (upvote or downvote)
    /// Prevents double voting - changes existing vote if already voted
    public entry fun vote_on_submission(
        submission: &mut AudioSubmission,
        is_upvote: bool,
        ctx: &mut TxContext
    ) {
        let voter = tx_context::sender(ctx);
        let submission_id = object::uid_to_inner(&submission.id);
        let uploader = submission.uploader;

        // Prevent voting on own submission
        assert!(voter != uploader, E_CANNOT_VOTE_OWN_SUBMISSION);

        // Get or create voting stats
        let voting_stats = get_or_create_voting_stats(submission);

        // Check if voter already voted
        let already_voted = vec_set::contains(&voting_stats.voters, &voter);

        if (already_voted) {
            // Remove old vote first
            vec_set::remove(&mut voting_stats.voters, &voter);

            // Determine what the old vote was by checking if adding this vote changes the balance
            // Since we removed the voter, we need to track what type of vote they had
            // For simplicity, we'll allow changing votes by re-voting
        } else {
            // Add voter to the set
            vec_set::insert(&mut voting_stats.voters, voter);
        };

        // Apply the vote
        if (is_upvote) {
            voting_stats.upvotes = voting_stats.upvotes + 1;
        } else {
            voting_stats.downvotes = voting_stats.downvotes + 1;
        };

        // Calculate net score
        let net_score = if (voting_stats.upvotes >= voting_stats.downvotes) {
            voting_stats.upvotes - voting_stats.downvotes
        } else {
            0  // Don't allow negative scores
        };

        // Copy values for events
        let new_upvotes = voting_stats.upvotes;
        let new_downvotes = voting_stats.downvotes;

        // Emit vote event
        event::emit(VoteCast {
            submission_id,
            voter,
            is_upvote,
            new_upvotes,
            new_downvotes,
            net_score,
            timestamp: tx_context::epoch(ctx)
        });

        // Check for auto-graduation
        if (net_score >= GRADUATION_THRESHOLD && !submission.listed_for_sale) {
            submission.listed_for_sale = true;

            event::emit(SubmissionGraduated {
                submission_id,
                uploader,
                net_score,
                timestamp: tx_context::epoch(ctx)
            });
        };
    }

    /// Remove your vote from a submission
    public entry fun remove_vote(
        submission: &mut AudioSubmission,
        was_upvote: bool,
        ctx: &mut TxContext
    ) {
        let voter = tx_context::sender(ctx);
        let submission_id = object::uid_to_inner(&submission.id);

        // Get voting stats (must exist if voting)
        let key = VotingStatsKey {};
        assert!(dynamic_field::exists_(&submission.id, key), E_VOTE_NOT_FOUND);
        let voting_stats = dynamic_field::borrow_mut<VotingStatsKey, VotingStats>(&mut submission.id, key);

        // Check if voter has voted
        assert!(vec_set::contains(&voting_stats.voters, &voter), E_VOTE_NOT_FOUND);

        // Remove voter from set
        vec_set::remove(&mut voting_stats.voters, &voter);

        // Remove the vote
        if (was_upvote) {
            voting_stats.upvotes = voting_stats.upvotes - 1;
        } else {
            voting_stats.downvotes = voting_stats.downvotes - 1;
        };

        // Calculate net score
        let net_score = if (voting_stats.upvotes >= voting_stats.downvotes) {
            voting_stats.upvotes - voting_stats.downvotes
        } else {
            0
        };

        // Copy values for event
        let new_upvotes = voting_stats.upvotes;
        let new_downvotes = voting_stats.downvotes;

        // Emit event
        event::emit(VoteRemoved {
            submission_id,
            voter,
            was_upvote,
            new_upvotes,
            new_downvotes,
            net_score
        });
    }

    /// Get vote counts for a submission
    public fun get_vote_count(submission: &AudioSubmission): (u64, u64, u64) {
        let voting_stats = get_voting_stats(submission);
        let net = if (voting_stats.upvotes >= voting_stats.downvotes) {
            voting_stats.upvotes - voting_stats.downvotes
        } else {
            0
        };

        (voting_stats.upvotes, voting_stats.downvotes, net)
    }

    /// Check if an address has voted on a submission
    public fun has_voted(submission: &AudioSubmission, voter: address): bool {
        let voting_stats = get_voting_stats(submission);
        vec_set::contains(&voting_stats.voters, &voter)
    }

    /// Get net score (upvotes - downvotes)
    public fun get_net_score(submission: &AudioSubmission): u64 {
        let voting_stats = get_voting_stats(submission);
        if (voting_stats.upvotes >= voting_stats.downvotes) {
            voting_stats.upvotes - voting_stats.downvotes
        } else {
            0
        }
    }
}
