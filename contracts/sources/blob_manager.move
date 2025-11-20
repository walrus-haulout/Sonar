module sonar::blob_manager {
    use std::string::String;
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::transfer;
    use sui::event;

    /// Fixed submission fee for alpha phase (0.25 SUI)
    const SUBMISSION_FEE_SUI: u64 = 250_000_000;
    
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
    /// **Alpha Mode**: 0.25 SUI fee, emits event for off-chain points tracking
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

        // Validate and collect SUI fee
        let mut sui = sui_payment;
        let fee_paid = coin::value(&sui);
        assert!(fee_paid >= SUBMISSION_FEE_SUI, E_INSUFFICIENT_FEE);
        
        let required_fee = coin::split(&mut sui, SUBMISSION_FEE_SUI, ctx);
        transfer::public_transfer(required_fee, SUBMISSION_FEE_RECIPIENT);
        
        // Return excess SUI
        if (coin::value(&sui) > 0) {
            transfer::public_transfer(sui, uploader);
        } else {
            coin::destroy_zero(sui);
        };

        // Emit event for off-chain tracking (points system, future airdrop)
        event::emit(BlobsSubmitted {
            uploader,
            main_blob_id,
            preview_blob_id,
            seal_policy_id,
            duration_seconds,
            fee_paid_sui: SUBMISSION_FEE_SUI
        });
    }
}
