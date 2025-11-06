'use client';

import { useCurrentAccount } from '@mysten/dapp-kit';
import { ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatVoteCount, calculateNetScore, hasUserVoted } from '@/lib/utils/voting';
import { useVoting } from '@/hooks/useVoting';
import type { VotingStats } from '@/types/blockchain';

export interface VoteButtonProps {
  submissionId: string;
  votingStats: VotingStats;
  onVoteSuccess?: () => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * VoteButton Component
 * Reddit-style upvote/downvote button with net score display
 */
export function VoteButton({
  submissionId,
  votingStats,
  onVoteSuccess,
  size = 'md',
  className,
}: VoteButtonProps) {
  const currentAccount = useCurrentAccount();
  const { vote, isVoting } = useVoting({
    submissionId,
    onSuccess: onVoteSuccess,
  });

  const netScore = calculateNetScore(votingStats);
  const hasVoted = hasUserVoted(votingStats, currentAccount?.address);

  // Size variants
  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const iconSizes = {
    sm: 14,
    md: 18,
    lg: 22,
  };

  const handleVote = async (isUpvote: boolean) => {
    if (!currentAccount) {
      // Show connect wallet prompt
      return;
    }

    await vote(isUpvote);
  };

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1 select-none',
        sizeClasses[size],
        className
      )}
    >
      {/* Upvote Button */}
      <button
        onClick={() => handleVote(true)}
        disabled={isVoting || !currentAccount}
        className={cn(
          'p-1 rounded transition-colors group',
          'hover:bg-sonar-signal/10 disabled:opacity-40 disabled:cursor-not-allowed',
          hasVoted && 'text-sonar-highlight',
          !hasVoted && 'text-sonar-highlight-bright/60 hover:text-sonar-highlight'
        )}
        title={!currentAccount ? 'Connect wallet to vote' : 'Upvote'}
      >
        {isVoting ? (
          <Loader2
            size={iconSizes[size]}
            className="animate-spin"
          />
        ) : (
          <ChevronUp
            size={iconSizes[size]}
            className="group-hover:scale-110 transition-transform"
          />
        )}
      </button>

      {/* Net Score Display */}
      <div
        className={cn(
          'font-mono font-bold min-w-[2ch] text-center',
          netScore >= BigInt(10) && 'text-green-400',
          netScore >= BigInt(5) && netScore < BigInt(10) && 'text-sonar-highlight',
          netScore < BigInt(5) && 'text-sonar-highlight-bright/70'
        )}
      >
        {formatVoteCount(netScore)}
      </div>

      {/* Downvote Button */}
      <button
        onClick={() => handleVote(false)}
        disabled={isVoting || !currentAccount}
        className={cn(
          'p-1 rounded transition-colors group',
          'hover:bg-sonar-coral/10 disabled:opacity-40 disabled:cursor-not-allowed',
          hasVoted && 'text-sonar-coral',
          !hasVoted && 'text-sonar-highlight-bright/60 hover:text-sonar-coral'
        )}
        title={!currentAccount ? 'Connect wallet to vote' : 'Downvote'}
      >
        <ChevronDown
          size={iconSizes[size]}
          className="group-hover:scale-110 transition-transform"
        />
      </button>

      {/* Wallet Connection Prompt */}
      {!currentAccount && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="bg-sonar-abyss/90 backdrop-blur-sm border border-sonar-signal/30 rounded-sonar px-3 py-2 text-xs whitespace-nowrap">
            Connect wallet to vote
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * VoteButtonDetailed Component
 * Extended version with detailed voting stats
 */
export interface VoteButtonDetailedProps extends VoteButtonProps {
  showPercentage?: boolean;
}

export function VoteButtonDetailed({
  submissionId,
  votingStats,
  onVoteSuccess,
  showPercentage = true,
  className,
}: VoteButtonDetailedProps) {
  const currentAccount = useCurrentAccount();
  const netScore = calculateNetScore(votingStats);
  const totalVotes = votingStats.upvotes + votingStats.downvotes;
  const upvotePercentage = totalVotes > BigInt(0)
    ? Math.round((Number(votingStats.upvotes) / Number(totalVotes)) * 100)
    : 0;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-4">
        <VoteButton
          submissionId={submissionId}
          votingStats={votingStats}
          onVoteSuccess={onVoteSuccess}
          size="lg"
        />

        <div className="flex-1 space-y-1">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold text-sonar-highlight">
              {formatVoteCount(netScore)}
            </span>
            <span className="text-sm text-sonar-highlight-bright/60">
              net votes
            </span>
          </div>

          {showPercentage && totalVotes > BigInt(0) && (
            <div className="flex items-center gap-3 text-xs text-sonar-highlight-bright/70">
              <span className="font-mono">
                👍 {formatVoteCount(votingStats.upvotes)}
              </span>
              <span className="text-sonar-highlight-bright/40">•</span>
              <span className="font-mono">
                👎 {formatVoteCount(votingStats.downvotes)}
              </span>
              <span className="text-sonar-highlight-bright/40">•</span>
              <span>{upvotePercentage}% upvoted</span>
            </div>
          )}

          {!currentAccount && (
            <p className="text-xs text-sonar-coral">
              Connect your wallet to vote
            </p>
          )}
        </div>
      </div>

      {/* Graduation Status */}
      {netScore >= BigInt(10) && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded-sonar">
          <span className="text-green-400 text-sm font-mono">
            ⭐ Community Approved - Graduated to Marketplace
          </span>
        </div>
      )}
    </div>
  );
}
