module sonar::blob_manager {
    use std::string::String;
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::transfer;
    use sui::event;
    use walrus::system::{Self, System};
    use walrus::blob::Blob;
    use wal::wal::WAL;

    /// Minimum submission fee per file (0.25 SUI)
    const MIN_SUBMISSION_FEE_SUI: u64 = 250_000_000;
    
    /// Maximum submission fee per file (10 SUI) - for exceptional quality
    const MAX_SUBMISSION_FEE_SUI: u64 = 10_000_000_000;
    
    /// Recipient of submission fees
    const SUBMISSION_FEE_RECIPIENT: address = @0xca793690985183dc8e2180fd059d76f3b0644f5c2ecd3b01cdebe7d40b0cca39;

    /// Error codes
    const E_INSUFFICIENT_FEE: u64 = 1;
    const E_INVALID_BLOB_SIZE: u64 = 2;
    const E_INSUFFICIENT_WAL: u64 = 3;

    /// Event emitted when blobs are submitted and registered on Walrus
    public struct BlobsSubmitted has copy, drop {
        uploader: address,
        main_blob_id: String,
        preview_blob_id: String,
        seal_policy_id: String,
        duration_seconds: u64,
        fee_paid_sui: u64,
        main_blob_object_id: address,
        preview_blob_object_id: address,
        storage_epochs: u32,
    }

    /// Submit blob metadata, register blobs on Walrus, and pay fees
    /// 
    /// This function:
    /// 1. Reserves storage on Walrus (pays WAL for storage)
    /// 2. Registers the main and preview blobs on-chain
    /// 3. Collects the Sonar submission fee (0.25-10 SUI)
    /// 4. Emits event for off-chain tracking
    /// 
    /// Note: Certification (signatures from storage nodes) happens separately
    /// after the blobs are written to storage nodes.
    public fun submit_and_register_blobs(
        walrus_system: &mut System,
        main_blob_id: u256,
        main_blob_root_hash: u256,
        main_blob_size: u64,
        preview_blob_id: u256,
        preview_blob_root_hash: u256,
        preview_blob_size: u64,
        main_blob_id_str: String,
        preview_blob_id_str: String,
        seal_policy_id: String,
        duration_seconds: u64,
        encoding_type: u8,
        storage_epochs: u32,
        wal_payment: &mut Coin<WAL>,
        sui_payment: Coin<SUI>,
        ctx: &mut TxContext
    ) {
        let uploader = ctx.sender();

        // Validate and collect SUI fee (must be between MIN and MAX)
        let sui = sui_payment;
        let fee_paid = coin::value(&sui);
        assert!(fee_paid >= MIN_SUBMISSION_FEE_SUI, E_INSUFFICIENT_FEE);
        assert!(fee_paid <= MAX_SUBMISSION_FEE_SUI, E_INSUFFICIENT_FEE);
        
        // Transfer entire fee to recipient
        transfer::public_transfer(sui, SUBMISSION_FEE_RECIPIENT);

        // Calculate total storage needed (encoded size ~2x unencoded for RS2)
        let main_encoded_size = main_blob_size * 2;
        let preview_encoded_size = preview_blob_size * 2;
        let total_storage_needed = main_encoded_size + preview_encoded_size;

        // Reserve storage for both blobs (pays WAL)
        let mut storage = system::reserve_space(
            walrus_system,
            total_storage_needed,
            storage_epochs,
            wal_payment,
            ctx
        );

        // Split storage for main and preview blobs
        let preview_storage = storage.split_by_size(preview_encoded_size, ctx);

        // Register main blob (pays WAL for write)
        let main_blob = system::register_blob(
            walrus_system,
            storage,
            main_blob_id,
            main_blob_root_hash,
            main_blob_size,
            encoding_type,
            false, // deletable
            wal_payment,
            ctx
        );

        // Register preview blob (pays WAL for write)
        let preview_blob = system::register_blob(
            walrus_system,
            preview_storage,
            preview_blob_id,
            preview_blob_root_hash,
            preview_blob_size,
            encoding_type,
            false, // deletable
            wal_payment,
            ctx
        );

        // Get blob object IDs for event
        let main_blob_object_id = object::id_to_address(&object::id(&main_blob));
        let preview_blob_object_id = object::id_to_address(&object::id(&preview_blob));

        // Transfer blobs to uploader (so they can certify them later)
        transfer::public_transfer(main_blob, uploader);
        transfer::public_transfer(preview_blob, uploader);

        // Emit event for off-chain tracking (points system, future airdrop)
        event::emit(BlobsSubmitted {
            uploader,
            main_blob_id: main_blob_id_str,
            preview_blob_id: preview_blob_id_str,
            seal_policy_id,
            duration_seconds,
            fee_paid_sui: fee_paid,
            main_blob_object_id,
            preview_blob_object_id,
            storage_epochs,
        });
    }

    /// Legacy function for backward compatibility
    /// This only pays SUI fee and emits event - does NOT register blobs
    /// Use submit_and_register_blobs() for proper on-chain registration
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
        assert!(fee_paid >= MIN_SUBMISSION_FEE_SUI, E_INSUFFICIENT_FEE);
        assert!(fee_paid <= MAX_SUBMISSION_FEE_SUI, E_INSUFFICIENT_FEE);
        
        // Transfer entire fee to recipient
        transfer::public_transfer(sui, SUBMISSION_FEE_RECIPIENT);

        // Emit event (note: blobs are NOT registered on Walrus in this path)
        event::emit(BlobsSubmitted {
            uploader,
            main_blob_id,
            preview_blob_id,
            seal_policy_id,
            duration_seconds,
            fee_paid_sui: fee_paid,
            main_blob_object_id: @0x0, // Not registered
            preview_blob_object_id: @0x0, // Not registered
            storage_epochs: 0, // Not registered
        });
    }
}
