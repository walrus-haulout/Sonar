/// SONAR Deletion Proofs Module
///
/// Manages proofs of plaintext deletion from Walrus storage.
/// Ensures data privacy by requiring cryptographic proof that raw audio was deleted
/// before allowing encrypted version to be published.
#[allow(unused_const, duplicate_alias)]
module sonar::deletion_proofs {
    use std::option::{Self, Option};
    use std::string::{Self, String};
    use std::vector;
    use sui::bcs;
    use sui::event;
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::hash;
    use sui::vec_map::{Self, VecMap};

    // ========== Error Codes ==========

    // Deletion proof errors (9000-9999)
    const E_INVALID_PROOF_HASH: u64 = 9001;
    const E_PROOF_EXPIRED: u64 = 9002;
    const E_UNAUTHORIZED: u64 = 9003;
    const E_DUPLICATE_PROOF: u64 = 9004;
    const E_INVALID_SIGNATURE: u64 = 9005;

    // ========== Constants ==========

    const PROOF_VALIDITY_EPOCHS: u64 = 7;  // Proof valid for 7 epochs (~7 days)
    const MIN_PROOF_HASH_LENGTH: u64 = 32; // SHA-256 = 32 bytes

    // ========== Core Structs ==========

    /// Verifier capability for signing deletion proofs
    public struct VerifierCap has key, store {
        id: UID,
        verifier_address: address
    }

    /// Deletion receipt proving plaintext was removed from Walrus
    public struct DeletionReceipt has key, store {
        id: UID,

        // Linked session
        session_id: ID,
        owner: address,

        // Deletion details
        plaintext_cid: String,           // Walrus blob ID that was deleted
        deletion_proof_hash: vector<u8>, // SHA-256 hash of Walrus deletion API response
        verifier_signature: vector<u8>,  // Ed25519 signature from verifier
        verifier_address: address,       // Verifier who signed this proof

        // Metadata
        deleted_at_epoch: u64,
        proof_expires_at_epoch: u64,
        walrus_deletion_timestamp: u64,  // Unix timestamp from Walrus API

        // Validation
        verified: bool                   // Set to true after validation
    }

    /// Registry for deletion proofs
    public struct ProofRegistry has key {
        id: UID,
        total_proofs: u64,
        verified_proofs: u64,
        expired_proofs: u64,

        // Index by session_id to prevent duplicates
        session_proofs: VecMap<ID, ID>,  // session_id -> receipt_id

        // Authorized verifiers
        authorized_verifiers: vector<address>
    }

    // ========== Events ==========

    public struct ProofSubmitted has copy, drop {
        receipt_id: ID,
        session_id: ID,
        owner: address,
        plaintext_cid: String,
        deletion_proof_hash: vector<u8>,
        verifier_address: address,
        deleted_at_epoch: u64
    }

    public struct ProofVerified has copy, drop {
        receipt_id: ID,
        session_id: ID,
        verified_at_epoch: u64
    }

    public struct ProofExpired has copy, drop {
        receipt_id: ID,
        session_id: ID,
        expired_at_epoch: u64
    }

    public struct VerifierAuthorized has copy, drop {
        verifier_address: address,
        authorized_at_epoch: u64
    }

    public struct VerifierRevoked has copy, drop {
        verifier_address: address,
        revoked_at_epoch: u64
    }

    public struct RegistryInitialized has copy, drop {
        registry_id: ID
    }

    // ========== Initialization ==========

    fun init(ctx: &mut TxContext) {
        let registry = ProofRegistry {
            id: object::new(ctx),
            total_proofs: 0,
            verified_proofs: 0,
            expired_proofs: 0,
            session_proofs: vec_map::empty(),
            authorized_verifiers: vector::empty()
        };

        let registry_id = object::uid_to_inner(&registry.id);

        event::emit(RegistryInitialized {
            registry_id
        });

        transfer::share_object(registry);

        // Create and transfer VerifierCap to deployer
        let deployer = tx_context::sender(ctx);
        let verifier_cap = VerifierCap {
            id: object::new(ctx),
            verifier_address: deployer
        };

        transfer::transfer(verifier_cap, deployer);
    }

    // ========== Public Functions ==========

