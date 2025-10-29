/**
 * Tier Utilities for SONAR Token Economics
 *
 * SONAR uses an absolute-threshold dynamic burn model with 3 tiers:
 * - Tier 1: 70M+ SONAR circulating → 60% burn rate
 * - Tier 2: 50M-70M SONAR → 45% burn rate
 * - Tier 3: <50M SONAR → 20% burn rate
 *
 * Absolute thresholds (not percentage-based):
 * - Tier 1→2 threshold: 70M SONAR
 * - Tier 2→3 threshold: 50M SONAR
 */

export const TIER_THRESHOLDS = {
  TIER_1_MIN: 70_000_000, // 70M SONAR - High supply, high burn
  TIER_2_MIN: 50_000_000, // 50M SONAR - Medium supply, medium burn
  TIER_3_MIN: 0,          // <50M SONAR - Low supply, low burn (scarcity protection)
} as const;

export const BURN_RATES = {
  TIER_1: 0.60, // 60% burn rate
  TIER_2: 0.45, // 45% burn rate
  TIER_3: 0.20, // 20% burn rate (minimum to preserve scarcity)
} as const;

export type TierLevel = 1 | 2 | 3;

export interface TierInfo {
  level: TierLevel;
  burnRate: number;
  minThreshold: number;
  nextThreshold: number | null;
  progress: number; // 0-100, progress toward next tier
  description: string;
  color: string; // Tailwind color class
}

/**
 * Determine current tier based on circulating supply
 * Accepts both number and bigint for flexibility
 */
export function getCurrentTier(circulatingSupply: number | bigint): TierLevel {
  const supply = typeof circulatingSupply === 'bigint' ? Number(circulatingSupply) : circulatingSupply;

  if (supply >= TIER_THRESHOLDS.TIER_1_MIN) {
    return 1;
  } else if (supply >= TIER_THRESHOLDS.TIER_2_MIN) {
    return 2;
  } else {
    return 3;
  }
}

/**
 * Get burn rate for current circulating supply
 * Accepts both number and bigint for flexibility
 */
export function getBurnRate(circulatingSupply: number | bigint): number {
  const tier = getCurrentTier(circulatingSupply);

  switch (tier) {
    case 1:
      return BURN_RATES.TIER_1;
    case 2:
      return BURN_RATES.TIER_2;
    case 3:
      return BURN_RATES.TIER_3;
  }
}

/**
 * Calculate progress toward next tier (for visual progress bars)
 * Returns 0-100 representing percentage through current tier
 * Accepts both number and bigint for flexibility
 */
export function calculateTierProgress(circulatingSupply: number | bigint): number {
  const supply = typeof circulatingSupply === 'bigint' ? Number(circulatingSupply) : circulatingSupply;
  const tier = getCurrentTier(supply);

  switch (tier) {
    case 1:
      // Tier 1 has no "next tier" - it's the starting tier
      // Progress represents distance from Tier 1→2 threshold
      // As supply decreases, progress increases toward Tier 2
      const tier1Range = 30_000_000; // Arbitrary range for visualization (70M to 100M)
      const distanceFromThreshold = supply - TIER_THRESHOLDS.TIER_1_MIN;
      return Math.min(100, Math.max(0, (distanceFromThreshold / tier1Range) * 100));

    case 2:
      // Progress from Tier 2 min (50M) toward Tier 1 min (70M)
      const tier2Range = TIER_THRESHOLDS.TIER_1_MIN - TIER_THRESHOLDS.TIER_2_MIN; // 20M range
      const tier2Progress = supply - TIER_THRESHOLDS.TIER_2_MIN;
      return (tier2Progress / tier2Range) * 100;

    case 3:
      // Progress from 0 toward Tier 2 min (50M)
      const tier3Range = TIER_THRESHOLDS.TIER_2_MIN; // 50M range
      return (supply / tier3Range) * 100;
  }
}

/**
 * Get comprehensive tier information for UI display
 * Accepts both number and bigint for flexibility
 */
export function getTierInfo(circulatingSupply: number | bigint): TierInfo {
  const level = getCurrentTier(circulatingSupply);
  const burnRate = getBurnRate(circulatingSupply);
  const progress = calculateTierProgress(circulatingSupply);

  switch (level) {
    case 1:
      return {
        level: 1,
        burnRate: BURN_RATES.TIER_1,
        minThreshold: TIER_THRESHOLDS.TIER_1_MIN,
        nextThreshold: null, // No next tier (highest tier)
        progress,
        description: 'High Supply - Maximum Burn',
        color: 'text-sonar-coral', // Coral for high burn rate
      };

    case 2:
      return {
        level: 2,
        burnRate: BURN_RATES.TIER_2,
        minThreshold: TIER_THRESHOLDS.TIER_2_MIN,
        nextThreshold: TIER_THRESHOLDS.TIER_1_MIN,
        progress,
        description: 'Medium Supply - Balanced Burn',
        color: 'text-sonar-signal', // Signal blue for medium
      };

    case 3:
      return {
        level: 3,
        burnRate: BURN_RATES.TIER_3,
        minThreshold: TIER_THRESHOLDS.TIER_3_MIN,
        nextThreshold: TIER_THRESHOLDS.TIER_2_MIN,
        progress,
        description: 'Low Supply - Scarcity Protection',
        color: 'text-sonar-highlight', // Highlight for scarcity protection
      };
  }
}

/**
 * Format SONAR amount with appropriate suffix (M, K, etc.)
 * Accepts both number and bigint for flexibility
 */
export function formatSonarAmount(amount: number | bigint | undefined | null): string {
  if (amount === undefined || amount === null) {
    return '0';
  }

  const value = typeof amount === 'bigint' ? Number(amount) : amount;

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  } else if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  } else {
    return value.toFixed(2);
  }
}

/**
 * Calculate tokens to burn from a purchase
 * Accepts both number and bigint for flexibility
 */
export function calculateBurnAmount(
  purchasePrice: number | bigint,
  circulatingSupply: number | bigint
): number {
  const price = typeof purchasePrice === 'bigint' ? Number(purchasePrice) : purchasePrice;
  const burnRate = getBurnRate(circulatingSupply);
  return price * burnRate;
}

/**
 * Calculate creator reward from a purchase
 * Accepts both number and bigint for flexibility
 */
export function calculateCreatorReward(
  purchasePrice: number | bigint,
  circulatingSupply: number | bigint
): number {
  const price = typeof purchasePrice === 'bigint' ? Number(purchasePrice) : purchasePrice;
  const burnRate = getBurnRate(circulatingSupply);
  const creatorRate = 1 - burnRate;
  return price * creatorRate;
}

/**
 * Get all tier configurations for display in economics dashboard
 */
export function getAllTierConfigs(): TierInfo[] {
  return [
    getTierInfo(80_000_000), // Tier 1 example
    getTierInfo(60_000_000), // Tier 2 example
    getTierInfo(30_000_000), // Tier 3 example
  ];
}
