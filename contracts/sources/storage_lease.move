/// SONAR Storage Lease Module
///
/// Manages Walrus storage leases with expiration tracking and renewal logic.
/// Links submissions to their storage infrastructure and enforces lifecycle policies.
#[allow(unused_const, duplicate_alias)]
module sonar::storage_lease {
    use std::string::String;
    use std::vector;
    use sui::balance::Self;
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::event;
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::vec_map::{Self, VecMap};
    use sonar::sonar_token::SONAR_TOKEN;

    // ========== Error Codes ==========

    // Lease management errors (7000-7999)
    const E_LEASE_EXPIRED: u64 = 7001;
    const E_LEASE_STILL_ACTIVE: u64 = 7002;
    const E_INSUFFICIENT_PAYMENT: u64 = 7003;
    const E_UNAUTHORIZED_RENEWAL: u64 = 7004;
    const E_INVALID_LEASE_DURATION: u64 = 7005;
    const E_LEASE_NOT_FOUND: u64 = 7006;
    const E_DUPLICATE_LEASE: u64 = 7007;

    // ========== Constants ==========

    const MIN_LEASE_DURATION_EPOCHS: u64 = 365;      // 1 year minimum
    const MAX_LEASE_DURATION_EPOCHS: u64 = 1095;     // 3 years maximum
    const RENEWAL_WARNING_EPOCHS: u64 = 30;          // Warn 30 epochs before expiry

    // ========== Core Structs ==========

    /// Renewal history entry
    public struct RenewalRecord has store, copy, drop {
        renewed_at_epoch: u64,
        extended_by_epochs: u64,
        new_expiry_epoch: u64,
        payment_amount: u64,
        renewed_by: address
    }

    /// Storage lease tracking for a submission
    public struct StorageLease has key, store {
        id: UID,

        // Ownership & linkage
        owner: address,
        submission_id: ID,           // Links to AudioSubmission or DatasetSubmission

        // Walrus storage details
        walrus_blob_id: String,      // Primary encrypted blob
        walrus_deal_id: String,      // Walrus storage deal identifier (if applicable)
        capacity_bytes: u64,         // Storage size in bytes

        // Lease lifecycle
        created_at_epoch: u64,
        expires_at_epoch: u64,
        lease_duration_epochs: u64,
        expiry_processed: bool,      // Prevents duplicate expiry events

        // Renewal tracking
        renewal_history: vector<RenewalRecord>,
        total_renewals: u64,

        // Economics
        lease_price_per_epoch: u64,  // Dynamic price per epoch
        total_paid: u64              // Cumulative payment for this lease
    }

    /// Shared lease registry for indexing and queries
    public struct LeaseRegistry has key {
        id: UID,
        total_leases: u64,
        active_leases: u64,
        expired_leases: u64,
        total_storage_bytes: u64,
        total_burned: u64,  // Total SONAR burned for leases

        // Lease index by submission_id
        lease_index: VecMap<ID, ID>  // submission_id -> lease_id
    }

    // ========== Events ==========

    public struct LeaseCreated has copy, drop {
        lease_id: ID,
        owner: address,
        submission_id: ID,
        walrus_blob_id: String,
        capacity_bytes: u64,
        created_at_epoch: u64,
        expires_at_epoch: u64,
        lease_duration_epochs: u64,
        initial_payment: u64
    }

    public struct LeaseRenewed has copy, drop {
        lease_id: ID,
        owner: address,
        submission_id: ID,
        renewed_at_epoch: u64,
        extended_by_epochs: u64,
        old_expiry_epoch: u64,
        new_expiry_epoch: u64,
        payment_amount: u64,
        total_renewals: u64
    }

    public struct LeaseExpiring has copy, drop {
        lease_id: ID,
        owner: address,
        submission_id: ID,
        expires_at_epoch: u64,
        epochs_remaining: u64
    }

    public struct LeaseExpired has copy, drop {
        lease_id: ID,
        owner: address,
        submission_id: ID,
        expired_at_epoch: u64
    }

    public struct RegistryInitialized has copy, drop {
        registry_id: ID
    }

    // ========== Initialization ==========

    /// Initialize the lease registry (called during module deployment)
    fun init(ctx: &mut TxContext) {
        let registry = LeaseRegistry {
            id: object::new(ctx),
            total_leases: 0,
            active_leases: 0,
            expired_leases: 0,
            total_storage_bytes: 0,
            total_burned: 0,
            lease_index: vec_map::empty()
        };

        let registry_id = object::uid_to_inner(&registry.id);

        event::emit(RegistryInitialized {
            registry_id
        });

        transfer::share_object(registry);
    }

