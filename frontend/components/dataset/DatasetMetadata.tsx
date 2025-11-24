'use client';

import { GlassCard } from '@/components/ui/GlassCard';
import { formatNumber } from '@/lib/utils';
import type { Dataset } from '@/types/blockchain';

interface DatasetMetadataProps {
  dataset: Dataset;
}

/**
 * DatasetMetadata Component
 * Displays comprehensive dataset information including technical specs,
 * storage details, and license information
 */
export function DatasetMetadata({ dataset }: DatasetMetadataProps) {
  return (
    <GlassCard>
      <h3 className="text-xl font-mono text-sonar-highlight mb-6">Dataset Details</h3>

      <div className="space-y-6">
        {/* Technical Specifications */}
        <div>
          <h4 className="text-sm font-mono text-sonar-highlight-bright/70 mb-3">
            Technical Specifications
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-sonar-abyss/20 rounded-sonar">
              <div className="text-xs text-sonar-highlight-bright/60 mb-1">Media Type</div>
              <div className="text-sm font-mono text-sonar-highlight">
                {dataset.media_type}
              </div>
            </div>

            <div className="p-3 bg-sonar-abyss/20 rounded-sonar">
              <div className="text-xs text-sonar-highlight-bright/60 mb-1">Quality Score</div>
              <div className="text-sm font-mono text-sonar-highlight">
                {dataset.quality_score}/10
              </div>
            </div>

            <div className="p-3 bg-sonar-abyss/20 rounded-sonar">
              <div className="text-xs text-sonar-highlight-bright/60 mb-1">Total Duration</div>
              <div className="text-sm font-mono text-sonar-highlight">
                {formatNumber(dataset.duration_seconds)}s
              </div>
            </div>

            <div className="p-3 bg-sonar-abyss/20 rounded-sonar">
              <div className="text-xs text-sonar-highlight-bright/60 mb-1">Sample Count</div>
              <div className="text-sm font-mono text-sonar-highlight">
                {formatNumber(dataset.sample_count)}
              </div>
            </div>

            <div className="p-3 bg-sonar-abyss/20 rounded-sonar">
              <div className="text-xs text-sonar-highlight-bright/60 mb-1">Storage Size</div>
              <div className="text-sm font-mono text-sonar-highlight">
                {(dataset.storage_size / 1_000_000).toFixed(1)} MB
              </div>
            </div>

            <div className="p-3 bg-sonar-abyss/20 rounded-sonar">
              <div className="text-xs text-sonar-highlight-bright/60 mb-1">Formats</div>
              <div className="text-sm font-mono text-sonar-highlight">
                {dataset.formats.join(', ')}
              </div>
            </div>
          </div>
        </div>

        {/* Languages */}
        {dataset.languages && Array.isArray(dataset.languages) && dataset.languages.length > 0 && (
          <div>
            <h4 className="text-sm font-mono text-sonar-highlight-bright/70 mb-3">
              Supported Languages
            </h4>
            <div className="flex flex-wrap gap-2">
              {dataset.languages.map((lang) => (
                <span
                  key={lang}
                  className="px-3 py-2 bg-sonar-signal/10 text-sonar-highlight-bright rounded border border-sonar-signal/30 text-sm font-mono"
                >
                  {lang === 'other' ? 'Other' : lang.toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Storage & Encryption */}
        <div>
          <h4 className="text-sm font-mono text-sonar-highlight-bright/70 mb-3">
            Storage & Security
          </h4>
          <div className="space-y-3">
            <div className="flex items-start space-x-3 p-3 bg-sonar-abyss/20 rounded-sonar">
              <span className="text-xl">🗄️</span>
              <div className="flex-1">
                <div className="text-sm font-mono text-sonar-highlight mb-1">
                  Walrus Decentralized Storage
                </div>
                <div className="text-xs text-sonar-highlight-bright/60">
                  Audio files stored on Walrus with redundancy and availability guarantees
                </div>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 bg-sonar-abyss/20 rounded-sonar">
              <span className="text-xl">🔐</span>
              <div className="flex-1">
                <div className="text-sm font-mono text-sonar-highlight mb-1">
                  Seal encryption by Mysten Labs
                </div>
                <div className="text-xs text-sonar-highlight-bright/60">
                  End-to-end encryption with access gated by blockchain purchase verification
                </div>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 bg-sonar-abyss/20 rounded-sonar">
              <span className="text-xl">⛓️</span>
              <div className="flex-1">
                <div className="text-sm font-mono text-sonar-highlight mb-1">
                  Sui Blockchain
                </div>
                <div className="text-xs text-sonar-highlight-bright/60">
                  Ownership and access rights managed via smart contracts on Sui
                </div>
                <div className="text-xs font-mono text-sonar-signal/70 mt-2 break-all">
                  ID: {dataset.id}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* License & Usage Rights */}
        <div>
          <h4 className="text-sm font-mono text-sonar-highlight-bright/70 mb-3">
            License & Usage Rights
          </h4>
          <div className="p-4 bg-sonar-abyss/20 rounded-sonar border border-sonar-highlight/20">
            <div className="space-y-2 text-xs text-sonar-highlight-bright/70">
              <p className="flex items-start">
                <span className="text-sonar-signal mr-2">✓</span>
                <span>Commercial use permitted for AI/ML training and development</span>
              </p>
              <p className="flex items-start">
                <span className="text-sonar-signal mr-2">✓</span>
                <span>Redistribution of original audio files prohibited</span>
              </p>
              <p className="flex items-start">
                <span className="text-sonar-signal mr-2">✓</span>
                <span>Models trained on this data may be used commercially</span>
              </p>
              <p className="flex items-start">
                <span className="text-sonar-signal mr-2">✓</span>
                <span>Attribution to creator recommended but not required</span>
              </p>
            </div>
          </div>
        </div>

        {/* Verification Status */}
        {dataset.verified && (
          <div className="p-4 bg-sonar-highlight/10 rounded-sonar border border-sonar-highlight/30">
            <div className="flex items-center space-x-3">
              <span className="text-3xl">✓</span>
              <div>
                <div className="text-sm font-mono text-sonar-highlight mb-1">
                  Verified Dataset
                </div>
                <div className="text-xs text-sonar-highlight-bright/70">
                  This dataset has been verified by SONAR moderators for quality and authenticity
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Timestamps */}
        <div className="pt-4 border-t border-white/5">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-sonar-highlight-bright/60">Created: </span>
              <span className="font-mono text-sonar-highlight">
                {new Date(Number(dataset.created_at)).toLocaleDateString()}
              </span>
            </div>
            <div>
              <span className="text-sonar-highlight-bright/60">Updated: </span>
              <span className="font-mono text-sonar-highlight">
                {new Date(Number(dataset.updated_at)).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
