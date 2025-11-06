'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FreeSoundRepository } from '@/lib/data/freesound-repository';
import { SonarBackground } from '@/components/animations/SonarBackground';
import { GlassCard } from '@/components/ui/GlassCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SonarButton } from '@/components/ui/SonarButton';
import { TestnetDatasetCard } from '@/components/marketplace/TestnetDatasetCard';

export default function MarketplaceTestnetPage() {
  const repository = useMemo(() => new FreeSoundRepository({ bundleSize: 10 }), []);
  const [searchQuery, setSearchQuery] = useState('');

  const {
    data: datasets,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['marketplace-testnet', 'datasets'],
    queryFn: () => repository.getDatasets(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const filtered = useMemo(() => {
    if (!datasets) return [];
    if (!searchQuery) return datasets;

    const lower = searchQuery.toLowerCase();
    return datasets.filter(dataset =>
      dataset.title.toLowerCase().includes(lower) ||
      dataset.description.toLowerCase().includes(lower) ||
      dataset.creator.toLowerCase().includes(lower)
    );
  }, [datasets, searchQuery]);

  return (
    <main className="relative min-h-screen">
      <SonarBackground opacity={0.15} intensity={0.4} />

      <div className="relative z-10 container mx-auto px-6 py-12">
        <header className="max-w-5xl mx-auto mb-12 space-y-6">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-4xl sm:text-5xl font-mono tracking-radar text-sonar-highlight mb-4">
                Marketplace Testnet
              </h1>
              <p className="text-lg text-sonar-highlight-bright/80">
                Unreviewed community-submitted audio data awaiting review. Community members can review
                and vote on submissions to help curate quality content for the marketplace.
              </p>
            </div>
            <SonarButton
              variant="secondary"
              onClick={() => refetch()}
              disabled={isFetching}
              className="whitespace-nowrap"
            >
              {isFetching ? 'Refreshing…' : 'Refresh Bundle'}
            </SonarButton>
          </div>

          <GlassCard className="space-y-3 text-sm text-sonar-highlight-bright/70">
            <p>
              👍 <span className="font-mono text-sonar-highlight">Community Voting:</span> connect your wallet and vote on
              submissions. Upvote quality content that's safe for work, properly labeled, and worth encrypting.
            </p>
            <p>
              ⭐ <span className="font-mono text-sonar-highlight">Auto-Graduation:</span> submissions with enough positive votes
              automatically graduate to the encrypted marketplace. Your vote matters!
            </p>
            <p>
              🔒 <span className="font-mono text-sonar-highlight">On-Chain Transparency:</span> all votes are recorded on Sui
              testnet. One vote per wallet ensures fair curation.
            </p>
          </GlassCard>
        </header>

        <section className="max-w-5xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1">
              <label className="block text-sm text-sonar-highlight-bright/70 mb-2 font-mono uppercase tracking-wide">
                Filter by title, creator, or description
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search unreviewed clips..."
                className="w-full px-4 py-3 bg-sonar-abyss/50 border border-sonar-signal/30 rounded-sonar text-sonar-highlight-bright placeholder-sonar-highlight-bright/40 focus:outline-none focus:ring-2 focus:ring-sonar-signal"
              />
            </div>
            <div className="text-sm text-sonar-highlight-bright/60 font-mono whitespace-nowrap">
              {datasets?.length === 1 && datasets[0]?.bundled_clips
                ? `1 bundle dataset (${datasets[0].bundled_clips.length} Freesound clips)`
                : `${datasets?.length ?? 0} datasets`}
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-20">
              <LoadingSpinner />
            </div>
          ) : error ? (
            <GlassCard className="text-center py-12 space-y-4">
              <p className="text-sonar-coral text-lg font-mono">Failed to load FreeSound bundle</p>
              <p className="text-sm text-sonar-highlight-bright/60">
                {(error as Error).message}
              </p>
              <SonarButton variant="secondary" onClick={() => refetch()}>
                Try Again
              </SonarButton>
            </GlassCard>
          ) : filtered.length === 0 ? (
            <GlassCard className="text-center py-12 space-y-3">
              <p className="text-lg text-sonar-highlight font-mono">No clips match that filter.</p>
              <p className="text-sm text-sonar-highlight-bright/60">
                Clear the search to review the full bundle.
              </p>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filtered.map((dataset) => (
                <TestnetDatasetCard key={dataset.id} dataset={dataset} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
