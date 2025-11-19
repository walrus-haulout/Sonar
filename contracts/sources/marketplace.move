/// SONAR Marketplace Module
///
/// The core protocol contract managing audio submissions, quality rewards,
/// dynamic economics, and dataset purchases.
#[allow(unused_const, duplicate_alias, lint(self_transfer))]
module sonar::marketplace {
    use std::option::Option;
    use std::string::{Self, String};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::sui::SUI;
    use sui::event;
    use sui::object;
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sonar::sonar_token::SONAR_TOKEN;
    use sonar::economics::{Self, EconomicConfig};
    use sonar::purchase_policy;
    use sonar::verification_session::{Self, VerificationSession, SessionRegistry};
    use sonar::storage_lease::{Self, LeaseRegistry};

    // ========== Error Codes ==========

    // Submission errors (2000-2999)
    const E_INVALID_BURN_FEE: u64 = 2001;
    const E_REWARD_POOL_DEPLETED: u64 = 2002;
    const E_ALREADY_FINALIZED: u64 = 2003;
    const E_INVALID_QUALITY_SCORE: u64 = 2004;
    const E_INSUFFICIENT_REWARDS: u64 = 2005;
    const E_INVALID_PARAMETER: u64 = 2006;
    const E_BLOB_NOT_REGISTERED: u64 = 2007;
    const E_REGISTRATION_ALREADY_FINALIZED: u64 = 2008;
    const E_SUBMISSION_NOT_FOUND: u64 = 2009;
    const E_NOT_SUBMISSION_OWNER: u64 = 2010;

    // Purchase errors (3000-3999)
    const E_NOT_LISTED: u64 = 3001;
    const E_NOT_APPROVED: u64 = 3002;
    const E_INVALID_PAYMENT: u64 = 3003;
    const E_SUI_PAYMENTS_DISABLED: u64 = 3004;

    // Admin errors (5000-5999)
    const E_UNAUTHORIZED: u64 = 5001;
    const E_CIRCUIT_BREAKER_ACTIVE: u64 = 5002;
    const E_COOLDOWN_NOT_ELAPSED: u64 = 5003;
    const E_WITHDRAWAL_TOO_FREQUENT: u64 = 5004;
    const E_WITHDRAWAL_EXCEEDS_LIMIT: u64 = 5005;

    // Vesting errors (6000-6999)
    const E_NOTHING_TO_CLAIM: u64 = 6001;

    // ========== Submission Fee Configuration ==========

    /// Fixed fee (in MIST) required for audio submissions.
    /// 0.25 SUI = 250_000_000 MIST (1 SUI = 1_000_000_000 MIST)
    const SUBMISSION_FEE_SUI: u64 = 250_000_000;

    /// Recipient of submission fees (protocol deployer).
    const SUBMISSION_FEE_RECIPIENT: address = @0xca793690985183dc8e2180fd059d76f3b0644f5c2ecd3b01cdebe7d40b0cca39;

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

    /// Blob Registration - atomic synchronization between Walrus and Move objects
    /// This object ensures that blob uploads are traceable and recoverable
    public struct BlobRegistration has key, store {
        id: UID,
        uploader: address,
        created_at_epoch: u64,

        // Blob metadata
        walrus_blob_id: Option<String>,  // Set after Walrus upload succeeds
        preview_blob_id: Option<String>, // Set after preview upload succeeds
        seal_policy_id: String,          // Set during registration
        preview_blob_hash: Option<vector<u8>>,

        // Status tracking
        is_finalized: bool,              // True after submission is created
        submission_id: Option<ID>,       // Set when AudioSubmission is created

        // Content metadata
        duration_seconds: u64,
        submitted_at_epoch: u64
    }

    /// Audio submission with Walrus/Seal metadata
    public struct AudioSubmission has key, store {
        id: UID,
        uploader: address,

        // Walrus integration
        walrus_blob_id: String,              // Walrus blob ID for encrypted audio retrieval
        preview_blob_id: String,             // Walrus blob ID for preview audio
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

        // Statistics
        total_submissions: u64,
        total_purchases: u64,
        total_burned: u64,

        // Configuration
        treasury_address: address,
        admin_cap_id: ID,              // For verification
        economic_config: EconomicConfig,
        circuit_breaker: CircuitBreaker,
        withdrawal_limits: WithdrawalLimits,

        // Payment options
        sui_payments_enabled: bool     // Toggle for SUI payment support (temporary)
    }

    // ========== Events ==========

