module sonar::blob_manager {
    use std::string::String;
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::transfer;
    use sui::event;
    
    use wal::wal::WAL;
    use walrus::system::{Self, System};
    use walrus::storage_resource::Storage;

    /// Fixed submission fee for alpha phase (0.25 SUI)
    const SUBMISSION_FEE_SUI: u64 = 250_000_000;
    
    /// Recipient of submission fees
    const SUBMISSION_FEE_RECIPIENT: address = @0xca793690985183dc8e2180fd059d76f3b0644f5c2ecd3b01cdebe7d40b0cca39;

    /// Error codes
    const E_INSUFFICIENT_FEE: u64 = 1;

    /// Event emitted when blobs are registered
    public struct BlobsRegistered has copy, drop {
        uploader: address,
        main_blob_id: String,
        preview_blob_id: String,
        seal_policy_id: String,
        duration_seconds: u64,
        fee_paid_sui: u64
    }

    /// Batch register two blobs (main + preview) on Walrus with 0.25 SUI fee
    /// 
    /// **Alpha Mode**: Takes 0.25 SUI fee, emits event for off-chain points tracking
    /// **Future**: Token economics (SNR burns) will be added in a future package upgrade
    public fun batch_register_blobs(
        system: &mut System,
        
        // Main Blob Args
        storage_main: Storage,
        blob_id_main: u256,
        root_hash_main: u256,
        size_main: u64,
        encoding_type_main: u8,
        deletable_main: bool,
        walrus_blob_id_main_str: String,
        
        // Preview Blob Args
        storage_preview: Storage,
        blob_id_preview: u256,
        root_hash_preview: u256,
        size_preview: u64,
        encoding_type_preview: u8,
        deletable_preview: bool,
        walrus_blob_id_preview_str: String,
        
        // Metadata
        seal_policy_id: String,
        preview_blob_hash: vector<u8>,
        duration_seconds: u64,
        
        // Payments
        wal_payment: &mut Coin<WAL>,
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

        // 1. Register Main Blob on Walrus
        let blob_main = system::register_blob(
            system,
            storage_main,
            blob_id_main,
            root_hash_main,
            size_main,
            encoding_type_main,
            deletable_main,
            wal_payment,
            ctx
        );
        
        // 2. Register Preview Blob on Walrus
        let blob_preview = system::register_blob(
            system,
            storage_preview,
            blob_id_preview,
            root_hash_preview,
            size_preview,
            encoding_type_preview,
            deletable_preview,
            wal_payment,
            ctx
        );
        
        // Transfer the Blob objects to the uploader
        transfer::public_transfer(blob_main, uploader);
        transfer::public_transfer(blob_preview, uploader);
        
        // Emit event for off-chain points tracking
        event::emit(BlobsRegistered {
            uploader,
            main_blob_id: walrus_blob_id_main_str,
            preview_blob_id: walrus_blob_id_preview_str,
            seal_policy_id,
            duration_seconds,
            fee_paid_sui: SUBMISSION_FEE_SUI
        });
    }
}
