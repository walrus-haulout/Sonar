/**
 * Leaderboard Service
 * Provides access to user rankings, tier progression, and leaderboard data
 */

import { prisma } from '../lib/db';
import type { LeaderboardEntry, UserRankInfo, TierProgress, LeaderboardResponse } from '../types/leaderboard';

/**
 * Get global leaderboard with optional tier filtering
 */
export async function getGlobalLeaderboard(
  limit: number = 100,
  offset: number = 0,
  tier?: string
): Promise<LeaderboardResponse> {
  try {
    const whereClause = tier ? `WHERE tier = '${tier}'` : '';

    const entries = await prisma.$queryRawUnsafe(
      `
      SELECT
        ROW_NUMBER() OVER (ORDER BY total_points DESC) as rank,
        wallet_address,
        username,
        total_points,
        total_submissions,
        average_rarity_score,
        tier,
        first_bulk_contributions,
        rare_subject_contributions
      FROM users
      ${whereClause}
      ORDER BY total_points DESC
      LIMIT $1 OFFSET $2
      `,
      limit,
      offset
    ) as LeaderboardEntry[];

    const totalResult = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as count FROM users ${whereClause}`
    ) as [{ count: bigint }];

    const total = Number(totalResult[0]?.count || 0);

    return {
      entries,
      total,
      limit,
      offset,
    };
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    throw new Error('Failed to fetch leaderboard');
  }
}

/**
 * Get user's ranking and tier progression info
 */
export async function getUserRankInfo(walletAddress: string): Promise<UserRankInfo | null> {
  try {
    const user = await prisma.$queryRawUnsafe(
      `
      SELECT
        ROW_NUMBER() OVER (ORDER BY total_points DESC) as rank,
        wallet_address,
        username,
        total_points,
        total_submissions,
        average_rarity_score,
        tier,
        first_bulk_contributions,
        rare_subject_contributions
      FROM users
      WHERE wallet_address = $1
      `,
      walletAddress
    ) as LeaderboardEntry[];

    if (!user || user.length === 0) {
      return null;
    }

    const userEntry = user[0];
    const tierProgress = await calculateTierProgress(userEntry.tier, userEntry.total_points);

    return {
      ...userEntry,
      tier_progress: tierProgress,
    };
  } catch (error) {
    console.error('Error fetching user rank:', error);
    throw new Error('Failed to fetch user rank');
  }
}

/**
 * Search users by username or wallet address
 */
export async function searchLeaderboard(query: string, limit: number = 20): Promise<LeaderboardEntry[]> {
  try {
    const searchQuery = `%${query}%`;

    const results = await prisma.$queryRawUnsafe(
      `
      SELECT
        ROW_NUMBER() OVER (ORDER BY total_points DESC) as rank,
        wallet_address,
        username,
        total_points,
        total_submissions,
        average_rarity_score,
        tier,
        first_bulk_contributions,
        rare_subject_contributions
      FROM users
      WHERE username ILIKE $1 OR wallet_address ILIKE $1
      ORDER BY total_points DESC
      LIMIT $2
      `,
      searchQuery,
      limit
    ) as LeaderboardEntry[];

    return results;
  } catch (error) {
    console.error('Error searching leaderboard:', error);
    throw new Error('Failed to search leaderboard');
  }
}

/**
 * Get tier distribution
 */
export async function getTierDistribution(): Promise<Record<string, number>> {
  try {
    const distribution = await prisma.$queryRawUnsafe(
      `
      SELECT tier, COUNT(*) as count
      FROM users
      GROUP BY tier
      ORDER BY tier
      `
    ) as Array<{ tier: string; count: bigint }>;

    const result: Record<string, number> = {};
    distribution.forEach((row: { tier: string; count: bigint }) => {
      result[row.tier] = Number(row.count);
    });

    return result;
  } catch (error) {
    console.error('Error fetching tier distribution:', error);
    throw new Error('Failed to fetch tier distribution');
  }
}

/**
 * Calculate tier progress for a user
 */
async function calculateTierProgress(currentTier: string, totalPoints: number): Promise<TierProgress> {
  const tierThresholds: Record<string, { min: number; next: string | null; nextThreshold: number }> = {
    Contributor: { min: 0, next: 'Bronze', nextThreshold: 1000 },
    Bronze: { min: 1000, next: 'Silver', nextThreshold: 5000 },
    Silver: { min: 5000, next: 'Gold', nextThreshold: 10000 },
    Gold: { min: 10000, next: 'Platinum', nextThreshold: 25000 },
    Platinum: { min: 25000, next: 'Diamond', nextThreshold: 50000 },
    Diamond: { min: 50000, next: 'Legend', nextThreshold: 100000 },
    Legend: { min: 100000, next: null, nextThreshold: 100000 },
  };

  const tier = tierThresholds[currentTier];
  if (!tier) {
    return {
      current_tier: 'Contributor' as any,
      next_tier: 'Bronze' as any,
      points_needed: 1000,
      progress_percent: 0,
    };
  }

  const nextTier = tier.next;
  const pointsNeeded = tier.nextThreshold - totalPoints;
  const progressPercent = nextTier
    ? Math.round(((totalPoints - tier.min) / (tier.nextThreshold - tier.min)) * 100)
    : 100;

  return {
    current_tier: currentTier as any,
    next_tier: nextTier as any,
    points_needed: Math.max(0, pointsNeeded),
    progress_percent: Math.min(100, Math.max(0, progressPercent)),
  };
}