    // ========== Public Functions ==========

    /// Create a new storage lease for a submission
    /// Called by marketplace after submission fee has been burned
    /// No additional payment required - submission fee covers storage
    #[allow(lint(self_transfer))]
    public fun create_lease(
        registry: &mut LeaseRegistry,
        submission_id: ID,
        walrus_blob_id: String,
        walrus_deal_id: String,
        capacity_bytes: u64,
        lease_duration_epochs: u64,
        ctx: &mut TxContext
    ) {
        let current_epoch = tx_context::epoch(ctx);
        let owner = tx_context::sender(ctx);

        // Validate lease duration
        assert!(
            lease_duration_epochs >= MIN_LEASE_DURATION_EPOCHS &&
            lease_duration_epochs <= MAX_LEASE_DURATION_EPOCHS,
            E_INVALID_LEASE_DURATION
        );

        // Check for duplicate lease
        assert!(
            !vec_map::contains(&registry.lease_index, &submission_id),
            E_DUPLICATE_LEASE
        );

        // Create lease object (no payment required - covered by submission fee)
        let lease = StorageLease {
            id: object::new(ctx),
            owner,
            submission_id,
            walrus_blob_id,
            walrus_deal_id,
            capacity_bytes,
            created_at_epoch: current_epoch,
            expires_at_epoch: current_epoch + lease_duration_epochs,
            lease_duration_epochs,
            expiry_processed: false,
            renewal_history: vector::empty(),
            total_renewals: 0,
            lease_price_per_epoch: 0,  // No per-epoch price
            total_paid: 0  // Covered by submission fee
        };

        let lease_id = object::uid_to_inner(&lease.id);

        // Update registry
        vec_map::insert(&mut registry.lease_index, submission_id, lease_id);
        registry.total_leases = registry.total_leases + 1;
        registry.active_leases = registry.active_leases + 1;
        registry.total_storage_bytes = registry.total_storage_bytes + capacity_bytes;

        // Emit event
        event::emit(LeaseCreated {
            lease_id,
            owner,
            submission_id,
            walrus_blob_id,
            capacity_bytes,
            created_at_epoch: current_epoch,
            expires_at_epoch: current_epoch + lease_duration_epochs,
            lease_duration_epochs,
            initial_payment: 0
        });

        // Transfer lease ownership to creator
        transfer::transfer(lease, owner);
    }

    /// Renew an existing lease
    /// Can be called by lease owner anytime before or slightly after expiry
    /// Burns 0.001% of circulating supply for renewal
    #[allow(lint(self_transfer))]
    public fun renew_lease(
        registry: &mut LeaseRegistry,
        lease: &mut StorageLease,
        extend_by_epochs: u64,
        mut payment: Coin<SONAR_TOKEN>,
        treasury_cap: &mut TreasuryCap<SONAR_TOKEN>,
        circulating_supply: u64,
        ctx: &mut TxContext
    ) {
        let current_epoch = tx_context::epoch(ctx);
        let caller = tx_context::sender(ctx);

        // Validate ownership
        assert!(lease.owner == caller, E_UNAUTHORIZED_RENEWAL);

        // Validate extension duration
        assert!(
            extend_by_epochs >= MIN_LEASE_DURATION_EPOCHS &&
            extend_by_epochs <= MAX_LEASE_DURATION_EPOCHS,
            E_INVALID_LEASE_DURATION
        );

        // Calculate required payment: 0.001% of circulating supply
        let required_payment = circulating_supply / 100_000;
        let payment_value = coin::value(&payment);

        assert!(payment_value >= required_payment, E_INSUFFICIENT_PAYMENT);

        // Split exact required amount and burn only that
        let burn_coin = coin::split(&mut payment, required_payment, ctx);
        let burn_balance = coin::into_balance(burn_coin);
        balance::decrease_supply(
            coin::supply_mut(treasury_cap),
            burn_balance
        );

        // Return excess payment to caller
        if (coin::value(&payment) > 0) {
            transfer::public_transfer(payment, caller);
        } else {
            coin::destroy_zero(payment);
        };

        // Record renewal
        let old_expiry = lease.expires_at_epoch;
        let new_expiry = lease.expires_at_epoch + extend_by_epochs;

        let renewal_record = RenewalRecord {
            renewed_at_epoch: current_epoch,
            extended_by_epochs: extend_by_epochs,
            new_expiry_epoch: new_expiry,
            payment_amount: required_payment,
            renewed_by: caller
        };

        vector::push_back(&mut lease.renewal_history, renewal_record);
        lease.expires_at_epoch = new_expiry;
        lease.total_renewals = lease.total_renewals + 1;
        lease.total_paid = lease.total_paid + required_payment;
        lease.expiry_processed = false;  // Reset expiry flag after renewal

        // Update registry
        registry.total_burned = registry.total_burned + required_payment;

        // Emit event
        event::emit(LeaseRenewed {
            lease_id: object::uid_to_inner(&lease.id),
            owner: lease.owner,
            submission_id: lease.submission_id,
            renewed_at_epoch: current_epoch,
            extended_by_epochs: extend_by_epochs,
            old_expiry_epoch: old_expiry,
            new_expiry_epoch: new_expiry,
            payment_amount: required_payment,
            total_renewals: lease.total_renewals
        });
    }

