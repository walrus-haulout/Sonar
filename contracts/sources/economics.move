/// SONAR Economics Module
///
/// Implements the dynamic tier system with absolute thresholds to prevent overflow.
/// All tier thresholds are ABSOLUTE token counts (not percentages) to avoid u64 overflow.
#[allow(unused_const)]
module sonar::economics {
    /// Economic configuration with absolute thresholds
    public struct EconomicConfig has store, copy, drop {
        // Tier thresholds (absolute base units with 9 decimals)
        tier_1_floor: u64,           // 50,000,000,000,000,000 = 50M SONAR
        tier_2_floor: u64,           // 35,000,000,000,000,000 = 35M SONAR
        tier_3_floor: u64,           // 20,000,000,000,000,000 = 20M SONAR

        // Burn rates per tier (basis points: 10000 = 100%)
        tier_1_burn_bps: u64,        // 6000 = 60%
        tier_2_burn_bps: u64,        // 4500 = 45%
        tier_3_burn_bps: u64,        // 3000 = 30%
        tier_4_burn_bps: u64,        // 2000 = 20%

        // Liquidity allocation per tier (basis points)
        tier_1_liquidity_bps: u64,   // 0    = 0%
        tier_2_liquidity_bps: u64,   // 1000 = 10%
        tier_3_liquidity_bps: u64,   // 1500 = 15%
        tier_4_liquidity_bps: u64,   // 2000 = 20%

        // Treasury allocation (constant across all tiers)
        treasury_bps: u64,           // 1000 = 10%
    }

    /// Error codes
    const E_INVALID_TIER: u64 = 4001;
    const E_INVALID_BPS: u64 = 4002;

    /// Create default economic configuration
    /// Dynamic tier system with decreasing burn rates as supply increases
    /// Used during marketplace initialization
    public fun default_config(): EconomicConfig {
        EconomicConfig {
            // Tier thresholds (ABSOLUTE values in base units)
            tier_1_floor: 50_000_000_000_000_000,   // 50M SNR
            tier_2_floor: 35_000_000_000_000_000,   // 35M SNR
            tier_3_floor: 20_000_000_000_000_000,   // 20M SNR

            // Burn rates (basis points) - tier-dependent
            tier_1_burn_bps: 6000,                  // 60%
            tier_2_burn_bps: 4500,                  // 45%
            tier_3_burn_bps: 3000,                  // 30%
            tier_4_burn_bps: 2000,                  // 20%

            // Liquidity rates (basis points) - tier-dependent
            tier_1_liquidity_bps: 0,                // 0%
            tier_2_liquidity_bps: 1000,             // 10%
            tier_3_liquidity_bps: 1500,             // 15%
            tier_4_liquidity_bps: 2000,             // 20%

            // Treasury rate (constant across all tiers)
            treasury_bps: 1000,                     // 10%
        }
    }

    /// Create custom economic configuration with parameters
    /// Used for updating economic settings via admin transactions
    public fun create_config(
        tier_1_floor: u64,
        tier_2_floor: u64,
        tier_3_floor: u64,
        tier_1_burn_bps: u64,
        tier_2_burn_bps: u64,
        tier_3_burn_bps: u64,
        tier_4_burn_bps: u64,
        tier_1_liquidity_bps: u64,
        tier_2_liquidity_bps: u64,
        tier_3_liquidity_bps: u64,
        tier_4_liquidity_bps: u64,
        treasury_bps: u64
    ): EconomicConfig {
        EconomicConfig {
            tier_1_floor,
            tier_2_floor,
            tier_3_floor,
            tier_1_burn_bps,
            tier_2_burn_bps,
            tier_3_burn_bps,
            tier_4_burn_bps,
            tier_1_liquidity_bps,
            tier_2_liquidity_bps,
            tier_3_liquidity_bps,
            tier_4_liquidity_bps,
            treasury_bps
        }
    }

    /// Get current economic tier based on circulating supply
    /// Uses ABSOLUTE comparison to avoid overflow
    /// Returns: 1, 2, 3, or 4
    public fun get_tier(circulating_supply: u64, config: &EconomicConfig): u8 {
        if (circulating_supply > config.tier_1_floor) {
            1  // Early Phase: >50M
        } else if (circulating_supply > config.tier_2_floor) {
            2  // Growth Phase: 35-50M
        } else if (circulating_supply > config.tier_3_floor) {
            3  // Mature Phase: 20-35M
        } else {
            4  // Conservation: <20M
        }
    }