    public struct MarketplaceInitialized has copy, drop {
        marketplace_id: ID,
        initial_supply: u64,
        reward_pool_funded: u64,
        team_allocation: u64,
        team_wallet: address
    }

    public struct BlobRegistrationCreated has copy, drop {
        registration_id: ID,
        uploader: address,
        seal_policy_id: String,
        duration_seconds: u64,
        created_at_epoch: u64
    }

    public struct BlobUploadFinalized has copy, drop {
        registration_id: ID,
        walrus_blob_id: String,
        preview_blob_id: String,
        seal_policy_id: String,
        finalized_at_epoch: u64
    }

    public struct SubmissionCreated has copy, drop {
        submission_id: ID,
        registration_id: ID,
        uploader: address,
        seal_policy_id: String,        // ✅ Safe to emit for decryption requests
        walrus_blob_id: String,        // ✅ For backend authenticated delivery
        preview_blob_id: String,       // ✅ For frontend preview streaming
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

    public struct SubmissionReencrypted has copy, drop {
        submission_id: ID,
        uploader: address,
        old_seal_policy_id: String,
        new_seal_policy_id: String,
        old_walrus_blob_id: String,
        new_walrus_blob_id: String,
        reencrypted_at_epoch: u64
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

    public struct DatasetPurchasedWithSUI has copy, drop {
        submission_id: ID,
        buyer: address,
        price: u64,
        uploader_paid: u64,
        protocol_paid: u64,
        seal_policy_id: String,        // ✅ For decryption request
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
            },
            sui_payments_enabled: true  // Enable SUI payments by default (temporary support)
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

    /// Phase 1: Register blob intent on-chain (happens before Walrus upload)
    /// Creates a BlobRegistration object that tracks the blob lifecycle
    /// Returns the registration object to be used during upload
    public entry fun register_blob_intent(
        seal_policy_id: String,
        duration_seconds: u64,
        ctx: &mut TxContext
    ) {
        let registration_id = object::new(ctx);
        let registration_id_copy = object::uid_to_inner(&registration_id);

        let registration = BlobRegistration {
            id: registration_id,
            uploader: tx_context::sender(ctx),
            created_at_epoch: tx_context::epoch(ctx),
            walrus_blob_id: option::none(),
            preview_blob_id: option::none(),
            seal_policy_id: seal_policy_id,
            preview_blob_hash: option::none(),
            is_finalized: false,
            submission_id: option::none(),
            duration_seconds,
            submitted_at_epoch: tx_context::epoch(ctx),
        };

        event::emit(BlobRegistrationCreated {
            registration_id: registration_id_copy,
            uploader: tx_context::sender(ctx),
            seal_policy_id,
            duration_seconds,
            created_at_epoch: tx_context::epoch(ctx),
        });

        // Transfer registration to uploader for use during upload
        transfer::transfer(registration, tx_context::sender(ctx));
    }

