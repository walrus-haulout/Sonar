'use client';

import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { getTierInfo, type TierInfo } from '@/lib/tier-utils';
import { formatNumber } from '@/lib/utils';

interface PurchaseSimulatorProps {
  currentSupply: number;
  snrPriceUsd: number;
}

export function PurchaseSimulator({ currentSupply, snrPriceUsd }: PurchaseSimulatorProps) {
  const [purchaseAmount, setPurchaseAmount] = useState<string>('100');
  const [results, setResults] = useState<{
    tokensReceived: number;
    amountBurned: number;
    burnRate: number;
    newSupply: number;
    tierBefore: TierInfo;
    tierAfter: TierInfo;
    tierChanged: boolean;
  } | null>(null);

  useEffect(() => {
    const amount = parseFloat(purchaseAmount);
    if (isNaN(amount) || amount <= 0) {
      setResults(null);
      return;
    }

    // Calculate tokens based on purchase amount
    const totalTokens = amount / snrPriceUsd;

    // Get current tier
    const tierBefore = getTierInfo(currentSupply);
    const burnRate = tierBefore.burnRate;

    // Calculate burn
    const amountBurned = totalTokens * (burnRate / 100);
    const tokensReceived = totalTokens - amountBurned;

    // New supply after burn
    const newSupply = currentSupply - amountBurned;
    const tierAfter = getTierInfo(newSupply);

    setResults({
      tokensReceived,
      amountBurned,
      burnRate,
      newSupply,
      tierBefore,
      tierAfter,
      tierChanged: tierBefore.level !== tierAfter.level,
    });
  }, [purchaseAmount, currentSupply, snrPriceUsd]);

  return (
    <GlassCard>
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-mono text-sonar-highlight">Purchase Simulator</h3>
            <span className="text-xs px-2 py-1 bg-sonar-signal/20 text-sonar-signal border border-sonar-signal/30 rounded-sonar">
              INTERACTIVE
            </span>
          </div>
          <p className="text-sm text-sonar-highlight-bright/70">
            Enter a purchase amount to see real-time burn calculations and tier impacts
          </p>
        </div>

        {/* Input */}
        <div>
          <label className="block text-sm font-mono text-sonar-highlight-bright/80 mb-2">
            Purchase Amount (USD)
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sonar-highlight-bright/50">
              $
            </span>
            <input
              type="number"
              value={purchaseAmount}
              onChange={(e) => setPurchaseAmount(e.target.value)}
              placeholder="100"
              min="0"
              step="10"
              className="w-full pl-8 pr-4 py-3 bg-sonar-abyss/50 border border-sonar-signal/30 rounded-sonar text-sonar-highlight font-mono focus:outline-none focus:border-sonar-signal/60 focus:ring-2 focus:ring-sonar-signal/20 transition-all"
            />
          </div>
          <p className="text-xs text-sonar-highlight-bright/50 mt-1">
            Current SNR price: ${snrPriceUsd.toFixed(4)}
          </p>
        </div>

        {/* Results */}
        {results && (
          <div className="space-y-4">
            {/* Tier Change Warning */}
            {results.tierChanged && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-sonar">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 text-yellow-400 flex-shrink-0">⚠️</div>
                  <div>
                    <p className="text-sm font-semibold text-yellow-400">Tier Change Detected!</p>
                    <p className="text-xs text-yellow-300/80 mt-1">
                      This purchase would trigger a tier change from Tier {results.tierBefore.level} to Tier {results.tierAfter.level}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Calculation Results */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-sonar-signal/10 border border-sonar-signal/30 rounded-sonar">
                <p className="text-xs text-sonar-highlight-bright/60 mb-1 font-mono">You Receive</p>
                <p className="text-2xl font-mono font-bold text-sonar-signal">
                  {formatNumber(results.tokensReceived)}
                </p>
                <p className="text-xs text-sonar-highlight-bright/50 mt-1">SNR tokens</p>
              </div>

              <div className="p-4 bg-sonar-coral/10 border border-sonar-coral/30 rounded-sonar">
                <p className="text-xs text-sonar-highlight-bright/60 mb-1 font-mono">Burned</p>
                <p className="text-2xl font-mono font-bold text-sonar-coral">
                  {formatNumber(results.amountBurned)}
                </p>
                <p className="text-xs text-sonar-highlight-bright/50 mt-1">SNR tokens</p>
              </div>

              <div className="p-4 bg-sonar-highlight/10 border border-sonar-highlight/30 rounded-sonar">
                <p className="text-xs text-sonar-highlight-bright/60 mb-1 font-mono">Current Burn Rate</p>
                <p className="text-2xl font-mono font-bold text-sonar-highlight">
                  {results.burnRate}%
                </p>
                <p className="text-xs text-sonar-highlight-bright/50 mt-1">Tier {results.tierBefore.level}</p>
              </div>

              <div className="p-4 bg-sonar-abyss/50 border border-white/10 rounded-sonar">
                <p className="text-xs text-sonar-highlight-bright/60 mb-1 font-mono">New Supply</p>
                <p className="text-2xl font-mono font-bold text-sonar-highlight-bright">
                  {formatNumber(results.newSupply)}
                </p>
                <p className="text-xs text-sonar-highlight-bright/50 mt-1">
                  {((results.amountBurned / currentSupply) * 100).toFixed(2)}% reduction
                </p>
              </div>
            </div>

            {/* Breakdown */}
            <div className="p-4 bg-sonar-abyss/30 border border-white/5 rounded-sonar space-y-2">
              <p className="text-xs font-mono text-sonar-highlight-bright/60 mb-2">Calculation Breakdown</p>
              <div className="space-y-1 text-xs font-mono text-sonar-highlight-bright/70">
                <div className="flex justify-between">
                  <span>Purchase Amount:</span>
                  <span className="text-sonar-highlight">${parseFloat(purchaseAmount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Tokens (pre-burn):</span>
                  <span className="text-sonar-highlight">{formatNumber(results.tokensReceived + results.amountBurned)} SNR</span>
                </div>
                <div className="flex justify-between border-t border-white/5 pt-2">
                  <span>Burn ({results.burnRate}%):</span>
                  <span className="text-sonar-coral">-{formatNumber(results.amountBurned)} SNR</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>You Receive:</span>
                  <span className="text-sonar-signal">{formatNumber(results.tokensReceived)} SNR</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {!results && purchaseAmount && (
          <div className="text-center py-8 text-sonar-highlight-bright/50 text-sm">
            Enter a valid purchase amount to see calculations
          </div>
        )}
      </div>
    </GlassCard>
  );
}