    /// Submit a deletion receipt from verifier
    /// Called by off-chain verifier after deleting plaintext from Walrus
    public entry fun submit_deletion_receipt(
        _cap: &VerifierCap,
        registry: &mut ProofRegistry,
        session_id: ID,
        owner: address,
        plaintext_cid: String,
        deletion_proof_hash: vector<u8>,
        verifier_signature: vector<u8>,
        walrus_deletion_timestamp: u64,
        ctx: &mut TxContext
    ) {
        let current_epoch = tx_context::epoch(ctx);
        let verifier_address = tx_context::sender(ctx);

        // Validate verifier is authorized
        assert!(
            vector::contains(&registry.authorized_verifiers, &verifier_address),
            E_UNAUTHORIZED
        );

        // Validate proof hash length
        assert!(
            vector::length(&deletion_proof_hash) >= MIN_PROOF_HASH_LENGTH,
            E_INVALID_PROOF_HASH
        );

        // Check for duplicate (one proof per session)
        assert!(
            !vec_map::contains(&registry.session_proofs, &session_id),
            E_DUPLICATE_PROOF
        );

        // Create receipt
        let receipt = DeletionReceipt {
            id: object::new(ctx),
            session_id,
            owner,
            plaintext_cid,
            deletion_proof_hash,
            verifier_signature,
            verifier_address,
            deleted_at_epoch: current_epoch,
            proof_expires_at_epoch: current_epoch + PROOF_VALIDITY_EPOCHS,
            walrus_deletion_timestamp,
            verified: false  // Will be verified later
        };

        let receipt_id = object::uid_to_inner(&receipt.id);

        // Update registry
        vec_map::insert(&mut registry.session_proofs, session_id, receipt_id);
        registry.total_proofs = registry.total_proofs + 1;

        // Emit event
        event::emit(ProofSubmitted {
            receipt_id,
            session_id,
            owner,
            plaintext_cid,
            deletion_proof_hash,
            verifier_address,
            deleted_at_epoch: current_epoch
        });

        // Transfer receipt to owner
        transfer::transfer(receipt, owner);
    }

    /// Verify a deletion receipt
    /// Can be called by anyone to trigger verification logic
    /// In production, would verify Ed25519 signature and check Walrus deletion status
    public entry fun verify_receipt(
        registry: &mut ProofRegistry,
        receipt: &mut DeletionReceipt,
        ctx: &mut TxContext
    ) {
        let current_epoch = tx_context::epoch(ctx);

        // Check not expired
        assert!(
            current_epoch < receipt.proof_expires_at_epoch,
            E_PROOF_EXPIRED
        );

        // TODO: In production, verify Ed25519 signature:
        // sui::ed25519::ed25519_verify(&receipt.verifier_signature, &receipt.verifier_address, &receipt.deletion_proof_hash)

        // TODO: In production, verify Walrus deletion via oracle or cross-chain query

        // Mark as verified
        receipt.verified = true;
        registry.verified_proofs = registry.verified_proofs + 1;

        // Emit event
        event::emit(ProofVerified {
            receipt_id: object::uid_to_inner(&receipt.id),
            session_id: receipt.session_id,
            verified_at_epoch: current_epoch
        });
    }

    /// Check if proof is expired
    public entry fun check_expiry(
        registry: &mut ProofRegistry,
        receipt: &DeletionReceipt,
        ctx: &mut TxContext
    ) {
        let current_epoch = tx_context::epoch(ctx);

        if (current_epoch >= receipt.proof_expires_at_epoch && !receipt.verified) {
            registry.expired_proofs = registry.expired_proofs + 1;

            event::emit(ProofExpired {
                receipt_id: object::uid_to_inner(&receipt.id),
                session_id: receipt.session_id,
                expired_at_epoch: current_epoch
            });
        };
    }

    /// Authorize a new verifier
    /// Called by admin/governance to add trusted verifiers
    public entry fun authorize_verifier(
        _cap: &VerifierCap,
        registry: &mut ProofRegistry,
        verifier_address: address,
        ctx: &mut TxContext
    ) {
        let current_epoch = tx_context::epoch(ctx);

        // Add to authorized list
        if (!vector::contains(&registry.authorized_verifiers, &verifier_address)) {
            vector::push_back(&mut registry.authorized_verifiers, verifier_address);

            event::emit(VerifierAuthorized {
                verifier_address,
                authorized_at_epoch: current_epoch
            });
        };
    }