    /// Phase 2: Finalize blob upload and create submission atomically
    /// Takes the registered blob info and creates the actual AudioSubmission
    /// This ensures Walrus blob_id is always synchronized with Move object
    public entry fun finalize_submission_with_blob(
        marketplace: &mut QualityMarketplace,
        mut submission_fee: Coin<SUI>,
        registration: BlobRegistration,
        walrus_blob_id: String,
        preview_blob_id: String,
        preview_blob_hash: Option<vector<u8>>,
        ctx: &mut TxContext
    ) {
        // Validate registration is not already finalized
        assert!(!registration.is_finalized, E_REGISTRATION_ALREADY_FINALIZED);

        // Circuit breaker check
        assert!(
            !is_circuit_breaker_active(&marketplace.circuit_breaker, ctx),
            E_CIRCUIT_BREAKER_ACTIVE
        );

        let uploader = tx_context::sender(ctx);
        let registration_id = object::uid_to_inner(&registration.id);
        let fee_paid = coin::value(&submission_fee);
        assert!(fee_paid >= SUBMISSION_FEE_SUI, E_INVALID_BURN_FEE);

        let required_fee = coin::split(&mut submission_fee, SUBMISSION_FEE_SUI, ctx);
        transfer::public_transfer(required_fee, SUBMISSION_FEE_RECIPIENT);

        if (coin::value(&submission_fee) > 0) {
            transfer::public_transfer(submission_fee, uploader);
        } else {
            coin::destroy_zero(submission_fee);
        };

        // Check reward pool can cover minimum reward
        let circulating = get_circulating_supply(marketplace);
        let min_reward = economics::calculate_reward(circulating, 30);
        let pool_balance = balance::value(&marketplace.reward_pool);
        assert!(pool_balance >= min_reward, E_REWARD_POOL_DEPLETED);

        // Emit finalization event for the registration
        event::emit(BlobUploadFinalized {
            registration_id,
            walrus_blob_id: walrus_blob_id,
            preview_blob_id: preview_blob_id,
            seal_policy_id: registration.seal_policy_id,
            finalized_at_epoch: tx_context::epoch(ctx),
        });

        // Create submission with finalized blob info
        let submission_id = object::new(ctx);
        let submission_id_copy = object::uid_to_inner(&submission_id);

        let submission = AudioSubmission {
            id: submission_id,
            uploader,
            walrus_blob_id: walrus_blob_id,
            preview_blob_id: preview_blob_id,
            seal_policy_id: registration.seal_policy_id,
            preview_blob_hash,
            duration_seconds: registration.duration_seconds,
            quality_score: 0,
            status: 0,
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

        // Emit creation event with link to registration
        event::emit(SubmissionCreated {
            submission_id: submission_id_copy,
            registration_id,
            uploader,
            seal_policy_id: submission.seal_policy_id,
            walrus_blob_id: submission.walrus_blob_id,
            preview_blob_id: submission.preview_blob_id,
            duration_seconds: submission.duration_seconds,
            burn_fee_paid: SUBMISSION_FEE_SUI,
            submitted_at_epoch: tx_context::epoch(ctx)
        });

        // Clean up registration object by destroying it
        let BlobRegistration {
            id,
            uploader: _,
            created_at_epoch: _,
            walrus_blob_id: _,
            preview_blob_id: _,
            seal_policy_id: _,
            preview_blob_hash: _,
            is_finalized: _,
            submission_id: _,
            duration_seconds: _,
            submitted_at_epoch: _,
        } = registration;

        object::delete(id);

        // Transfer submission to uploader
        transfer::transfer(submission, uploader);
    }

    /// Re-encrypt submission with new policy (policy rotation)
    /// This enables:
    /// - Changing access rules without re-uploading bulk data
    /// - Key rotation
    /// - Access revocation
    ///
    /// Atomically updates:
    /// 1. Walrus blob_id (to new re-encrypted blob)
    /// 2. Seal policy_id (to new access policy)
    /// 3. Emits SubmissionReencrypted event for tracking
    ///
    /// The old blob should be cleaned up separately
    public entry fun reencrypt_submission(
        submission: &mut AudioSubmission,
        new_walrus_blob_id: String,
        new_seal_policy_id: String,
        ctx: &TxContext
    ) {
        // Verify caller is the submission owner
        assert!(
            submission.uploader == tx_context::sender(ctx),
            E_NOT_SUBMISSION_OWNER
        );

        // Store old values for event emission
        let old_seal_policy_id = submission.seal_policy_id;
        let old_walrus_blob_id = submission.walrus_blob_id;

        // Atomic update of both blob references
        submission.seal_policy_id = new_seal_policy_id;
        submission.walrus_blob_id = new_walrus_blob_id;

        // Emit re-encryption event with both old and new values
        event::emit(SubmissionReencrypted {
            submission_id: object::uid_to_inner(&submission.id),
            uploader: submission.uploader,
            old_seal_policy_id,
            new_seal_policy_id: submission.seal_policy_id,
            old_walrus_blob_id,
            new_walrus_blob_id: submission.walrus_blob_id,
            reencrypted_at_epoch: tx_context::epoch(ctx),
        });
    }

    /// Submit audio with Walrus metadata
    /// Collects a fixed submission fee (0.25 SUI) that is forwarded to deployer
    /// Creates AudioSubmission object owned by uploader
    public entry fun submit_audio(
        marketplace: &mut QualityMarketplace,
        mut submission_fee: Coin<SUI>,
        walrus_blob_id: String,
        preview_blob_id: String,
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

        let uploader = tx_context::sender(ctx);
        let fee_paid = coin::value(&submission_fee);
        assert!(fee_paid >= SUBMISSION_FEE_SUI, E_INVALID_BURN_FEE);

        let required_fee = coin::split(&mut submission_fee, SUBMISSION_FEE_SUI, ctx);
        transfer::public_transfer(required_fee, SUBMISSION_FEE_RECIPIENT);

        if (coin::value(&submission_fee) > 0) {
            transfer::public_transfer(submission_fee, uploader);
        } else {
            coin::destroy_zero(submission_fee);
        };

        // Check reward pool can cover minimum reward (30+ quality score)
        let circulating = get_circulating_supply(marketplace);
        let min_reward = economics::calculate_reward(circulating, 30);
        let pool_balance = balance::value(&marketplace.reward_pool);
        assert!(pool_balance >= min_reward, E_REWARD_POOL_DEPLETED);

        // Create submission object
        let submission_id = object::new(ctx);
        let submission_id_copy = object::uid_to_inner(&submission_id);

        let submission = AudioSubmission {
            id: submission_id,
            uploader,
            walrus_blob_id: walrus_blob_id,
            preview_blob_id: preview_blob_id,
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
            preview_blob_id: submission.preview_blob_id,
            duration_seconds,
            burn_fee_paid: SUBMISSION_FEE_SUI,
            submitted_at_epoch: tx_context::epoch(ctx)
        });

        // Transfer submission to uploader
        transfer::transfer(submission, uploader);
    }

