'use client';

import { useProtocolStats } from '@/hooks/useProtocolStats';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { GlassCard } from '@/components/ui/GlassCard';
import { SonarBackground } from '@/components/animations/SonarBackground';
import { TierCard } from '@/components/economics/TierCard';
import { TokenEconomics } from '@/components/economics/TokenEconomics';
import { SupplyMetrics } from '@/components/economics/SupplyMetrics';
import { PurchaseSimulator } from '@/components/tokenomics/PurchaseSimulator';
import { TimeSimulation } from '@/components/tokenomics/TimeSimulation';
import { ScenarioExplorer } from '@/components/tokenomics/ScenarioExplorer';
import { getTierInfo, getAllTierConfigs } from '@/lib/tier-utils';

/**
 * Tokenomics Dashboard Page
 * Interactive demonstration of SNR token burn mechanisms
 * Shows hypothetical tokenomics alongside real protocol statistics
 */
export default function TokenomicsPage() {
  const { data: stats, isLoading, error } = useProtocolStats();

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

  if (error || !stats) {
    return (
      <main className="relative min-h-screen">
        <SonarBackground opacity={0.2} intensity={0.4} />
        <div className="relative z-10 container mx-auto px-6 py-12">
          <GlassCard className="text-center py-12">
            <p className="text-sonar-coral text-lg mb-2">Failed to load protocol statistics</p>
            <p className="text-sm text-sonar-highlight-bright/50">
              {error?.message || 'Unknown error'}
            </p>
          </GlassCard>
        </div>
      </main>
    );
  }

  // Hypothetical SNR token data for demonstration
  const hypotheticalSNR = {
    initialSupply: 80000000, // 80M SNR
    circulatingSupply: 75000000, // 75M SNR (for interactive demos)
    circulatingSupplyBigInt: BigInt(75000000), // For ProtocolStats type
    totalBurned: 5000000, // 5M SNR burned
    totalBurnedBigInt: BigInt(5000000), // For ProtocolStats type
    priceUsd: 0.05, // $0.05 per SNR
  };

  const currentTier = getTierInfo(hypotheticalSNR.circulatingSupply);
  const allTiers = getAllTierConfigs();

  return (
    <main className="relative min-h-screen">
      {/* Background Animation */}
      <SonarBackground opacity={0.2} intensity={0.4} />

      <div className="relative z-10 container mx-auto px-6 py-12">
        {/* Page Header */}
        <div className="max-w-6xl mx-auto mb-12">
          <h1 className="text-5xl font-mono tracking-radar text-sonar-highlight mb-4">
            SNR Tokenomics
          </h1>
          <div className="space-y-3">
            <p className="text-xl text-sonar-highlight-bright/80">
              Interactive demonstration of burn mechanisms and tier dynamics
            </p>
            <div className="inline-flex items-center gap-3 px-4 py-2 bg-sonar-signal/10 border border-sonar-signal/30 rounded-sonar">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
              <p className="text-sm text-sonar-highlight-bright/90">
                <span className="font-semibold">Demo Mode:</span> Token not yet launched • Currently in hackathon phase • Finalizing launch details
              </p>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto space-y-8">
          {/* Interactive Demos Section */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-mono text-sonar-highlight">Interactive Burn Demos</h2>
              <span className="text-xs px-3 py-1 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-sonar font-mono">
                EXAMPLE DATA
              </span>
            </div>
            <p className="text-sm text-sonar-highlight-bright/70 mb-6">
              Explore how the SNR token burn mechanisms would work through interactive simulations
            </p>

            {/* Purchase Simulator */}
            <div className="mb-6">
              <PurchaseSimulator
                currentSupply={hypotheticalSNR.circulatingSupply}
                snrPriceUsd={hypotheticalSNR.priceUsd}
              />
            </div>

            {/* Time-based Simulation */}
            <div className="mb-6">
              <TimeSimulation
                initialSupply={hypotheticalSNR.circulatingSupply}
                snrPriceUsd={hypotheticalSNR.priceUsd}
              />
            </div>

            {/* Scenario Explorer */}
            <div>
              <ScenarioExplorer
                defaultInitialSupply={hypotheticalSNR.initialSupply}
                snrPriceUsd={hypotheticalSNR.priceUsd}
              />
            </div>
          </section>

          {/* Current Tier Status */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-mono text-sonar-highlight">Example Current Tier</h2>
              <span className="text-xs px-3 py-1 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-sonar font-mono">
                HYPOTHETICAL
              </span>
            </div>
            <TierCard
              tier={currentTier}
              stats={{
                ...stats,
                circulating_supply: hypotheticalSNR.circulatingSupplyBigInt,
                total_burned: hypotheticalSNR.totalBurnedBigInt,
              }}
              highlighted
            />
          </section>

          {/* Token Economics Overview */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-mono text-sonar-highlight">SNR Token Economics</h2>
              <span className="text-xs px-3 py-1 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-sonar font-mono">
                HYPOTHETICAL
              </span>
            </div>
            <TokenEconomics
              stats={{
                ...stats,
                circulating_supply: hypotheticalSNR.circulatingSupplyBigInt,
                total_burned: hypotheticalSNR.totalBurnedBigInt,
              }}
              currentTier={currentTier}
            />
          </section>

          {/* Supply Metrics */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-mono text-sonar-highlight">Supply Metrics</h2>
              <span className="text-xs px-3 py-1 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-sonar font-mono">
                HYPOTHETICAL
              </span>
            </div>
            <SupplyMetrics
              stats={{
                ...stats,
                circulating_supply: hypotheticalSNR.circulatingSupplyBigInt,
                total_burned: hypotheticalSNR.totalBurnedBigInt,
              }}
              currentTier={currentTier}
            />
          </section>

          {/* All Tiers Explanation */}
          <section>
            <h2 className="text-2xl font-mono text-sonar-highlight mb-6">Tier System</h2>
            <p className="text-sonar-highlight-bright/70 mb-6">
              SNR would use an absolute-threshold dynamic burn model with 3 tiers. As the circulating
              supply decreases through burns, the protocol moves to lower tiers with reduced burn
              rates to preserve scarcity and ensure long-term sustainability.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {allTiers.map((tier, index) => (
                <TierCard
                  key={tier.level}
                  tier={tier}
                  stats={{
                    ...stats,
                    circulating_supply: hypotheticalSNR.circulatingSupplyBigInt,
                    total_burned: hypotheticalSNR.totalBurnedBigInt,
                  }}
                  highlighted={tier.level === currentTier.level}
                />
              ))}
            </div>
          </section>

          {/* Real Protocol Activity */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-mono text-sonar-highlight">Protocol Activity</h2>
              <span className="text-xs px-3 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded-sonar font-mono">
                LIVE DATA
              </span>
            </div>
            <GlassCard>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm text-sonar-highlight-bright/60 mb-2 font-mono">Total Datasets</p>
                  <p className="text-3xl font-mono font-bold text-sonar-signal">{stats.total_datasets}</p>
                </div>
                <div>
                  <p className="text-sm text-sonar-highlight-bright/60 mb-2 font-mono">Total Purchases</p>
                  <p className="text-3xl font-mono font-bold text-sonar-highlight">{stats.total_purchases}</p>
                </div>
                <div>
                  <p className="text-sm text-sonar-highlight-bright/60 mb-2 font-mono">Active Creators</p>
                  <p className="text-3xl font-mono font-bold text-sonar-highlight-bright">{stats.active_creators}</p>
                </div>
                <div>
                  <p className="text-sm text-sonar-highlight-bright/60 mb-2 font-mono">Total Volume</p>
                  <p className="text-3xl font-mono font-bold text-sonar-coral">${Number(stats.total_volume).toLocaleString()}</p>
                </div>
              </div>
              <p className="text-xs text-sonar-highlight-bright/50 mt-4 text-center">
                Real-time protocol statistics from the SONAR marketplace
              </p>
            </GlassCard>
          </section>
        </div>
      </div>
    </main>
  );
}
