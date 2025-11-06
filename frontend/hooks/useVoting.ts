'use client';

import { useState, useCallback } from 'react';
import { useSignAndExecuteTransaction, useCurrentAccount } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { toast } from 'sonner';

// Updated 2025-11-06: Package upgraded with voting functionality
const SONAR_PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID ||
  '0x300b8182eea252a00d5ff19568126cc20c0bdd19c7e25f6c6953363393d344e6';

export interface UseVotingOptions {
  submissionId: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export interface UseVotingResult {
  vote: (isUpvote: boolean) => Promise<void>;
  removeVote: (wasUpvote: boolean) => Promise<void>;
  isVoting: boolean;
  isRemoving: boolean;
}

/**
 * Hook for voting on audio submissions
 * Handles on-chain transactions via Sui wallet
 */
export function useVoting({ submissionId, onSuccess, onError }: UseVotingOptions): UseVotingResult {
  const currentAccount = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const [isVoting, setIsVoting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const vote = useCallback(async (isUpvote: boolean) => {
    if (!currentAccount) {
      toast.error('Please connect your wallet to vote');
      return;
    }

    setIsVoting(true);

    try {
      const tx = new Transaction();

      tx.moveCall({
        target: `${SONAR_PACKAGE_ID}::marketplace::vote_on_submission`,
        arguments: [
          tx.object(submissionId),
          tx.pure.bool(isUpvote),
        ],
      });

      const result = await signAndExecute({
        transaction: tx,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      if (result.effects?.status.status === 'success') {
        toast.success(isUpvote ? 'Upvoted!' : 'Downvoted!');
        onSuccess?.();
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error: any) {
      console.error('Vote error:', error);

      // Handle specific error cases
      if (error.message?.includes('E_CANNOT_VOTE_OWN_SUBMISSION')) {
        toast.error('You cannot vote on your own submission');
      } else if (error.message?.includes('rejected')) {
        toast.error('Transaction rejected');
      } else {
        toast.error('Failed to submit vote');
      }

      onError?.(error);
    } finally {
      setIsVoting(false);
    }
  }, [currentAccount, submissionId, signAndExecute, onSuccess, onError]);

  const removeVote = useCallback(async (wasUpvote: boolean) => {
    if (!currentAccount) {
      toast.error('Please connect your wallet');
      return;
    }

    setIsRemoving(true);

    try {
      const tx = new Transaction();

      tx.moveCall({
        target: `${SONAR_PACKAGE_ID}::marketplace::remove_vote`,
        arguments: [
          tx.object(submissionId),
          tx.pure.bool(wasUpvote),
        ],
      });

      const result = await signAndExecute({
        transaction: tx,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      if (result.effects?.status.status === 'success') {
        toast.success('Vote removed');
        onSuccess?.();
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error: any) {
      console.error('Remove vote error:', error);

      if (error.message?.includes('E_VOTE_NOT_FOUND')) {
        toast.error('You have not voted on this submission');
      } else if (error.message?.includes('rejected')) {
        toast.error('Transaction rejected');
      } else {
        toast.error('Failed to remove vote');
      }

      onError?.(error);
    } finally {
      setIsRemoving(false);
    }
  }, [currentAccount, submissionId, signAndExecute, onSuccess, onError]);

  return {
    vote,
    removeVote,
    isVoting,
    isRemoving,
  };
}