    /// Submit multiple audio files as a dataset
    /// Collects the fixed submission fee (0.25 SUI) and forwards it to deployer
    /// Creates a DatasetSubmission containing multiple audio files
    public entry fun submit_audio_dataset(
        marketplace: &mut QualityMarketplace,
        mut submission_fee: Coin<SUI>,
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

        let uploader = tx_context::sender(ctx);
        let fee_paid = coin::value(&submission_fee);
        assert!(fee_paid >= SUBMISSION_FEE_SUI, E_INVALID_BURN_FEE);

        let required_fee = coin::split(&mut submission_fee, SUBMISSION_FEE_SUI, ctx);
        transfer::public_transfer(required_fee, SUBMISSION_FEE_RECIPIENT);

        if (coin::value(&submission_fee) > 0) {
            transfer::public_transfer(submission_fee, uploader);
        } else {
            coin::destroy_zero(submission_fee);
        };

        // Check reward pool can cover minimum reward (30+ quality score)
        let circulating = get_circulating_supply(marketplace);
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
            burn_fee_paid: SUBMISSION_FEE_SUI,
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

        // Auto-list with AI-calculated price if approved
        if (status == 1) {
            // Calculate initial price based on quality score and reward amount
            let ai_price = calculate_ai_price(quality_score, reward_amount);
            submission.dataset_price = ai_price;
            submission.listed_for_sale = true;
        };

        // Update submission
        submission.quality_score = quality_score;
        submission.status = status;
    }

