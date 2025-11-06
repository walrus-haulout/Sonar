'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { Dataset } from '@/types/blockchain';
import { GlassCard } from '@/components/ui/GlassCard';
import { SignalBadge } from '@/components/ui/SignalBadge';
import { formatNumber, seededRandom } from '@/lib/utils';
import { useWaveform } from '@/hooks/useWaveform';
import { getPreviewUrl } from '@/lib/api/client';
import { VoteButton } from './VoteButton';

interface TestnetDatasetCardProps {
  dataset: Dataset;
}

/**
 * TestnetDatasetCard Component
 * Specialized card for unreviewed community audio on the marketplace testnet
 * Highlights open review status and disables purchasing affordances
 */
export function TestnetDatasetCard({ dataset }: TestnetDatasetCardProps) {
  const previewUrl = dataset.previewUrl || getPreviewUrl(dataset.id);

  const waveform = useWaveform({
    src: previewUrl,
    sliceCount: 40,
    autoplay: false,
    preload: false,
  });

  const fallbackBars = useMemo(() => {
    const seed = dataset.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const random = seededRandom(seed);
    return Array.from({ length: 40 }, () => random() * 0.7 + 0.2);
  }, [dataset.id]);

  const bars = waveform.peaks || fallbackBars;

  // Mock voting stats for now (will come from on-chain data after contract deployment)
  const mockVotingStats = dataset.voting_stats || {
    upvotes: BigInt(0),
    downvotes: BigInt(0),
    voters: [],
    net_score: BigInt(0),
  };

  return (
    <div>
      <GlassCard className="sonar-glow-hover h-full flex flex-col space-y-4">
        <Link href={`/marketplace-testnet/${dataset.id}`} className="flex-1 flex flex-col space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-mono text-sonar-highlight">
                {dataset.title}
              </h3>
              <p className="text-xs text-sonar-highlight-bright/60 mt-1">
                {dataset.bundled_clips
                  ? `${dataset.bundled_clips.length} clips • ${formatNumber(dataset.duration_seconds)}s • ${dataset.creator}`
                  : `${formatNumber(dataset.duration_seconds)}s • Community submitted by ${dataset.creator}`}
              </p>
            </div>
            <SignalBadge variant="warning" className="uppercase tracking-wide text-xs">
              Pending Review
            </SignalBadge>
          </div>

          {/* Waveform Preview */}
          <div className="bg-sonar-abyss/50 rounded-sonar px-3 py-4">
            <div className="flex items-end justify-center gap-[2px] h-[56px]">
              {bars.map((height, idx) => (
                <div
                  key={idx}
                  className="flex-1 rounded-full bg-sonar-signal/80"
                  style={{
                    height: `${Math.max(0.15, Math.min(height, 1)) * 100}%`,
                    minWidth: '2px',
                    maxWidth: '5px',
                  }}
                />
              ))}
            </div>
          </div>

          <p className="text-sm text-sonar-highlight-bright/70 line-clamp-3 flex-1">
            {dataset.description || 'Unreviewed community submission pending moderation.'}
          </p>

          <div className="flex flex-wrap gap-2">
            {dataset.languages.slice(0, 3).map((lang) => (
              <span
                key={lang}
                className="text-[10px] font-mono px-2 py-1 bg-sonar-signal/10 text-sonar-highlight-bright rounded border border-sonar-signal/30"
              >
                {lang.toUpperCase()}
              </span>
            ))}
            <span className="text-[10px] font-mono px-2 py-1 bg-sonar-abyss/50 text-sonar-highlight-bright/60 rounded border border-white/5">
              {dataset.formats.join(', ') || 'Unknown format'}
            </span>
          </div>
        </Link>

        {/* Voting Section - Only show for on-chain submissions */}
        {dataset.id.startsWith('0x') && dataset.id.length === 66 && (
          <div className="pt-4 border-t border-white/5 flex items-center justify-between gap-4" onClick={(e) => e.stopPropagation()}>
            <VoteButton
              submissionId={dataset.id}
              votingStats={mockVotingStats}
              size="md"
            />
            <div className="flex-1 text-xs text-sonar-highlight-bright/60">
              <p className="font-mono text-sonar-highlight">
                👍 Vote to help curate
              </p>
              <p>Quality content graduates to marketplace</p>
            </div>
          </div>
        )}

        {/* Show submission prompt for non-on-chain datasets */}
        {!(dataset.id.startsWith('0x') && dataset.id.length === 66) && (
          <div className="pt-4 border-t border-white/5 text-xs text-sonar-highlight-bright/60">
            <p>This is a reference dataset. Submit your own audio to enable community voting!</p>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
