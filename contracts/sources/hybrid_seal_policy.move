module sonar::hybrid_seal_policy {
    use std::string::String;
    use std::vector;

    // Error codes
    const ENoAccess: u64 = 1;
    const ENotAdmin: u64 = 2;
    const EWrongVersion: u64 = 3;

    const VERSION: u64 = 1;

    /// Hybrid policy object that supports multiple access methods
    /// - Admin whitelist access (SONAR team for verification/training)
    /// - Purchase receipt access (marketplace buyers)
    public struct HybridPolicy has key {
        id: UID,
        version: u64,
        submission_id: ID,
        seal_policy_id: String,

        // Admin whitelist - SONAR team addresses that can decrypt for verification
        admin_whitelist: vector<address>,

        // Purchase policy - whether marketplace purchases grant access
        purchase_enabled: bool,
    }

    /// Admin cap for managing the whitelist
    public struct AdminCap has key, store {
        id: UID,
        policy_id: ID,
    }

    /// Create a new hybrid policy object
    /// Called during submission creation to set up encryption policy
    public fun create_policy(
        submission_id: ID,
        seal_policy_id: String,
        admin_addresses: vector<address>,
        ctx: &mut TxContext
    ): (HybridPolicy, AdminCap) {
        let policy = HybridPolicy {
            id: object::new(ctx),
            version: VERSION,
            submission_id,
            seal_policy_id,
            admin_whitelist: admin_addresses,
            purchase_enabled: true,
        };

        let policy_id = object::id(&policy);
        let cap = AdminCap {
            id: object::new(ctx),
            policy_id,
        };

        (policy, cap)
    }

    /// Add address to admin whitelist
    public fun add_admin(
        policy: &mut HybridPolicy,
        cap: &AdminCap,
        admin_address: address,
    ) {
        assert!(cap.policy_id == object::id(policy), ENoAccess);
        if (!vector::contains(&policy.admin_whitelist, &admin_address)) {
            vector::push_back(&mut policy.admin_whitelist, admin_address);
        }
    }

    /// Remove address from admin whitelist
    public fun remove_admin(
        policy: &mut HybridPolicy,
        cap: &AdminCap,
        admin_address: address,
    ) {
        assert!(cap.policy_id == object::id(policy), ENoAccess);

        let (found, index) = vector::index_of(&policy.admin_whitelist, &admin_address);
        if (found) {
            vector::remove(&mut policy.admin_whitelist, index);
        }
    }

    /// Enable/disable purchase-based access
    public fun set_purchase_enabled(
        policy: &mut HybridPolicy,
        cap: &AdminCap,
        enabled: bool,
    ) {
        assert!(cap.policy_id == object::id(policy), ENoAccess);
        policy.purchase_enabled = enabled;
    }

    /// Check if address is in admin whitelist
    fun is_admin(policy: &HybridPolicy, addr: address): bool {
        vector::contains(&policy.admin_whitelist, &addr)
    }

    /// Check if the given receipt grants access to the requested identity
    fun check_purchase_policy(id: vector<u8>, policy: &HybridPolicy, receipt: &sonar::purchase_policy::PurchaseReceipt): bool {
        // Verify purchase is enabled
        if (!policy.purchase_enabled) {
            return false
        };

        // Convert seal_policy_id to bytes for comparison
        let policy_bytes = policy.seal_policy_id.as_bytes();

        // Verify receipt matches this policy
        if (id != *policy_bytes) {
            return false
        };

        // Verify receipt seal_policy_id matches
        let receipt_policy = sonar::purchase_policy::seal_policy_id(receipt);
        receipt_policy == &policy.seal_policy_id
    }

    // === SEAL Approval Functions ===
    // These are called by Seal key servers to verify access permissions

    /// SEAL approval for admin access (SONAR team)
    /// Used for verification and AI model training
    entry fun seal_approve_admin(
        id: vector<u8>,
        policy: &HybridPolicy,
        ctx: &TxContext
    ) {
        assert!(policy.version == VERSION, EWrongVersion);
        assert!(is_admin(policy, tx_context::sender(ctx)), ENotAdmin);

        // Verify the identity matches this policy
        let policy_bytes = policy.seal_policy_id.as_bytes();
        assert!(id == *policy_bytes, ENoAccess);
    }

    /// SEAL approval for purchase access (marketplace buyers)
    /// User must own a PurchaseReceipt NFT
    entry fun seal_approve_purchase(
        id: vector<u8>,
        policy: &HybridPolicy,
        receipt: &sonar::purchase_policy::PurchaseReceipt
    ) {
        assert!(policy.version == VERSION, EWrongVersion);
        assert!(check_purchase_policy(id, policy, receipt), ENoAccess);
    }

    // === View Functions ===

    public fun seal_policy_id(policy: &HybridPolicy): &String {
        &policy.seal_policy_id
    }

    public fun submission_id(policy: &HybridPolicy): ID {
        policy.submission_id
    }

    public fun is_purchase_enabled(policy: &HybridPolicy): bool {
        policy.purchase_enabled
    }

    public fun admin_whitelist(policy: &HybridPolicy): &vector<address> {
        &policy.admin_whitelist
    }

    public fun version(policy: &HybridPolicy): u64 {
        policy.version
    }
}
