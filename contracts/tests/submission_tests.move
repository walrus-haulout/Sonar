/// SONAR Submission Tests
///
/// Tests for audio submission, finalization, and vesting mechanics
#[test_only]
#[allow(unused_use, unused_variable)]
module sonar::submission_tests {
    use std::option;
    use std::string;
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sonar::sonar_token;
    use sonar::marketplace::{
        Self,
        QualityMarketplace,
        AudioSubmission,
        ValidatorCap,
        AdminCap
    };

    // Test addresses
    const ADMIN: address = @0xAD;
    const UPLOADER: address = @0x1;
    const VALIDATOR: address = @0x2;

    /// Initialize marketplace for testing
    fun setup_marketplace(scenario: &mut Scenario) {
        ts::next_tx(scenario, ADMIN);
        {
            // Create treasury cap
            let treasury_cap = sonar_token::init_for_testing(ts::ctx(scenario));

            // Initialize marketplace
            marketplace::initialize_marketplace(
                treasury_cap,
                ADMIN,      // team_wallet
                ADMIN,      // treasury_address
                ts::ctx(scenario)
            );
        };
    }

    /// Test successful audio submission
    #[test]
    fun test_submit_audio_success() {
        let mut scenario = ts::begin(ADMIN);
        setup_marketplace(&mut scenario);

        // Uploader needs SUI for submission fee
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut marketplace = ts::take_shared<QualityMarketplace>(&scenario);
            let submission_fee = coin::mint_for_testing<SUI>(
                250_000_000, // 0.25 SUI
                ts::ctx(&mut scenario)
            );

            // Transfer to uploader
            sui::transfer::public_transfer(submission_fee, UPLOADER);
            ts::return_shared(marketplace);
        };

        // Submit audio
        ts::next_tx(&mut scenario, UPLOADER);
        {
            let mut marketplace = ts::take_shared<QualityMarketplace>(&scenario);
            let submission_fee = ts::take_from_sender<Coin<SUI>>(&scenario);

            marketplace::submit_audio(
                &mut marketplace,
                submission_fee,
                string::utf8(b"walrus_blob_xyz"),
                string::utf8(b"preview_blob_xyz"),
                string::utf8(b"seal_policy_xyz"),
                option::some(b"preview_hash_abc"),
                180,  // 3 minutes
                ts::ctx(&mut scenario)
            );

            // Verify stats
            let (total_submissions, _, total_burned, _, _) =
                marketplace::get_marketplace_stats(&marketplace);
            assert!(total_submissions == 1, 0);
            assert!(total_burned == 0, 1);

            ts::return_shared(marketplace);
        };