    /// Revoke a verifier's authorization
    public entry fun revoke_verifier(
        _cap: &VerifierCap,
        registry: &mut ProofRegistry,
        verifier_address: address,
        ctx: &mut TxContext
    ) {
        let current_epoch = tx_context::epoch(ctx);

        // Remove from authorized list
        let (found, idx) = vector::index_of(&registry.authorized_verifiers, &verifier_address);
        if (found) {
            vector::remove(&mut registry.authorized_verifiers, idx);

            event::emit(VerifierRevoked {
                verifier_address,
                revoked_at_epoch: current_epoch
            });
        };
    }

    // ========== View Functions ==========

    /// Check if a verifier is authorized
    public fun is_authorized_verifier(
        registry: &ProofRegistry,
        verifier_address: address
    ): bool {
        vector::contains(&registry.authorized_verifiers, &verifier_address)
    }

    /// Check if proof is valid and verified
    public fun is_valid_proof(receipt: &DeletionReceipt, ctx: &TxContext): bool {
        let current_epoch = tx_context::epoch(ctx);
        receipt.verified && current_epoch < receipt.proof_expires_at_epoch
    }

    /// Check if session has a deletion receipt
    public fun has_deletion_receipt(
        registry: &ProofRegistry,
        session_id: ID
    ): bool {
        vec_map::contains(&registry.session_proofs, &session_id)
    }

    /// Get receipt ID for a session
    public fun get_receipt_id(
        registry: &ProofRegistry,
        session_id: ID
    ): Option<ID> {
        if (vec_map::contains(&registry.session_proofs, &session_id)) {
            option::some(*vec_map::get(&registry.session_proofs, &session_id))
        } else {
            option::none()
        }
    }

    // ========== Accessor Functions ==========

    public fun session_id(receipt: &DeletionReceipt): ID { receipt.session_id }
    public fun owner(receipt: &DeletionReceipt): address { receipt.owner }
    public fun plaintext_cid(receipt: &DeletionReceipt): String { receipt.plaintext_cid }
    public fun deletion_proof_hash(receipt: &DeletionReceipt): vector<u8> { receipt.deletion_proof_hash }
    public fun verifier_address(receipt: &DeletionReceipt): address { receipt.verifier_address }
    public fun verified(receipt: &DeletionReceipt): bool { receipt.verified }
    public fun deleted_at_epoch(receipt: &DeletionReceipt): u64 { receipt.deleted_at_epoch }
    public fun proof_expires_at_epoch(receipt: &DeletionReceipt): u64 { receipt.proof_expires_at_epoch }

    // Registry accessors
    public fun total_proofs(registry: &ProofRegistry): u64 { registry.total_proofs }
    public fun verified_proofs(registry: &ProofRegistry): u64 { registry.verified_proofs }
    public fun expired_proofs(registry: &ProofRegistry): u64 { registry.expired_proofs }

    // ========== Helper Functions ==========

    /// Generate deterministic proof hash from deletion metadata
    /// Used by off-chain verifier to create consistent hashes
    public fun generate_proof_hash(
        plaintext_cid: String,
        walrus_deletion_timestamp: u64,
        session_id: ID
    ): vector<u8> {
        // Concatenate inputs
        let mut data = vector::empty<u8>();
        vector::append(&mut data, *string::as_bytes(&plaintext_cid));
        vector::append(&mut data, bcs::to_bytes(&walrus_deletion_timestamp));
        vector::append(&mut data, bcs::to_bytes(&session_id));

        // Hash with Keccak256 (SHA3-256 is not available in sui::hash)
        hash::keccak256(&data)
    }

    // ========== Admin/Testing Functions ==========

    #[test_only]
    public fun test_init(ctx: &mut TxContext) {
        init(ctx);
    }

    #[test_only]
    public fun create_verifier_cap_for_testing(ctx: &mut TxContext): VerifierCap {
        VerifierCap {
            id: object::new(ctx),
            verifier_address: tx_context::sender(ctx)
        }
    }
}
