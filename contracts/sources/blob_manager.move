module sonar::blob_manager {
    use std::string::String;
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::transfer;
    use sui::event;

    /// Minimum submission fee per file (0.5 SUI)
    const MIN_SUBMISSION_FEE_SUI: u64 = 500_000_000;
    
    /// Maximum submission fee per file (10 SUI) - for exceptional quality
    const MAX_SUBMISSION_FEE_SUI: u64 = 10_000_000_000;
    
    /// Recipient of submission fees
    const SUBMISSION_FEE_RECIPIENT: address = @0xca793690985183dc8e2180fd059d76f3b0644f5c2ecd3b01cdebe7d40b0cca39;

    /// Error codes
    const E_INSUFFICIENT_FEE: u64 = 1;

    /// Event emitted when blobs are submitted
    /// Note: Blobs are already registered by the Walrus publisher
    /// This event is for off-chain tracking (points system, future airdrop)
    public struct BlobsSubmitted has copy, drop {
        uploader: address,
        main_blob_id: String,
        preview_blob_id: String,
        seal_policy_id: String,
        duration_seconds: u64,
        fee_paid_sui: u64
    }

    /// Submit blob metadata and pay fee
    /// 
    /// **Note**: The Walrus publisher already registered the blobs on-chain.
    /// This function just collects the submission fee and emits an event for tracking.
    /// 
    /// **Variable Pricing Mode**: 0.5-10 SUI fee per file based on quality
    /// Fee is calculated off-chain and validated on-chain (min/max bounds)
    /// **Future**: Token economics (SNR burns) will be added in a future package upgrade
    public fun submit_blobs(
        main_blob_id: String,
        preview_blob_id: String,
        seal_policy_id: String,
        duration_seconds: u64,
        sui_payment: Coin<SUI>,
        ctx: &mut TxContext
    ) {
        let uploader = ctx.sender();

        // Validate and collect SUI fee (must be between MIN and MAX)
        let mut sui = sui_payment;
        let fee_paid = coin::value(&sui);
        assert!(fee_paid >= MIN_SUBMISSION_FEE_SUI, E_INSUFFICIENT_FEE);
        assert!(fee_paid <= MAX_SUBMISSION_FEE_SUI, E_INSUFFICIENT_FEE);
        
        // Transfer entire fee to recipient (fee is calculated by frontend)
        transfer::public_transfer(sui, SUBMISSION_FEE_RECIPIENT);

        // Emit event for off-chain tracking (points system, future airdrop)
        event::emit(BlobsSubmitted {
            uploader,
            main_blob_id,
            preview_blob_id,
            seal_policy_id,
            duration_seconds,
            fee_paid_sui: fee_paid
        });
    }
}
