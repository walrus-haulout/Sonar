'use client';

import { useState, useEffect, useRef } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { getTierInfo } from '@/lib/tier-utils';
import { formatNumber } from '@/lib/utils';

interface TimeSimulationProps {
  initialSupply: number;
  snrPriceUsd: number;
}

interface SimulationState {
  currentSupply: number;
  totalBurned: number;
  purchaseCount: number;
  currentTier: number;
  elapsedDays: number;
}

export function TimeSimulation({ initialSupply, snrPriceUsd }: TimeSimulationProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [avgPurchaseSize, setAvgPurchaseSize] = useState(100); // USD
  const [purchasesPerDay, setPurchasesPerDay] = useState(10);
  const [state, setState] = useState<SimulationState>({
    currentSupply: initialSupply,
    totalBurned: 0,
    purchaseCount: 0,
    currentTier: getTierInfo(initialSupply).level,
    elapsedDays: 0,
  });
  const [history, setHistory] = useState<{ day: number; supply: number; tier: number }[]>([
    { day: 0, supply: initialSupply, tier: getTierInfo(initialSupply).level }
  ]);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const runSimulationStep = () => {
    setState((prev) => {
      // Calculate burns for one day
      const tokensPerPurchase = avgPurchaseSize / snrPriceUsd;
      let newSupply = prev.currentSupply;
      let dayBurned = 0;

      for (let i = 0; i < purchasesPerDay; i++) {
        const tier = getTierInfo(newSupply);
        const burnAmount = tokensPerPurchase * (tier.burnRate / 100);
        newSupply -= burnAmount;
        dayBurned += burnAmount;
      }

      const newTier = getTierInfo(newSupply);
      const newDay = prev.elapsedDays + 1;

      // Update history
      setHistory((h) => [...h, { day: newDay, supply: newSupply, tier: newTier.level }]);

      return {
        currentSupply: newSupply,
        totalBurned: prev.totalBurned + dayBurned,
        purchaseCount: prev.purchaseCount + purchasesPerDay,
        currentTier: newTier.level,
        elapsedDays: newDay,
      };
    });
  };

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(runSimulationStep, 1000 / speed);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, speed, avgPurchaseSize, purchasesPerDay]);

  const handleReset = () => {
    setIsPlaying(false);
    setState({
      currentSupply: initialSupply,
      totalBurned: 0,
      purchaseCount: 0,
      currentTier: getTierInfo(initialSupply).level,
      elapsedDays: 0,
    });
    setHistory([{ day: 0, supply: initialSupply, tier: getTierInfo(initialSupply).level }]);
  };

  const supplyPercentage = ((state.currentSupply / initialSupply) * 100).toFixed(1);
  const burnPercentage = ((state.totalBurned / initialSupply) * 100).toFixed(1);

  return (
    <GlassCard>
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-mono text-sonar-highlight">Time-Based Simulation</h3>
            <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded-sonar">
              ANIMATED
            </span>
          </div>
          <p className="text-sm text-sonar-highlight-bright/70">
            Watch how repeated purchases affect supply and trigger tier transitions over time
          </p>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-mono text-sonar-highlight-bright/70 mb-2">
              Avg Purchase Size (USD)
            </label>
            <input
              type="range"
              min="10"
              max="1000"
              step="10"
              value={avgPurchaseSize}
              onChange={(e) => setAvgPurchaseSize(Number(e.target.value))}
              disabled={isPlaying}
              className="w-full"
            />
            <p className="text-sm font-mono text-sonar-highlight mt-1">${avgPurchaseSize}</p>
          </div>

          <div>
            <label className="block text-xs font-mono text-sonar-highlight-bright/70 mb-2">
              Purchases per Day
            </label>
            <input
              type="range"
              min="1"
              max="100"
              step="1"
              value={purchasesPerDay}
              onChange={(e) => setPurchasesPerDay(Number(e.target.value))}
              disabled={isPlaying}
              className="w-full"
            />
            <p className="text-sm font-mono text-sonar-highlight mt-1">{purchasesPerDay}x</p>
          </div>

          <div>
            <label className="block text-xs font-mono text-sonar-highlight-bright/70 mb-2">
              Simulation Speed
            </label>
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.5"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-sm font-mono text-sonar-highlight mt-1">{speed}x</p>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="px-6 py-2 bg-sonar-signal/20 hover:bg-sonar-signal/30 border border-sonar-signal/40 text-sonar-signal font-mono rounded-sonar transition-all"
          >
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
          <button
            onClick={handleReset}
            className="px-6 py-2 bg-sonar-highlight/10 hover:bg-sonar-highlight/20 border border-sonar-highlight/30 text-sonar-highlight font-mono rounded-sonar transition-all"
          >
            ↻ Reset
          </button>
        </div>

        {/* Current State Display */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-sonar-abyss/50 border border-white/10 rounded-sonar">
            <p className="text-xs text-sonar-highlight-bright/60 mb-1 font-mono">Elapsed</p>
            <p className="text-xl font-mono font-bold text-sonar-highlight">{state.elapsedDays}</p>
            <p className="text-xs text-sonar-highlight-bright/50">days</p>
          </div>

          <div className="p-4 bg-sonar-signal/10 border border-sonar-signal/30 rounded-sonar">
            <p className="text-xs text-sonar-highlight-bright/60 mb-1 font-mono">Current Supply</p>
            <p className="text-xl font-mono font-bold text-sonar-signal">
              {formatNumber(state.currentSupply)}
            </p>
            <p className="text-xs text-sonar-highlight-bright/50">{supplyPercentage}% remaining</p>
          </div>

          <div className="p-4 bg-sonar-coral/10 border border-sonar-coral/30 rounded-sonar">
            <p className="text-xs text-sonar-highlight-bright/60 mb-1 font-mono">Total Burned</p>
            <p className="text-xl font-mono font-bold text-sonar-coral">
              {formatNumber(state.totalBurned)}
            </p>
            <p className="text-xs text-sonar-highlight-bright/50">{burnPercentage}% of supply</p>
          </div>

          <div className="p-4 bg-sonar-highlight/10 border border-sonar-highlight/30 rounded-sonar">
            <p className="text-xs text-sonar-highlight-bright/60 mb-1 font-mono">Current Tier</p>
            <p className="text-xl font-mono font-bold text-sonar-highlight">
              Tier {state.currentTier}
            </p>
            <p className="text-xs text-sonar-highlight-bright/50">{state.purchaseCount} purchases</p>
          </div>
        </div>

        {/* Supply Progress Bar */}
        <div>
          <div className="flex justify-between text-xs font-mono text-sonar-highlight-bright/70 mb-2">
            <span>Supply Depletion</span>
            <span>{burnPercentage}% burned</span>
          </div>
          <div className="h-4 bg-sonar-abyss/50 rounded-sonar overflow-hidden border border-white/10">
            <div
              className="h-full bg-gradient-to-r from-sonar-coral via-sonar-coral/80 to-sonar-coral transition-all duration-500"
              style={{ width: `${burnPercentage}%` }}
            />
          </div>
        </div>

        {/* Mini Chart */}
        <div className="p-4 bg-sonar-abyss/30 border border-white/5 rounded-sonar">
          <p className="text-xs font-mono text-sonar-highlight-bright/60 mb-3">Supply Over Time</p>
          <div className="h-32 flex items-end gap-1">
            {history.slice(-30).map((point, idx) => {
              const height = (point.supply / initialSupply) * 100;
              const tierColor =
                point.tier === 1 ? 'bg-sonar-coral' :
                point.tier === 2 ? 'bg-sonar-signal' :
                'bg-sonar-highlight';

              return (
                <div
                  key={idx}
                  className={`flex-1 ${tierColor} rounded-t transition-all`}
                  style={{ height: `${height}%` }}
                  title={`Day ${point.day}: ${formatNumber(point.supply)} (Tier ${point.tier})`}
                />
              );
            })}
          </div>
          <p className="text-xs text-sonar-highlight-bright/50 mt-2 text-center">
            Last {Math.min(30, history.length)} days • Color = Tier
          </p>
        </div>
      </div>
    </GlassCard>
  );
}
