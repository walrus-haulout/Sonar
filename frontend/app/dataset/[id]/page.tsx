'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useDataset } from '@/hooks/useDatasets';
import { useProtocolStats } from '@/hooks/useProtocolStats';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { GlassCard } from '@/components/ui/GlassCard';
import { SonarButton } from '@/components/ui/SonarButton';
import { SignalBadge } from '@/components/ui/SignalBadge';
import { SonarBackground } from '@/components/animations/SonarBackground';
import { AudioPlayer } from '@/components/dataset/AudioPlayer';
import { PurchaseCard } from '@/components/dataset/PurchaseCard';
import { DatasetMetadata } from '@/components/dataset/DatasetMetadata';
import { DownloadDecryptedButton } from '@/components/dataset/DownloadDecryptedButton';
import { formatNumber } from '@/lib/utils';
import { formatSonarAmount } from '@/lib/tier-utils';

/**
 * Dataset Detail Page
 * Full dataset information with audio preview and purchase functionality
 */
export default function DatasetDetailPage() {
  const params = useParams() as Record<string, string> | null;
  const datasetId = params?.id || '';

  const { data: dataset, isLoading, error } = useDataset(datasetId);
  const { data: stats } = useProtocolStats();

  if (isLoading) {
    return (
      <main className="relative min-h-screen">
        <SonarBackground opacity={0.2} intensity={0.4} />
        <div className="relative z-10 container mx-auto px-6 py-12">
          <div className="flex justify-center items-center min-h-[60vh]">
            <LoadingSpinner />
          </div>
        </div>
      </main>
    );
  }

  if (error || !dataset) {
    return (
      <main className="relative min-h-screen">
        <SonarBackground opacity={0.2} intensity={0.4} />
        <div className="relative z-10 container mx-auto px-6 py-12">
          <GlassCard className="text-center py-12 max-w-2xl mx-auto">
            <p className="text-sonar-coral text-lg mb-2">Dataset not found</p>
            <p className="text-sm text-sonar-highlight-bright/50 mb-6">
              {error?.message || 'The dataset you are looking for does not exist.'}
            </p>
            <Link href="/marketplace">
              <SonarButton variant="primary">Back to Marketplace</SonarButton>
            </Link>
          </GlassCard>
        </div>
      </main>
    );
  }

  const priceDisplay = Number(dataset.price) / 1_000_000;

  return (
    <main className="relative min-h-screen">
      {/* Background Animation */}
      <SonarBackground opacity={0.2} intensity={0.4} />

      <div className="relative z-10 container mx-auto px-6 py-12">
        {/* Back Button */}
        <div className="max-w-6xl mx-auto mb-6">
          <Link href="/marketplace">
            <SonarButton variant="secondary" className="text-sm">
              ← Back to Marketplace
            </SonarButton>
          </Link>
        </div>

        <div className="max-w-6xl mx-auto">
          {/* Header Section */}
          <div className="mb-8">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h1 className="text-4xl font-mono tracking-radar text-sonar-highlight mb-3">
                  {dataset.title}
                </h1>
                <p className="text-lg text-sonar-highlight-bright/80">{dataset.description}</p>
              </div>

              {/* Quality Badge */}
              <div className="ml-6 flex-shrink-0">
                <SignalBadge
                  variant={
                    dataset.quality_score >= 8
                      ? 'success'
                      : dataset.quality_score >= 6
                        ? 'warning'
                        : 'danger'
                  }
                  className="text-lg px-4 py-2"
                >
                  Quality: {dataset.quality_score}/10
                </SignalBadge>
              </div>
            </div>

            {/* Languages and Formats */}
            <div className="flex flex-wrap gap-2 mb-4">
              {dataset.languages && Array.isArray(dataset.languages) && dataset.languages.map((lang) => (
                <span
                  key={lang}
                  className="text-xs font-mono px-3 py-1 bg-sonar-signal/10 text-sonar-highlight-bright rounded border border-sonar-signal/30"
                >
                  {lang === 'other' ? 'Other' : lang.toUpperCase()}
                </span>
              ))}
              <span className="text-xs font-mono px-3 py-1 bg-sonar-highlight/10 text-sonar-highlight rounded border border-sonar-highlight/30">
                {dataset.media_type}
              </span>
            </div>

            {/* Key Metrics */}
            <div className="flex items-center gap-6 text-sm text-sonar-highlight-bright/70">
              <span>
                Duration: <span className="font-mono text-sonar-highlight">{formatNumber(dataset.duration_seconds)}s</span>
              </span>
              <span>•</span>
              <span>
                Samples: <span className="font-mono text-sonar-highlight">{formatNumber(dataset.sample_count)}</span>
              </span>
              <span>•</span>
              <span>
                Size: <span className="font-mono text-sonar-highlight">{(dataset.storage_size / 1_000_000).toFixed(1)} MB</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content - Left Column (2/3) */}
            <div className="lg:col-span-2 space-y-8">
              {/* Audio Player */}
              <GlassCard>
                <h3 className="text-xl font-mono text-sonar-highlight mb-4">Audio Preview</h3>
                <AudioPlayer dataset={dataset} />
              </GlassCard>

              {/* AI Analysis Section */}
              {(dataset.transcript || dataset.analysis) && (
                <GlassCard>
                  <h3 className="text-xl font-mono text-sonar-highlight mb-4">AI Analysis</h3>

                  {/* AI Suggested Price */}
                  {dataset.analysis?.suggestedPrice && (
                    <div className="mb-6 p-4 bg-sonar-signal/10 rounded-lg border border-sonar-signal/30">
                      <div className="flex items-center justify-between">
                        <span className="text-sonar-highlight-bright/70">AI Suggested Price</span>
                        <span className="text-2xl font-mono text-sonar-signal font-bold">
                          {dataset.analysis.suggestedPrice.toFixed(2)} SUI
                        </span>
                      </div>
                      {dataset.analysis.priceAnalysis?.breakdown && (
                        <p className="text-xs text-sonar-highlight-bright/50 mt-2">
                          {dataset.analysis.priceAnalysis.breakdown}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Quality Insights */}
                  {dataset.analysis?.insights && dataset.analysis.insights.length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-sm font-mono text-sonar-highlight mb-3">Quality Insights</h4>
                      <ul className="space-y-2">
                        {dataset.analysis.insights.map((insight, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-sonar-highlight-bright/80">
                            <span className="text-sonar-signal mt-0.5">•</span>
                            <span>{insight}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Transcript */}
                  {dataset.transcript && (
                    <div>
                      <h4 className="text-sm font-mono text-sonar-highlight mb-3">
                        Transcript
                        {dataset.transcript_length && (
                          <span className="text-sonar-highlight-bright/50 ml-2">
                            ({dataset.transcript_length.toLocaleString()} chars)
                          </span>
                        )}
                      </h4>
                      <div className="bg-sonar-abyss/50 rounded-lg p-4 max-h-64 overflow-y-auto">
                        <p className="text-sm text-sonar-highlight-bright/80 whitespace-pre-wrap font-mono leading-relaxed">
                          {dataset.transcript}
                        </p>
                      </div>
                    </div>
                  )}
                </GlassCard>
              )}

              {/* Full Metadata */}
              <DatasetMetadata dataset={dataset} />

              {/* Creator Info */}
              <GlassCard>
                <h3 className="text-xl font-mono text-sonar-highlight mb-4">Creator</h3>
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-sonar-signal to-sonar-highlight flex items-center justify-center text-2xl font-mono font-bold text-sonar-abyss">
                    {dataset.creator.slice(2, 4).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="font-mono text-sm text-sonar-highlight mb-1">
                      {dataset.creator.slice(0, 10)}...{dataset.creator.slice(-8)}
                    </div>
                    <div className="text-xs text-sonar-highlight-bright/60">Dataset Creator</div>
                  </div>
                </div>
              </GlassCard>
            </div>

            {/* Purchase Card - Right Column (1/3) */}
            <div className="lg:col-span-1">
              <div className="sticky top-24">
                <PurchaseCard dataset={dataset} stats={stats} />

                {/* Download Decrypted Audio */}
                <GlassCard className="mt-6">
                  <h4 className="text-sm font-mono text-sonar-highlight mb-4">Download Audio</h4>
                  <DownloadDecryptedButton dataset={dataset} />
                </GlassCard>

                {/* Additional Info Card */}
                <GlassCard className="mt-6">
                  <h4 className="text-sm font-mono text-sonar-highlight mb-4">Availability</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-sonar-highlight-bright/70">Status</span>
                      {dataset.listed ? (
                        <SignalBadge variant="success" className="text-xs">
                          Listed
                        </SignalBadge>
                      ) : (
                        <SignalBadge variant="danger" className="text-xs">
                          Unlisted
                        </SignalBadge>
                      )}
                    </div>

                    <div className="flex justify-between items-center text-sm">
                      <span className="text-sonar-highlight-bright/70">Verified</span>
                      {dataset.verified ? (
                        <span className="text-sonar-highlight">✓ Yes</span>
                      ) : (
                        <span className="text-sonar-highlight-bright/50">No</span>
                      )}
                    </div>

                    <div className="flex justify-between items-center text-sm">
                      <span className="text-sonar-highlight-bright/70">Formats</span>
                      <span className="text-sonar-highlight font-mono text-xs">
                        {dataset.formats.join(', ')}
                      </span>
                    </div>
                  </div>
                </GlassCard>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