        ts::end(scenario);
    }

    /// Test finalization with quality score
    #[test]
    fun test_finalize_submission_approved() {
        let mut scenario = ts::begin(ADMIN);
        setup_marketplace(&mut scenario);

        // Submit audio first
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut marketplace = ts::take_shared<QualityMarketplace>(&scenario);
            let submission_fee = coin::mint_for_testing<SUI>(
                250_000_000, // 0.25 SUI
                ts::ctx(&mut scenario)
            );
            marketplace::submit_audio(
                &mut marketplace,
                submission_fee,
                string::utf8(b"walrus_blob_123"),
                string::utf8(b"preview_blob_123"),
                string::utf8(b"seal_policy_xyz"),
                option::some(b"preview_hash"),
                180,
                ts::ctx(&mut scenario)
            );

            ts::return_shared(marketplace);
        };

        // Finalize with quality score
        ts::next_tx(&mut scenario, VALIDATOR);
        {
            let mut marketplace = ts::take_shared<QualityMarketplace>(&scenario);
            let validator_cap = ts::take_from_address<ValidatorCap>(&scenario, ADMIN);
            let mut submission = ts::take_from_address<AudioSubmission>(&scenario, ADMIN);

            marketplace::finalize_submission(
                &validator_cap,
                &mut marketplace,
                &mut submission,
                85,  // Good quality score
                ts::ctx(&mut scenario)
            );

            // Check submission status
            let (_, quality_score, status, _, _, _) =
                marketplace::get_submission_info(&submission);
            assert!(quality_score == 85, 0);
            assert!(status == 1, 1);  // Approved

            // Check vesting
            let (total_vested, claimed, claimable) =
                marketplace::get_vesting_info(&submission, ts::ctx(&mut scenario));
            assert!(total_vested > 0, 2);
            assert!(claimed == 0, 3);
            assert!(claimable == 0, 4);  // Nothing unlocked yet (epoch 0)

            ts::return_to_address(ADMIN, submission);
            ts::return_to_address(ADMIN, validator_cap);
            ts::return_shared(marketplace);
        };

        ts::end(scenario);
    }

    /// Test finalization with low quality (rejected)
    #[test]
    fun test_finalize_submission_rejected() {
        let mut scenario = ts::begin(ADMIN);
        setup_marketplace(&mut scenario);

        // Submit and finalize with low score
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut marketplace = ts::take_shared<QualityMarketplace>(&scenario);
            let submission_fee = coin::mint_for_testing<SUI>(
                250_000_000, // 0.25 SUI
                ts::ctx(&mut scenario)
            );
            marketplace::submit_audio(
                &mut marketplace,
                submission_fee,
                string::utf8(b"walrus_blob_456"),
                string::utf8(b"preview_blob_456"),
                string::utf8(b"seal_policy"),
                option::some(b"hash"),
                60,
                ts::ctx(&mut scenario)
            );

            ts::return_shared(marketplace);
        };

        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut marketplace = ts::take_shared<QualityMarketplace>(&scenario);
            let validator_cap = ts::take_from_sender<ValidatorCap>(&scenario);
            let mut submission = ts::take_from_sender<AudioSubmission>(&scenario);

            marketplace::finalize_submission(
                &validator_cap,
                &mut marketplace,
                &mut submission,
                20,  // Low quality
                ts::ctx(&mut scenario)
            );

            // Check rejection
            let (_, quality_score, status, _, _, _) =
                marketplace::get_submission_info(&submission);
            assert!(quality_score == 20, 0);
            assert!(status == 2, 1);  // Rejected

            // Check no vesting
            let (total_vested, _, _) =
                marketplace::get_vesting_info(&submission, ts::ctx(&mut scenario));
            assert!(total_vested == 0, 2);

            ts::return_to_sender(&scenario, submission);
            ts::return_to_sender(&scenario, validator_cap);
            ts::return_shared(marketplace);
        };

        ts::end(scenario);
    }

    /// Test vesting unlock over time
    #[test]
    fun test_vesting_linear_unlock() {
        let mut scenario = ts::begin(ADMIN);
        setup_marketplace(&mut scenario);

        // Submit and finalize
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut marketplace = ts::take_shared<QualityMarketplace>(&scenario);
            let submission_fee = coin::mint_for_testing<SUI>(
                250_000_000, // 0.25 SUI
                ts::ctx(&mut scenario)
            );
            marketplace::submit_audio(
                &mut marketplace,
                submission_fee,
                string::utf8(b"walrus_blob_789"),
                string::utf8(b"preview_blob_789"),
                string::utf8(b"seal"),
                option::some(b"hash"),
                120,
                ts::ctx(&mut scenario)
            );

            ts::return_shared(marketplace);
        };

        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut marketplace = ts::take_shared<QualityMarketplace>(&scenario);
            let validator_cap = ts::take_from_sender<ValidatorCap>(&scenario);
            let mut submission = ts::take_from_sender<AudioSubmission>(&scenario);

            let circulating = marketplace::get_circulating_supply(&marketplace);

            marketplace::finalize_submission(
                &validator_cap,
                &mut marketplace,
                &mut submission,
                90,  // Excellent quality
                ts::ctx(&mut scenario)
            );

            let (total_vested, _, _) =
                marketplace::get_vesting_info(&submission, ts::ctx(&mut scenario));
            let expected_reward = (circulating * 5) / 100_000;  // 0.005% for 90+ score
            assert!(total_vested == expected_reward, 0);

            ts::return_to_sender(&scenario, submission);
            ts::return_to_sender(&scenario, validator_cap);
            ts::return_shared(marketplace);
        };

        // Advance 45 epochs (50% vested)
        ts::next_epoch(&mut scenario, ADMIN);
        let mut i = 0;
        while (i < 44) {
            ts::next_epoch(&mut scenario, ADMIN);
            i = i + 1;
        };

        ts::next_tx(&mut scenario, ADMIN);
        {
            let submission = ts::take_from_sender<AudioSubmission>(&scenario);
            let (total_vested, _, claimable) =
                marketplace::get_vesting_info(&submission, ts::ctx(&mut scenario));

            // Should be ~50% unlocked
            let expected_unlocked = total_vested / 2;
            assert!(claimable >= expected_unlocked - 1000 && claimable <= expected_unlocked + 1000, 1);

            ts::return_to_sender(&scenario, submission);
        };

        ts::end(scenario);
    }

}
