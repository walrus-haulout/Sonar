// Voting stats removed - feature not implemented yet
interface VotingStats {
  upvotes: number;
  downvotes: number;
  voters: string[]; // Array of addresses that have voted
}

/**
 * Format vote count for display
 * Examples: 5 -> "5", 1000 -> "1k", 1500000 -> "1.5M"
 */
export function formatVoteCount(count: bigint): string {
  const num = Number(count);

  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }

  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}k`;
  }

  return num.toString();
}

/**
 * Calculate net score (upvotes - downvotes)
 */
export function calculateNetScore(stats: VotingStats): bigint {
  return stats.upvotes >= stats.downvotes
    ? BigInt(stats.upvotes - stats.downvotes)
    : BigInt(0);
}

/**
 * Check if submission has reached graduation threshold
 */
export function hasReachedThreshold(stats: VotingStats, threshold: bigint = BigInt(10)): boolean {
  const netScore = calculateNetScore(stats);
  return netScore >= threshold;
}

/**
 * Get vote percentage (upvotes / total votes)
 */
export function getUpvotePercentage(stats: VotingStats): number {
  const total = Number(stats.upvotes + stats.downvotes);
  if (total === 0) return 0;

  return Math.round((Number(stats.upvotes) / total) * 100);
}

/**
 * Format vote ratio for display
 * Example: "85% upvoted"
 */
export function formatVoteRatio(stats: VotingStats): string {
  const percentage = getUpvotePercentage(stats);
  return `${percentage}% upvoted`;
}

/**
 * Check if user has voted
 */
export function hasUserVoted(stats: VotingStats, userAddress?: string): boolean {
  if (!userAddress) return false;
  return stats.voters.includes(userAddress);
}

/**
 * Get vote status for UI display
 */
export function getVoteStatus(stats: VotingStats): 'positive' | 'neutral' | 'negative' {
  const netScore = calculateNetScore(stats);

  if (netScore >= BigInt(10)) return 'positive';
  if (netScore >= BigInt(5)) return 'neutral';
  return 'negative';
}