    /// Get burn rate (in basis points) for current circulating supply
    /// NO OVERFLOW RISK: Uses direct comparison, not multiplication
    public fun burn_bps(circulating_supply: u64, config: &EconomicConfig): u64 {
        if (circulating_supply > config.tier_1_floor) {
            config.tier_1_burn_bps      // 6000 bps = 60%
        } else if (circulating_supply > config.tier_2_floor) {
            config.tier_2_burn_bps      // 4500 bps = 45%
        } else if (circulating_supply > config.tier_3_floor) {
            config.tier_3_burn_bps      // 3000 bps = 30%
        } else {
            config.tier_4_burn_bps      // 2000 bps = 20%
        }
    }

    /// Get liquidity vault allocation rate (in basis points)
    public fun liquidity_bps(circulating_supply: u64, config: &EconomicConfig): u64 {
        if (circulating_supply > config.tier_1_floor) {
            config.tier_1_liquidity_bps      // 0 bps = 0%
        } else if (circulating_supply > config.tier_2_floor) {
            config.tier_2_liquidity_bps      // 1000 bps = 10%
        } else if (circulating_supply > config.tier_3_floor) {
            config.tier_3_liquidity_bps      // 1500 bps = 15%
        } else {
            config.tier_4_liquidity_bps      // 2000 bps = 20%
        }
    }

    /// Get treasury allocation rate (constant across all tiers)
    public fun treasury_bps(config: &EconomicConfig): u64 {
        config.treasury_bps  // Always 1000 bps = 10%
    }

    /// Get uploader share (remainder after burn + liquidity + treasury)
    /// Ensures total always equals 10000 bps (100%)
    public fun uploader_bps(circulating_supply: u64, config: &EconomicConfig): u64 {
        let burn = burn_bps(circulating_supply, config);
        let liquidity = liquidity_bps(circulating_supply, config);
        let treasury = config.treasury_bps;

        // Total must equal 10000 bps (100%)
        10_000 - burn - liquidity - treasury
    }

    /// Calculate purchase splits for a given price
    /// Returns: (burn_amount, liquidity_amount, uploader_amount, treasury_amount)
    public fun calculate_purchase_splits(
        price: u64,
        circulating_supply: u64,
        config: &EconomicConfig
    ): (u64, u64, u64, u64) {
        let burn_bp = burn_bps(circulating_supply, config);
        let liquidity_bp = liquidity_bps(circulating_supply, config);
        let uploader_bp = uploader_bps(circulating_supply, config);
        let treasury_bp = config.treasury_bps;

        // Calculate amounts
        let burn_amount = (price * burn_bp) / 10_000;
        let liquidity_amount = (price * liquidity_bp) / 10_000;
        let uploader_amount = (price * uploader_bp) / 10_000;
        let treasury_amount = (price * treasury_bp) / 10_000;

        (burn_amount, liquidity_amount, uploader_amount, treasury_amount)
    }

    /// Validate economic config (all rates must sum to 100%)
    public fun validate_config(config: &EconomicConfig): bool {
        // For each tier, burn + liquidity + treasury + uploader must equal 10000 bps
        // Check BEFORE subtraction to avoid underflow

        // Tier 1
        let tier1_total = config.tier_1_burn_bps + config.tier_1_liquidity_bps + config.treasury_bps;
        if (tier1_total > 10_000) {
            return false  // Would cause underflow
        };

        // Tier 2
        let tier2_total = config.tier_2_burn_bps + config.tier_2_liquidity_bps + config.treasury_bps;
        if (tier2_total > 10_000) {
            return false
        };

        // Tier 3
        let tier3_total = config.tier_3_burn_bps + config.tier_3_liquidity_bps + config.treasury_bps;
        if (tier3_total > 10_000) {
            return false
        };

        // Tier 4
        let tier4_total = config.tier_4_burn_bps + config.tier_4_liquidity_bps + config.treasury_bps;
        if (tier4_total > 10_000) {
            return false
        };

        true
    }

    /// Calculate reward for submission based on quality score
    /// Returns reward amount in base units
    public fun calculate_reward(circulating_supply: u64, quality_score: u8): u64 {
        if (quality_score < 30) {
            0  // Rejected
        } else if (quality_score < 50) {
            (circulating_supply * 1) / 100_000        // 0.001%
        } else if (quality_score < 70) {
            (circulating_supply * 25) / 1_000_000      // 0.0025%
        } else if (quality_score < 90) {
            (circulating_supply * 4) / 100_000         // 0.004%
        } else {
            (circulating_supply * 5) / 100_000         // 0.005%
        }
    }

    /// Calculate submission burn fee (0.001% of circulating supply)
    public fun calculate_burn_fee(circulating_supply: u64): u64 {
        (circulating_supply * 1) / 100_000  // 0.001%
    }

    // ========== Getters for Config Fields ==========

    public fun tier_1_floor(config: &EconomicConfig): u64 { config.tier_1_floor }
    public fun tier_2_floor(config: &EconomicConfig): u64 { config.tier_2_floor }
    public fun tier_3_floor(config: &EconomicConfig): u64 { config.tier_3_floor }
}
