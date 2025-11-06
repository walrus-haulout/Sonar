'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SonarBackground } from '@/components/animations/SonarBackground';
import { GlassCard } from '@/components/ui/GlassCard';
import { SignalBadge } from '@/components/ui/SignalBadge';
import { SonarButton } from '@/components/ui/SonarButton';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { AudioPlayer } from '@/components/dataset/AudioPlayer';
import { VoteButtonDetailed } from '@/components/marketplace/VoteButton';
import { BundleClipsList } from '@/components/marketplace/BundleClipsList';
import { FreeSoundRepository } from '@/lib/data/freesound-repository';
import { formatNumber } from '@/lib/utils';

export default function MarketplaceTestnetDetailPage() {
  const params = useParams<{ id: string }>();
  const datasetId = Array.isArray(params.id) ? params.id[0] : params.id;

  const repository = useMemo(() => new FreeSoundRepository({ bundleSize: 10 }), []);

  const {
    data: dataset,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['marketplace-testnet', 'dataset', datasetId],
    queryFn: () => repository.getDataset(datasetId),
    enabled: Boolean(datasetId),
  });

  return (
    <main className="relative min-h-screen">
      <SonarBackground opacity={0.2} intensity={0.4} />

      <div className="relative z-10 container mx-auto px-6 py-12">
        <div className="max-w-5xl mx-auto mb-8">
          <Link href="/marketplace-testnet">
            <SonarButton variant="secondary" className="text-sm">
              ← Back to Testnet Bundle
            </SonarButton>
          </Link>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-24">
            <LoadingSpinner />
          </div>
        ) : error || !dataset ? (
          <GlassCard className="max-w-3xl mx-auto text-center py-16 space-y-4">
            <p className="text-sonar-coral text-xl font-mono">Unable to load clip</p>
            <p className="text-sm text-sonar-highlight-bright/60">
              {(error as Error)?.message ?? 'This submission may have been removed from the bundle.'}
            </p>
            <SonarButton variant="secondary" onClick={() => refetch()}>
              Try Again
            </SonarButton>
          </GlassCard>
        ) : dataset.bundled_clips ? (
          /* Bundle View */
          <div className="max-w-5xl mx-auto space-y-8">
            <header className="space-y-3">
              <div className="flex flex-wrap items-start gap-4">
                <h1 className="text-4xl font-mono text-sonar-highlight flex-1">
                  {dataset.title}
                </h1>
                <SignalBadge variant="info" className="uppercase tracking-wide">
                  Bundle Dataset
                </SignalBadge>
              </div>
              <p className="text-sm text-sonar-highlight-bright/60">
                A curated collection of {dataset.bundled_clips.length} audio clips from Freesound.org.{' '}
                Total duration: {formatNumber(dataset.duration_seconds)} seconds.
              </p>
            </header>

            {/* Bundle Contents */}
            <GlassCard>
              <BundleClipsList clips={dataset.bundled_clips} />
            </GlassCard>

            {/* Call to Action */}
            <GlassCard className="space-y-4">
              <h3 className="text-sm font-mono text-sonar-highlight uppercase tracking-wide">
                Want to Submit Your Own Audio?
              </h3>
              <p className="text-sm text-sonar-highlight-bright/70">
                This bundle contains reference audio from Freesound.org for demo purposes. You can upload your own
                audio datasets to the SONAR marketplace through the upload wizard.
              </p>
              <div className="flex gap-3">
                <Link href="/upload">
                  <SonarButton variant="primary">Upload Audio</SonarButton>
                </Link>
                <Link href="/marketplace">
                  <SonarButton variant="secondary">View Marketplace</SonarButton>
                </Link>
              </div>
            </GlassCard>

            <GlassCard className="space-y-4">
              <h3 className="text-sm font-mono text-sonar-highlight uppercase tracking-wide">
                About This Bundle
              </h3>
              <div className="space-y-2 text-sm text-sonar-highlight-bright/70">
                <p>
                  <span className="font-mono text-sonar-highlight">Source:</span> All clips sourced from{' '}
                  <a href="https://freesound.org" target="_blank" rel="noopener noreferrer" className="text-sonar-highlight hover:underline">
                    Freesound.org
                  </a>
                </p>
                <p>
                  <span className="font-mono text-sonar-highlight">License:</span> Creative Commons (various)
                </p>
                <p>
                  <span className="font-mono text-sonar-highlight">Quality Score:</span> {dataset.quality_score}/100 (average)
                </p>
                <p>
                  <span className="font-mono text-sonar-highlight">Languages:</span> {dataset.languages.join(', ')}
                </p>
                <p>
                  <span className="font-mono text-sonar-highlight">Formats:</span> {dataset.formats.join(', ')}
                </p>
              </div>
            </GlassCard>
          </div>
        ) : (
          /* Individual Clip View */
          <div className="max-w-5xl mx-auto space-y-8">
            <header className="space-y-3">
              <div className="flex flex-wrap items-start gap-4">
                <h1 className="text-4xl font-mono text-sonar-highlight flex-1">
                  {dataset.title}
                </h1>
                <SignalBadge variant="warning" className="uppercase tracking-wide">
                  Pending Community Review
                </SignalBadge>
              </div>
              <p className="text-sm text-sonar-highlight-bright/60">
                Submitted by <span className="font-mono text-sonar-highlight">{dataset.creator}</span>.{' '}
                Sourced from FreeSound. Public preview only — encryption will be added if the community approves.
              </p>
            </header>

            <GlassCard>
              <h2 className="text-lg font-mono text-sonar-highlight mb-4">Audio Preview</h2>
              <AudioPlayer dataset={dataset} />
            </GlassCard>

            {/* Voting Section */}
            <GlassCard>
              <h2 className="text-lg font-mono text-sonar-highlight mb-4">Community Voting</h2>
              <VoteButtonDetailed
                submissionId={dataset.id}
                votingStats={dataset.voting_stats || {
                  upvotes: BigInt(0),
                  downvotes: BigInt(0),
                  voters: [],
                  net_score: BigInt(0),
                }}
                onVoteSuccess={() => refetch()}
              />
              <p className="text-sm text-sonar-highlight-bright/60 mt-4">
                Help curate quality content for the marketplace. Submissions with 10+ net votes automatically graduate to the encrypted marketplace.
              </p>
            </GlassCard>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <GlassCard className="space-y-4">
                <h3 className="text-sm font-mono text-sonar-highlight uppercase tracking-wide">
                  Clip Details
                </h3>
                <div className="space-y-2 text-sm text-sonar-highlight-bright/70">
                  <p>
                    Duration:{' '}
                    <span className="font-mono text-sonar-highlight">
                      {formatNumber(dataset.duration_seconds)} seconds
                    </span>
                  </p>
                  <p>
                    Languages:{' '}
                    <span className="font-mono text-sonar-highlight">
                      {dataset.languages.join(', ')}
                    </span>
                  </p>
                  <p>
                    Formats:{' '}
                    <span className="font-mono text-sonar-highlight">
                      {dataset.formats.join(', ') || 'unknown'}
                    </span>
                  </p>
                  <p>
                    FreeSound downloads:{' '}
                    <span className="font-mono text-sonar-highlight">
                      {formatNumber(dataset.total_purchases)}
                    </span>
                  </p>
                </div>
              </GlassCard>

              <GlassCard className="space-y-4">
                <h3 className="text-sm font-mono text-sonar-highlight uppercase tracking-wide">
                  Review Criteria
                </h3>
                <ul className="space-y-2 text-sm text-sonar-highlight-bright/70">
                  <li>• Confirm the audio is safe for work and free of PII</li>
                  <li>• Verify tags and title accurately describe the content</li>
                  <li>• Evaluate recording quality and usefulness for training</li>
                  <li>• Check for appropriate licensing and permissions</li>
                </ul>
                <div className="pt-2 border-t border-white/5 text-xs text-sonar-highlight-bright/60">
                  <p className="font-mono text-sonar-highlight mb-1">👍 Vote with your wallet</p>
                  <p>Your on-chain vote is recorded transparently on Sui testnet. Quality submissions with enough community support will graduate automatically.</p>
                </div>
              </GlassCard>
            </div>

            <GlassCard className="space-y-4">
              <h3 className="text-sm font-mono text-sonar-highlight uppercase tracking-wide">
                About Testnet Submissions
              </h3>
              <p className="text-sm text-sonar-highlight-bright/70">
                Testnet submissions are public and unencrypted to enable rapid community review. These clips cannot be purchased
                and remain free until they graduate to the encrypted marketplace through community voting.
              </p>
              <p className="text-sm text-sonar-highlight-bright/70">
                <span className="font-mono text-sonar-highlight">How it works:</span> When a submission receives
                10+ net votes (upvotes - downvotes), it automatically graduates to the marketplace where it will be encrypted,
                priced, and available for purchase.
              </p>
              <div className="flex flex-wrap gap-3">
                <SignalBadge variant="danger">Not encrypted</SignalBadge>
                <SignalBadge variant="info">Community curation</SignalBadge>
                <SignalBadge variant="warning">Auto-graduation at 10 votes</SignalBadge>
              </div>
            </GlassCard>
          </div>
        )}
      </div>
    </main>
  );
}
