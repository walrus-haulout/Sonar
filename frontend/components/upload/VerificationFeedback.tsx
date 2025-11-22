"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, MessageSquare, Loader2 } from "lucide-react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/GlassCard";

interface VerificationFeedbackProps {
  sessionObjectId: string;
  onFeedbackSubmitted?: () => void;
}

export function VerificationFeedback({
  sessionObjectId,
  onFeedbackSubmitted,
}: VerificationFeedbackProps) {
  const account = useCurrentAccount();
  const [vote, setVote] = useState<"helpful" | "not_helpful" | null>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleVote = async (voteType: "helpful" | "not_helpful") => {
    if (!account?.address) {
      setSubmitError("Please connect your wallet to submit feedback");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch(
        `/api/verify/${sessionObjectId}/feedback`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            vote: voteType,
            feedback_text: comment || null,
            wallet_address: account.address,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.detail || `HTTP ${response.status}`
        );
      }

      setVote(voteType);
      setSubmitted(true);
      onFeedbackSubmitted?.();
    } catch (error) {
      console.error("Failed to submit feedback:", error);
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Failed to submit feedback. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <GlassCard className="bg-sonar-blue/5 border border-sonar-blue/20">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-mono text-sonar-highlight/70">
            Was this analysis helpful?
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleVote("helpful")}
              disabled={isSubmitting || !account}
              title={!account ? "Connect wallet to vote" : "Helpful"}
              className={cn(
                "p-2 rounded-sonar transition-all",
                vote === "helpful"
                  ? "bg-sonar-signal/20 text-sonar-signal"
                  : "bg-sonar-blue/10 text-sonar-highlight/50 hover:bg-sonar-signal/10 hover:text-sonar-signal disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isSubmitting && vote === "helpful" ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <ThumbsUp className="w-5 h-5" />
              )}
            </button>

            <button
              onClick={() => handleVote("not_helpful")}
              disabled={isSubmitting || !account}
              title={!account ? "Connect wallet to vote" : "Not Helpful"}
              className={cn(
                "p-2 rounded-sonar transition-all",
                vote === "not_helpful"
                  ? "bg-sonar-coral/20 text-sonar-coral"
                  : "bg-sonar-blue/10 text-sonar-highlight/50 hover:bg-sonar-coral/10 hover:text-sonar-coral disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isSubmitting && vote === "not_helpful" ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <ThumbsDown className="w-5 h-5" />
              )}
            </button>

            <button
              onClick={() => setShowComment(!showComment)}
              disabled={isSubmitting || !account}
              title={!account ? "Connect wallet to comment" : "Add comment"}
              className="p-2 rounded-sonar bg-sonar-blue/10 text-sonar-highlight/50 hover:bg-sonar-blue/20 hover:text-sonar-highlight transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <MessageSquare className="w-5 h-5" />
            </button>
          </div>
        </div>

        {!account && (
          <p className="text-xs text-sonar-coral">
            Connect your wallet to provide feedback
          </p>
        )}

        {showComment && account && (
          <div className="space-y-2">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tell us what could be improved... (optional)"
              className="w-full px-3 py-2 bg-sonar-abyss/30 border border-sonar-blue/30 rounded-sonar text-sm text-sonar-highlight placeholder:text-sonar-highlight/40 focus:outline-none focus:border-sonar-signal/50"
              rows={3}
              maxLength={500}
              disabled={isSubmitting}
            />
            <p className="text-xs text-sonar-highlight/50">
              {comment.length}/500 characters
            </p>
          </div>
        )}

        {submitError && (
          <p className="text-xs text-sonar-coral">{submitError}</p>
        )}

        {submitted && (
          <p className="text-xs text-sonar-signal text-center">
            ✓ Thank you for your feedback!
          </p>
        )}
      </div>
    </GlassCard>
  );
}