    /// Calculate AI-suggested price based on quality score
    /// Tiers: <50 = base (reward), 50-70 = 2x, 70-90 = 5x, 90+ = 10x
    fun calculate_ai_price(quality_score: u8, reward_amount: u64): u64 {
        if (quality_score >= 90) {
            reward_amount * 10  // Premium pricing for excellent quality
        } else if (quality_score >= 70) {
            reward_amount * 5   // High quality
        } else if (quality_score >= 50) {
            reward_amount * 2   // Medium quality
        } else {
            reward_amount       // Base pricing for lower quality
        }
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

    /// Purchase dataset with SUI (temporary support, will be disabled in future)
    /// Buyers pay with SUI, which is converted to protocol revenue split
    public entry fun purchase_dataset_with_sui(
        marketplace: &mut QualityMarketplace,
        submission: &mut AudioSubmission,
        mut payment: Coin<SUI>,
        ctx: &mut TxContext
    ) {
        // Check if SUI payments are enabled
        assert!(marketplace.sui_payments_enabled, E_SUI_PAYMENTS_DISABLED);

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

        // Split according to 60% uploader / 40% protocol (fixed split for SUI)
        let uploader_amount = (price * 6000) / 10000;      // 60%
        let protocol_amount = price - uploader_amount;      // 40%

        // 1. Protocol portion (40%) to treasury
        if (protocol_amount > 0) {
            let protocol_coin = coin::split(&mut payment, protocol_amount, ctx);
            transfer::public_transfer(protocol_coin, marketplace.treasury_address);
        };

        // 2. Uploader portion (60%)
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

        // Mint purchase receipt for SEAL access control
        let buyer_address = tx_context::sender(ctx);
        let receipt = purchase_policy::mint_receipt(
            submission.seal_policy_id,
            object::uid_to_inner(&submission.id),
            buyer_address,
            ctx
        );
        transfer::public_transfer(receipt, buyer_address);

        // Emit purchase event for SUI payment
        event::emit(DatasetPurchasedWithSUI {
            submission_id: object::uid_to_inner(&submission.id),
            buyer: buyer_address,
            price,
            uploader_paid: uploader_amount,
            protocol_paid: protocol_amount,
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

    /// Toggle SUI payment support (AdminCap required)
    /// Used to disable SUI payments when SNR liquidity is established
    public entry fun toggle_sui_payments(
        _cap: &AdminCap,
        marketplace: &mut QualityMarketplace,
        enabled: bool
    ) {
        marketplace.sui_payments_enabled = enabled;
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


    // ========== Verification Session Integration ==========

    /// Finalize submission from a verified session
    /// Creates AudioSubmission and StorageLease after verification completes
    public entry fun finalize_submission_from_session(
        marketplace: &mut QualityMarketplace,
        session: &mut VerificationSession,
        session_registry: &mut SessionRegistry,
        lease_registry: &mut LeaseRegistry,
        mut submission_fee: Coin<SUI>,
        lease_duration_epochs: u64,
        dataset_price: u64,
        ctx: &mut TxContext
    ) {
        // Circuit breaker check
        assert!(
            !is_circuit_breaker_active(&marketplace.circuit_breaker, ctx),
            E_CIRCUIT_BREAKER_ACTIVE
        );

        // Validate session is encrypted and approved
        assert!(verification_session::is_encrypted(session), E_NOT_APPROVED);
        assert!(verification_session::is_approved(session), E_NOT_APPROVED);

        // Validate ownership
        let uploader = tx_context::sender(ctx);
        assert!(verification_session::owner(session) == uploader, E_UNAUTHORIZED);

        // Extract session data
        let encrypted_cid = *option::borrow(&verification_session::encrypted_cid(session));
        let preview_cid = *option::borrow(&verification_session::preview_cid(session));
        let seal_policy_id = *option::borrow(&verification_session::seal_policy_id(session));
        let quality_score = verification_session::quality_score(session);
        let duration_seconds = verification_session::duration_seconds(session);
        let capacity_bytes = verification_session::plaintext_size_bytes(session);

        let fee_paid = coin::value(&submission_fee);
        assert!(fee_paid >= SUBMISSION_FEE_SUI, E_INVALID_BURN_FEE);

        let required_fee = coin::split(&mut submission_fee, SUBMISSION_FEE_SUI, ctx);
        transfer::public_transfer(required_fee, SUBMISSION_FEE_RECIPIENT);

        if (coin::value(&submission_fee) > 0) {
            transfer::public_transfer(submission_fee, uploader);
        } else {
            coin::destroy_zero(submission_fee);
        };

        // Calculate quality reward
        let circulating = get_circulating_supply(marketplace);
        let reward_amount = economics::calculate_reward(circulating, quality_score);
        let pool_balance = balance::value(&marketplace.reward_pool);
        assert!(pool_balance >= reward_amount, E_REWARD_POOL_DEPLETED);

        // Reserve reward in pool (will vest over 90 epochs)
        marketplace.reward_pool_allocated = marketplace.reward_pool_allocated + reward_amount;

        // Create submission
        let submission_id = object::new(ctx);
        let submission_id_copy = object::uid_to_inner(&submission_id);
        let current_epoch = tx_context::epoch(ctx);

        let submission = AudioSubmission {
            id: submission_id,
            uploader,
            walrus_blob_id: encrypted_cid,
            preview_blob_id: preview_cid,
            seal_policy_id,
            preview_blob_hash: option::none(),
            duration_seconds,
            quality_score,
            status: 1,  // 1 = approved
            vested_balance: VestedBalance {
                total_amount: reward_amount,
                unlock_start_epoch: current_epoch,
                unlock_duration_epochs: 90,
                claimed_amount: 0
            },
            unlocked_balance: 0,
            dataset_price,
            listed_for_sale: (dataset_price > 0),
            purchase_count: 0,
            submitted_at_epoch: current_epoch
        };

        marketplace.total_submissions = marketplace.total_submissions + 1;

        // Link session to submission
        verification_session::link_submission(
            session,
            submission_id_copy,
            session_registry,
            ctx
        );

        // Create storage lease (no additional fee - submission fee covers storage)
        storage_lease::create_lease(
            lease_registry,
            submission_id_copy,
            encrypted_cid,
            string::utf8(b""), // walrus_deal_id (empty for now, can be set by Walrus oracle)
            capacity_bytes,
            lease_duration_epochs,
            ctx
        );

        // Emit event
        event::emit(SubmissionFinalized {
            submission_id: submission_id_copy,
            uploader,
            quality_score,
            status: 1,
            reward_amount,
            vesting_start_epoch: current_epoch,
            vesting_duration_epochs: 90
        });

        // Transfer submission to uploader
        transfer::transfer(submission, uploader);
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
