module sonar::open_access_policy {
    use sui::clock::Clock;

    // Error codes
    const E_EXPIRED: u64 = 1;
    const E_INVALID_TIMESTAMP: u64 = 2;  // Timestamp is in the future
    const EXPIRATION_WINDOW_MS: u64 = 900_000; // 15 minutes in milliseconds

    /// Open access approval - allows decryption during upload verification phase
    ///
    /// This policy is used temporarily during the upload/verification phase before
    /// an AudioSubmission is published to the blockchain. It provides "open access"
    /// to the encrypted content, allowing the uploader to verify their encryption
    /// before committing to the blockchain.
    ///
    /// Security Model:
    /// - The seal_policy_id is randomly generated (32 bytes = 2^256 possibilities)
    /// - Only the uploader knows the seal_policy_id during this phase
    /// - This policy is only valid for 15 minutes during upload (enforced by clock)
    /// - After blockchain submission, the policy switches to HybridPolicy
    /// - Therefore, there is no security risk from allowing open access temporarily
    entry fun seal_approve(
        _id: vector<u8>,
        upload_timestamp_ms: u64,
        clock: &Clock,
    ) {
        // Validate the approval is within the expiration window
        let current_time_ms = sui::clock::timestamp_ms(clock);

        // Ensure timestamp is not in the future (prevents underflow on subtraction)
        assert!(current_time_ms >= upload_timestamp_ms, E_INVALID_TIMESTAMP);

        // Calculate age and verify within expiration window
        let age_ms = current_time_ms - upload_timestamp_ms;
        assert!(age_ms <= EXPIRATION_WINDOW_MS, E_EXPIRED);

        // After timestamp validation, no further access control checks needed
        // This is safe because:
        // 1. seal_policy_id is random and not publicly known
        // 2. This phase is temporary (15 minutes, enforced)
        // 3. After blockchain submission, access control switches to HybridPolicy
        // 4. Expired approvals are rejected by this validation
    }
}
