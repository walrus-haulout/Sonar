'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import type { Dataset } from '@/types/blockchain';
import { GlassCard } from '@/components/ui/GlassCard';
import { SignalBadge } from '@/components/ui/SignalBadge';
import { SonarButton } from '@/components/ui/SonarButton';
import { formatNumber, seededRandom } from '@/lib/utils';
import { useWaveform } from '@/hooks/useWaveform';

/**
 * DatasetCard Component
 * Displays dataset information with real audio waveform visualization and hover-to-play preview
 *
 * Features:
 * - Real waveform from Wavesurfer.js with peak extraction
 * - Hover-to-play preview with 150-200ms delay
 * - Seeded random fallback during loading for consistent SSR
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
  const cardRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout>();

  // Generate mock preview URL
  // In production, this would use dataset.preview_blob_id from Walrus
  const mockAudioUrl = `/audio/preview-${dataset.id}.mp3`;

  // Initialize waveform hook for audio preview
  const waveform = useWaveform({
    src: mockAudioUrl,
    sliceCount: 40, // Match current bar count
    autoplay: false,
    preload: false, // Don't preload immediately
  });

  // Generate seeded bars for SSR and loading fallback
  const seededBars = useMemo(() => {
    const seed = dataset.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const random = seededRandom(seed);
    const barCount = 40;
    const bars: number[] = [];

    for (let i = 0; i < barCount; i++) {
      // Generate heights between 10% and 90% (0.1 to 0.9)
      bars.push(random() * 0.8 + 0.1);
    }

    return bars;
  }, [dataset.id]);

  // Use real peaks when available, fallback to seeded bars
  const displayBars = waveform.peaks || seededBars;

  // Set client-side flag after hydration
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Viewport prefetching with Intersection Observer
  useEffect(() => {
    if (!isClient || !cardRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Warm cache when card enters viewport (100px buffer)
          waveform.load();
        }
      },
      { rootMargin: '100px' }
    );

    observer.observe(cardRef.current);

    return () => observer.disconnect();
  }, [isClient, waveform]);

  // Hover-to-play with delay
  const handleMouseEnter = () => {
    // Clear any existing timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    // Start playback after 150ms delay
    hoverTimeoutRef.current = setTimeout(() => {
      waveform.play();
    }, 150);
  };

  const handleMouseLeave = () => {
    // Clear timeout if hover ends before playback starts
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    // Pause playback
    waveform.pause();
  };

  const handleBlur = () => {
    // Pause on blur (keyboard navigation)
    waveform.pause();
  };

  // Format price from bigint to string
  const priceDisplay = Number(dataset.price) / 1_000_000; // Assuming 6 decimals for SONAR

  return (
    <div
      ref={cardRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onBlur={handleBlur}
    >
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
            <div
              className={`flex items-center justify-center gap-[2px] w-full max-w-[200px] h-[60px] transition-opacity duration-300 ${
                waveform.peaks && !waveform.isLoading ? 'opacity-100' : 'opacity-90'
              }`}
            >
              {displayBars.map((height, idx) => (
                <div
                  key={idx}
                  className="flex-1 rounded-full bg-sonar-signal transition-all duration-200"
                  style={{
                    height: `${height * 100}%`,
                    minWidth: '2px',
                    maxWidth: '5px',
                  }}
                />
              ))}
            </div>
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
    </div>
  );
}
