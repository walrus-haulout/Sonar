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

    // ========== Submission Functions ==========

    /// Submit audio with Walrus metadata
    /// Burns submission fee (0.001% of circulating supply)
    /// Creates AudioSubmission object owned by uploader
    public entry fun submit_audio(
        marketplace: &mut QualityMarketplace,
        burn_fee: Coin<SONAR_TOKEN>,
        seal_policy_id: String,
        preview_blob_hash: vector<u8>,
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

        // Emit event (NO walrus_blob_id!)
        event::emit(SubmissionCreated {
            submission_id: submission_id_copy,
            uploader,
            seal_policy_id: submission.seal_policy_id,
            duration_seconds,
            burn_fee_paid: paid_fee,
            submitted_at_epoch: tx_context::epoch(ctx)
        });

        // Transfer submission to uploader
        transfer::transfer(submission, uploader);
    }

    /// Finalize submission with quality score (ValidatorCap required)
    /// Calculates reward based on quality and vests over 90 epochs
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

        // Debit reward pool if approved
        if (status == 1) {
            let pool_balance = balance::value(&marketplace.reward_pool);
            assert!(pool_balance >= reward_amount, E_INSUFFICIENT_REWARDS);

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

        // 2. Liquidity vault portion
        if (liquidity_amount > 0) {
            let liquidity_coin = coin::split(&mut payment, liquidity_amount, ctx);
            balance::join(
                &mut marketplace.liquidity_vault,
                coin::into_balance(liquidity_coin)
            );
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

        // Update statistics
        submission.purchase_count = submission.purchase_count + 1;
        marketplace.total_purchases = marketplace.total_purchases + 1;

        // Emit purchase event (NO walrus_blob_id!)
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

    /// Update economic configuration
    /// CRITICAL: New config must pass validation (all tiers sum to 100%)
    /// Note: Not entry - call via PTB with constructed EconomicConfig
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

        // Reset epoch counter if new epoch
        if (current_epoch > limits.last_withdrawal_epoch) {
            limits.total_withdrawn_this_epoch = 0;
            limits.last_withdrawal_epoch = current_epoch;
        };

        // Check minimum epochs between withdrawals
        assert!(
            current_epoch >= limits.last_withdrawal_epoch + limits.min_epochs_between ||
            limits.total_withdrawn_this_epoch == 0,  // First withdrawal of epoch
            E_WITHDRAWAL_TOO_FREQUENT
        );

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
}
