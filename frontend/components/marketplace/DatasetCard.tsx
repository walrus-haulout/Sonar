'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import type { Dataset } from '@/types/blockchain';
import { GlassCard } from '@/components/ui/GlassCard';
import { SignalBadge } from '@/components/ui/SignalBadge';
import { SonarButton } from '@/components/ui/SonarButton';
import { formatNumber, seededRandom } from '@/lib/utils';

/**
 * DatasetCard Component
 * Displays dataset information with hydration-safe waveform visualization
 *
 * Features:
 * - Seeded random waveform for consistent SSR/client rendering
 * - Quality score badge
 * - Language tags
 * - Price and duration display
 * - Hover effects with sonar glow
 */
export interface DatasetCardProps {
  dataset: Dataset;
  onPurchase?: (datasetId: string) => void;
}

export function DatasetCard({ dataset, onPurchase }: DatasetCardProps) {
  const [isClient, setIsClient] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Set client-side flag after hydration
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Draw waveform using seeded random for hydration safety
  useEffect(() => {
    if (!isClient || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const width = 200;
    const height = 60;
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Use dataset ID as seed for consistent waveform
    const seed = dataset.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const random = seededRandom(seed);

    // Draw waveform bars
    const barCount = 40;
    const barWidth = width / barCount;
    const centerY = height / 2;

    ctx.fillStyle = '#1AA4D9'; // sonar-signal color

    for (let i = 0; i < barCount; i++) {
      const barHeight = random() * (height * 0.8) + height * 0.1;
      const x = i * barWidth;
      const y = centerY - barHeight / 2;

      ctx.fillRect(x, y, barWidth * 0.7, barHeight);
    }
  }, [isClient, dataset.id]);

  // Format price from bigint to string
  const priceDisplay = Number(dataset.price) / 1_000_000; // Assuming 6 decimals for SONAR

  return (
    <Link href={`/dataset/${dataset.id}`}>
      <GlassCard className="sonar-glow-hover cursor-pointer h-full flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-mono text-sonar-highlight truncate">
              {dataset.title}
            </h3>
            <p className="text-sm text-sonar-highlight-bright/60 mt-1">
              {formatNumber(dataset.duration_seconds)}s •{' '}
              {dataset.media_type === 'audio' ? '🎵' : '🎙️'} Audio
            </p>
          </div>

          {/* Quality Score Badge */}
          <div className="ml-3 flex-shrink-0">
            <SignalBadge
              variant={
                dataset.quality_score >= 8
                  ? 'success'
                  : dataset.quality_score >= 6
                    ? 'warning'
                    : 'error'
              }
            >
              Q{dataset.quality_score}
            </SignalBadge>
          </div>
        </div>

        {/* Waveform Visualization */}
        <div className="mb-4 bg-sonar-abyss/50 rounded-sonar p-3 flex items-center justify-center">
          <canvas
            ref={canvasRef}
            className="w-full max-w-[200px] h-[60px]"
            style={{ imageRendering: 'crisp-edges' }}
          />
        </div>

        {/* Description */}
        <p className="text-sm text-sonar-highlight-bright/70 mb-4 line-clamp-2 flex-1">
          {dataset.description}
        </p>

        {/* Languages */}
        <div className="flex flex-wrap gap-2 mb-4">
          {dataset.languages.slice(0, 3).map((lang) => (
            <span
              key={lang}
              className="text-xs font-mono px-2 py-1 bg-sonar-signal/10 text-sonar-highlight-bright rounded border border-sonar-signal/30"
            >
              {lang.toUpperCase()}
            </span>
          ))}
          {dataset.languages.length > 3 && (
            <span className="text-xs font-mono px-2 py-1 text-sonar-highlight-bright/50">
              +{dataset.languages.length - 3}
            </span>
          )}
        </div>

        {/* Footer: Price + Status */}
        <div className="flex items-center justify-between pt-4 border-t border-white/5">
          <div>
            <div className="text-2xl font-mono font-bold text-sonar-signal">
              {priceDisplay.toFixed(2)}
            </div>
            <div className="text-xs text-sonar-highlight-bright/60 uppercase tracking-wide">
              SONAR
            </div>
          </div>

          {dataset.listed ? (
            <SonarButton
              variant="primary"
              onClick={(e) => {
                e.preventDefault();
                onPurchase?.(dataset.id);
              }}
              className="text-sm"
            >
              Purchase
            </SonarButton>
          ) : (
            <SignalBadge variant="error">Unlisted</SignalBadge>
          )}
        </div>

        {/* Formats Info */}
        <div className="mt-3 text-xs text-sonar-highlight-bright/50 font-mono">
          Formats: {dataset.formats.join(', ')}
        </div>
      </GlassCard>
    </Link>
  );
}
