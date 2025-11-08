module sonar::purchase_policy {
    use std::string::String;

    // Error codes
    const ENoAccess: u64 = 1;

    /// Purchase receipt NFT - proves the holder has purchased access to encrypted content
    /// Transferred to buyer upon purchase
    public struct PurchaseReceipt has key, store {
        id: UID,
        /// The SEAL policy ID this receipt grants access to
        seal_policy_id: String,
        /// The submission ID this receipt is for
        submission_id: ID,
        /// Address of the purchaser
        purchaser: address,
        /// Epoch when purchased
        purchased_at_epoch: u64,
    }

    /// Create a purchase receipt for a buyer
    /// Called by marketplace::purchase_dataset after successful payment
    public(package) fun mint_receipt(
        seal_policy_id: String,
        submission_id: ID,
        purchaser: address,
        ctx: &mut TxContext
    ): PurchaseReceipt {
        PurchaseReceipt {
            id: object::new(ctx),
            seal_policy_id,
            submission_id,
            purchaser,
            purchased_at_epoch: ctx.epoch(),
        }
    }

    /// Check if the given receipt grants access to the requested identity
    fun check_policy(id: vector<u8>, receipt: &PurchaseReceipt): bool {
        // Convert seal_policy_id to bytes for comparison
        let policy_bytes = receipt.seal_policy_id.as_bytes();
        id == *policy_bytes
    }

    /// SEAL approval function - called by key servers to verify access
    /// The caller must own a PurchaseReceipt with matching seal_policy_id
    entry fun seal_approve(id: vector<u8>, receipt: &PurchaseReceipt) {
        assert!(check_policy(id, receipt), ENoAccess);
    }

    // === View Functions ===

    /// Get the seal policy ID from a receipt
    public fun seal_policy_id(receipt: &PurchaseReceipt): &String {
        &receipt.seal_policy_id
    }

    /// Get the submission ID from a receipt
    public fun submission_id(receipt: &PurchaseReceipt): ID {
        receipt.submission_id
    }

    /// Get the purchaser address from a receipt
    public fun purchaser(receipt: &PurchaseReceipt): address {
        receipt.purchaser
    }

    /// Get the purchase epoch from a receipt
    public fun purchased_at_epoch(receipt: &PurchaseReceipt): u64 {
        receipt.purchased_at_epoch
    }
}