    /// Check if lease is expired and emit warning/expiry events
    /// Can be called by anyone (incentivized off-chain cron job)
    /// Takes &mut to prevent duplicate event emissions
    public entry fun check_lease_expiry(
        lease: &mut StorageLease,
        registry: &mut LeaseRegistry,
        ctx: &mut TxContext
    ) {
        let current_epoch = tx_context::epoch(ctx);
        let lease_id = object::uid_to_inner(&lease.id);

        if (current_epoch >= lease.expires_at_epoch && !lease.expiry_processed) {
            // Lease has expired (first time)
            lease.expiry_processed = true;

            event::emit(LeaseExpired {
                lease_id,
                owner: lease.owner,
                submission_id: lease.submission_id,
                expired_at_epoch: current_epoch
            });

            // Update registry counters (only once)
            if (registry.active_leases > 0) {
                registry.active_leases = registry.active_leases - 1;
                registry.expired_leases = registry.expired_leases + 1;
            };
        } else if (current_epoch + RENEWAL_WARNING_EPOCHS >= lease.expires_at_epoch
                   && current_epoch < lease.expires_at_epoch) {
            // Lease expiring soon (can emit multiple times as warning)
            let epochs_remaining = lease.expires_at_epoch - current_epoch;

            event::emit(LeaseExpiring {
                lease_id,
                owner: lease.owner,
                submission_id: lease.submission_id,
                expires_at_epoch: lease.expires_at_epoch,
                epochs_remaining
            });
        };
    }

    // ========== View Functions ==========

    /// Check if a lease is currently active
    public fun is_active(lease: &StorageLease, ctx: &TxContext): bool {
        let current_epoch = tx_context::epoch(ctx);
        current_epoch < lease.expires_at_epoch
    }

    /// Check if lease is expiring soon (within warning period)
    public fun is_expiring_soon(lease: &StorageLease, ctx: &TxContext): bool {
        let current_epoch = tx_context::epoch(ctx);
        current_epoch + RENEWAL_WARNING_EPOCHS >= lease.expires_at_epoch
            && current_epoch < lease.expires_at_epoch
    }

    /// Get epochs remaining until expiry
    public fun epochs_until_expiry(lease: &StorageLease, ctx: &TxContext): u64 {
        let current_epoch = tx_context::epoch(ctx);
        if (current_epoch >= lease.expires_at_epoch) {
            0
        } else {
            lease.expires_at_epoch - current_epoch
        }
    }


    // ========== Accessor Functions ==========

    public fun owner(lease: &StorageLease): address { lease.owner }
    public fun submission_id(lease: &StorageLease): ID { lease.submission_id }
    public fun walrus_blob_id(lease: &StorageLease): String { lease.walrus_blob_id }
    public fun capacity_bytes(lease: &StorageLease): u64 { lease.capacity_bytes }
    public fun expires_at_epoch(lease: &StorageLease): u64 { lease.expires_at_epoch }
    public fun total_renewals(lease: &StorageLease): u64 { lease.total_renewals }
    public fun total_paid(lease: &StorageLease): u64 { lease.total_paid }

    // Registry accessors
    public fun total_leases(registry: &LeaseRegistry): u64 { registry.total_leases }
    public fun active_leases(registry: &LeaseRegistry): u64 { registry.active_leases }
    public fun expired_leases(registry: &LeaseRegistry): u64 { registry.expired_leases }
    public fun total_storage_bytes(registry: &LeaseRegistry): u64 { registry.total_storage_bytes }
    public fun total_burned(registry: &LeaseRegistry): u64 { registry.total_burned }

    // ========== Admin/Testing Functions ==========

    #[test_only]
    public fun test_init(ctx: &mut TxContext) {
        init(ctx);
    }
}
