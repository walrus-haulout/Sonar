'use client';

import { GlassCard } from '@/components/ui/GlassCard';
import { SonarScanner } from '@/components/animations/SonarScanner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useProtocolStats } from '@/hooks/useProtocolStats';
import { getTierInfo, formatSonarAmount } from '@/lib/tier-utils';

/**
 * ProtocolStatsSection Component
 * Displays real-time protocol statistics with sonar scanner visualization
 * Auto-updates every 10 seconds via useProtocolStats hook
 */
export function ProtocolStatsSection() {
  const { data: stats, isLoading, error } = useProtocolStats();

  if (error) {
    return (
      <div className="mt-20 max-w-5xl mx-auto">
        <GlassCard>
          <div className="text-center py-8">
            <p className="text-sonar-coral">Failed to load protocol stats</p>
            <p className="text-sm text-sonar-highlight-bright/50 mt-2">
              {error.message}
            </p>
          </div>
        </GlassCard>
      </div>
    );
  }

  // Show loading skeleton or placeholder data
  if (isLoading || !stats) {
    return (
      <div className="mt-20 max-w-5xl mx-auto">
        <GlassCard glow>
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="flex-shrink-0">
                <SonarScanner
                  size={250}
                  intensity={0.8}
                  pulseFrequency={2.5}
                  showBorder={true}
                />
              </div>

              <div className="flex-1 w-full">
                <h2 className="text-2xl font-mono text-sonar-highlight mb-6 text-center md:text-left">
                  Loading Protocol Status...
                </h2>
                <div className="flex justify-center md:justify-start">
                  <LoadingSpinner />
                </div>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>
    );
  }

  const tierInfo = getTierInfo(stats.circulating_supply);

  return (
    <div className="mt-20 max-w-5xl mx-auto">
      <GlassCard glow>
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row items-center gap-8">
            {/* Sonar Scanner Widget */}
            <div className="flex-shrink-0">
              <SonarScanner
                size={250}
                intensity={0.8}
                pulseFrequency={2.5}
                showBorder={true}
              />
            </div>

            {/* Stats Grid */}
            <div className="flex-1 w-full">
              <h2 className="text-2xl font-mono text-sonar-highlight mb-6 text-center md:text-left">
                Current Protocol Status
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <div className={`text-3xl font-mono ${tierInfo.color}`}>
                    Tier {tierInfo.level}
                  </div>
                  <div className="text-sm text-sonar-highlight-bright/60 uppercase tracking-wide mt-2">
                    Current Tier
                  </div>
                </div>
                <div>
                  <div className="text-3xl font-mono text-sonar-signal">
                    {(tierInfo.burnRate * 100).toFixed(0)}%
                  </div>
                  <div className="text-sm text-sonar-highlight-bright/60 uppercase tracking-wide mt-2">
                    Burn Rate
                  </div>
                </div>
                <div>
                  <div className="text-3xl font-mono text-sonar-signal">
                    {formatSonarAmount(stats.circulating_supply)}
                  </div>
                  <div className="text-sm text-sonar-highlight-bright/60 uppercase tracking-wide mt-2">
                    Circulating
                  </div>
                </div>
                <div>
                  <div className="text-3xl font-mono text-sonar-signal">
                    {stats.total_datasets}
                  </div>
                  <div className="text-sm text-sonar-highlight-bright/60 uppercase tracking-wide mt-2">
                    Datasets
                  </div>
                </div>
              </div>

              {/* Tier Progress Bar */}
              <div className="mt-6">
                <div className="flex justify-between text-xs text-sonar-highlight-bright/60 mb-2">
                  <span>{tierInfo.description}</span>
                  {tierInfo.nextThreshold && (
                    <span>Next: {formatSonarAmount(tierInfo.nextThreshold)}</span>
                  )}
                </div>
                <div className="h-2 bg-sonar-deep/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${tierInfo.color.replace('text-', 'bg-')} transition-all duration-1000`}
                    style={{ width: `${tierInfo.progress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
