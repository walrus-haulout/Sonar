'use client';

import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { getTierInfo } from '@/lib/tier-utils';
import { formatNumber } from '@/lib/utils';

interface ScenarioExplorerProps {
  defaultInitialSupply: number;
  snrPriceUsd: number;
}

export function ScenarioExplorer({ defaultInitialSupply, snrPriceUsd }: ScenarioExplorerProps) {
  const [initialSupply, setInitialSupply] = useState(defaultInitialSupply);
  const [avgPurchaseSize, setAvgPurchaseSize] = useState(100);
  const [totalPurchases, setTotalPurchases] = useState(100);
  const [timeHorizonDays, setTimeHorizonDays] = useState(30);

  const [projections, setProjections] = useState<{
    finalSupply: number;
    totalBurned: number;
    burnPercentage: number;
    finalTier: number;
    tierTransitions: { day: number; fromTier: number; toTier: number }[];
    avgDailyBurn: number;
  } | null>(null);

  useEffect(() => {
    // Run scenario simulation
    let currentSupply = initialSupply;
    let totalBurned = 0;
    const purchasesPerDay = totalPurchases / timeHorizonDays;
    const tierTransitions: { day: number; fromTier: number; toTier: number }[] = [];
    let lastTier = getTierInfo(currentSupply).level;

    for (let day = 0; day < timeHorizonDays; day++) {
      let dayBurned = 0;

      for (let i = 0; i < purchasesPerDay; i++) {
        const tier = getTierInfo(currentSupply);
        const tokensPerPurchase = avgPurchaseSize / snrPriceUsd;
        const burnAmount = tokensPerPurchase * (tier.burnRate / 100);

        currentSupply -= burnAmount;
        dayBurned += burnAmount;

        // Track tier changes
        const newTier = getTierInfo(currentSupply).level;
        if (newTier !== lastTier) {
          tierTransitions.push({
            day: day + 1,
            fromTier: lastTier,
            toTier: newTier,
          });
          lastTier = newTier;
        }
      }

      totalBurned += dayBurned;
    }

    const finalTier = getTierInfo(currentSupply);
    const burnPercentage = (totalBurned / initialSupply) * 100;
    const avgDailyBurn = totalBurned / timeHorizonDays;

    setProjections({
      finalSupply: currentSupply,
      totalBurned,
      burnPercentage,
      finalTier: finalTier.level,
      tierTransitions,
      avgDailyBurn,
    });
  }, [initialSupply, avgPurchaseSize, totalPurchases, timeHorizonDays, snrPriceUsd]);

  return (
    <GlassCard>
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-mono text-sonar-highlight">Scenario Explorer</h3>
            <span className="text-xs px-2 py-1 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-sonar">
              CONFIGURABLE
            </span>
          </div>
          <p className="text-sm text-sonar-highlight-bright/70">
            Adjust parameters to explore different tokenomics scenarios and outcomes
          </p>
        </div>

        {/* Parameter Controls */}
        <div className="space-y-5">
          {/* Initial Supply */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-mono text-sonar-highlight-bright/70">
                Initial SNR Supply
              </label>
              <span className="text-sm font-mono text-sonar-highlight">
                {formatNumber(initialSupply)}
              </span>
            </div>
            <input
              type="range"
              min="50000000"
              max="100000000"
              step="5000000"
              value={initialSupply}
              onChange={(e) => setInitialSupply(Number(e.target.value))}
              className="w-full h-2 bg-sonar-abyss/50 rounded-sonar appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sonar-signal
                [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-sonar-signal/50"
            />
            <div className="flex justify-between text-xs text-sonar-highlight-bright/50 mt-1">
              <span>50M</span>
              <span>100M</span>
            </div>
          </div>

          {/* Average Purchase Size */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-mono text-sonar-highlight-bright/70">
                Average Purchase Size (USD)
              </label>
              <span className="text-sm font-mono text-sonar-highlight">${avgPurchaseSize}</span>
            </div>
            <input
              type="range"
              min="10"
              max="1000"
              step="10"
              value={avgPurchaseSize}
              onChange={(e) => setAvgPurchaseSize(Number(e.target.value))}
              className="w-full h-2 bg-sonar-abyss/50 rounded-sonar appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sonar-signal
                [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-sonar-signal/50"
            />
            <div className="flex justify-between text-xs text-sonar-highlight-bright/50 mt-1">
              <span>Small ($10)</span>
              <span>Large ($1000)</span>
            </div>
          </div>

          {/* Total Purchases */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-mono text-sonar-highlight-bright/70">
                Total Purchases in Period
              </label>
              <span className="text-sm font-mono text-sonar-highlight">{totalPurchases}x</span>
            </div>
            <input
              type="range"
              min="10"
              max="1000"
              step="10"
              value={totalPurchases}
              onChange={(e) => setTotalPurchases(Number(e.target.value))}
              className="w-full h-2 bg-sonar-abyss/50 rounded-sonar appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sonar-signal
                [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-sonar-signal/50"
            />
            <div className="flex justify-between text-xs text-sonar-highlight-bright/50 mt-1">
              <span>10 purchases</span>
              <span>1000 purchases</span>
            </div>
          </div>

          {/* Time Horizon */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-mono text-sonar-highlight-bright/70">
                Time Horizon
              </label>
              <span className="text-sm font-mono text-sonar-highlight">{timeHorizonDays} days</span>
            </div>
            <input
              type="range"
              min="7"
              max="365"
              step="7"
              value={timeHorizonDays}
              onChange={(e) => setTimeHorizonDays(Number(e.target.value))}
              className="w-full h-2 bg-sonar-abyss/50 rounded-sonar appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sonar-signal
                [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-sonar-signal/50"
            />
            <div className="flex justify-between text-xs text-sonar-highlight-bright/50 mt-1">
              <span>1 week</span>
              <span>1 year</span>
            </div>
          </div>
        </div>

        {/* Projections */}
        {projections && (
          <div className="space-y-4 pt-4 border-t border-white/10">
            <h4 className="text-sm font-mono text-sonar-highlight-bright/80">
              Projected Outcomes
            </h4>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-sonar-signal/10 border border-sonar-signal/30 rounded-sonar">
                <p className="text-xs text-sonar-highlight-bright/60 mb-1 font-mono">Final Supply</p>
                <p className="text-2xl font-mono font-bold text-sonar-signal">
                  {formatNumber(projections.finalSupply)}
                </p>
                <p className="text-xs text-sonar-highlight-bright/50 mt-1">
                  {((projections.finalSupply / initialSupply) * 100).toFixed(1)}% remaining
                </p>
              </div>

              <div className="p-4 bg-sonar-coral/10 border border-sonar-coral/30 rounded-sonar">
                <p className="text-xs text-sonar-highlight-bright/60 mb-1 font-mono">Total Burned</p>
                <p className="text-2xl font-mono font-bold text-sonar-coral">
                  {formatNumber(projections.totalBurned)}
                </p>
                <p className="text-xs text-sonar-highlight-bright/50 mt-1">
                  {projections.burnPercentage.toFixed(2)}% of supply
                </p>
              </div>

              <div className="p-4 bg-sonar-highlight/10 border border-sonar-highlight/30 rounded-sonar">
                <p className="text-xs text-sonar-highlight-bright/60 mb-1 font-mono">Final Tier</p>
                <p className="text-2xl font-mono font-bold text-sonar-highlight">
                  Tier {projections.finalTier}
                </p>
                <p className="text-xs text-sonar-highlight-bright/50 mt-1">
                  {getTierInfo(projections.finalSupply).burnRate}% burn rate
                </p>
              </div>

              <div className="p-4 bg-sonar-abyss/50 border border-white/10 rounded-sonar">
                <p className="text-xs text-sonar-highlight-bright/60 mb-1 font-mono">Avg Daily Burn</p>
                <p className="text-2xl font-mono font-bold text-sonar-highlight-bright">
                  {formatNumber(projections.avgDailyBurn)}
                </p>
                <p className="text-xs text-sonar-highlight-bright/50 mt-1">
                  SNR/day
                </p>
              </div>
            </div>

            {/* Tier Transitions */}
            {projections.tierTransitions.length > 0 && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-sonar">
                <p className="text-xs font-mono text-yellow-400 mb-2">
                  🔄 Tier Transitions ({projections.tierTransitions.length})
                </p>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {projections.tierTransitions.map((transition, idx) => (
                    <div
                      key={idx}
                      className="text-xs font-mono text-yellow-300/80 flex items-center gap-2"
                    >
                      <span>Day {transition.day}:</span>
                      <span>
                        Tier {transition.fromTier} → Tier {transition.toTier}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Scarcity Metrics */}
            <div className="p-4 bg-sonar-abyss/30 border border-white/5 rounded-sonar">
              <p className="text-xs font-mono text-sonar-highlight-bright/60 mb-2">Scarcity Analysis</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-sonar-highlight-bright/70">Supply Reduction:</span>
                  <span className="font-mono text-sonar-coral font-semibold">
                    -{projections.burnPercentage.toFixed(2)}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-sonar-highlight-bright/70">Purchases per Day:</span>
                  <span className="font-mono text-sonar-highlight">
                    {(totalPurchases / timeHorizonDays).toFixed(1)}x
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-sonar-highlight-bright/70">Scarcity Level:</span>
                  <span className={`font-mono font-semibold ${
                    projections.burnPercentage > 30 ? 'text-sonar-coral' :
                    projections.burnPercentage > 15 ? 'text-yellow-400' :
                    'text-sonar-signal'
                  }`}>
                    {projections.burnPercentage > 30 ? 'High' :
                     projections.burnPercentage > 15 ? 'Medium' :
                     'Low'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  );
}
