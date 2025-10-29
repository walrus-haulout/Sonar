/// SONAR Token Module
///
/// Defines the SONAR fungible token used in the SONAR Protocol marketplace.
/// Total supply: 100,000,000 SONAR (fixed, non-mintable after initialization)
/// Decimals: 9 (standard Sui token decimals)
#[allow(duplicate_alias, unused_use)]
module sonar::sonar_token {
    use std::option;
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    /// One-Time Witness for SONAR token
    /// Must be uppercase version of module name for Sui's OTW pattern
    public struct SONAR_TOKEN has drop {}

    /// Initialize the SONAR token
    /// Called once at deployment to create the currency
    /// Returns the TreasuryCap which will be used by the marketplace
    fun init(witness: SONAR_TOKEN, ctx: &mut TxContext) {
        // Create the currency with metadata
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            9,                                                      // decimals
            b"SONAR",                                               // symbol
            b"SONAR Token",                                         // name
            b"Sound Oracle Network for Audio Rewards",            // description
            option::none(),                                         // icon url (optional)
            ctx
        );

        // Freeze metadata so it cannot be changed
        transfer::public_freeze_object(metadata);

        // Transfer TreasuryCap to sender (will be used by marketplace init)
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
    }

    // ========== Test-Only Functions ==========

    #[test_only]
    /// Create SONAR currency for testing
    public fun init_for_testing(ctx: &mut TxContext): TreasuryCap<SONAR_TOKEN> {
        let witness = SONAR_TOKEN {};
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            9,
            b"SONAR",
            b"SONAR Token",
            b"Sound Oracle Network for Audio Rewards",
            option::none(),
            ctx
        );
        transfer::public_freeze_object(metadata);
        treasury_cap
    }
}
