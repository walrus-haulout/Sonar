'use client';

import { useState, useEffect } from 'react';
import { useSuiClient } from '@mysten/dapp-kit';
import { GlassCard } from '@/components/ui/GlassCard';
import { SignalBadge } from '@/components/ui/SignalBadge';
import { Database, TrendingUp, Zap, Clock, Loader2 } from 'lucide-react';

interface DashboardStatsProps {
  walletAddress: string;
}

interface StorageLease {
  capacity_bytes: number;
  expires_at_epoch: number;
}

interface AudioSubmission {
  id: string;
  price: bigint;
  total_purchases?: number;
}

type TokenType = 'SUI' | 'SNR';

const EPOCH_DURATION_DAYS = 14;

export function DashboardStats({ walletAddress }: DashboardStatsProps) {
  const suiClient = useSuiClient();
  const [stats, setStats] = useState({
    totalDatasets: 0,
    totalStorageGb: 0,
    totalPurchases: 0,
  });
  const [tokenType, setTokenType] = useState<TokenType>('SUI');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [walletAddress]);

  const fetchStats = async () => {
    try {
      // Fetch storage leases
      const leases = await suiClient.getOwnedObjects({
        owner: walletAddress,
        filter: {
          StructType: `${process.env.NEXT_PUBLIC_PACKAGE_ID}::storage_lease::StorageLease`,
        },
        options: {
          showContent: true,
          showType: true,
        },
      });

      let totalStorageBytes = 0;
      leases.data.forEach((obj) => {
        if (obj.data?.content?.dataType === 'moveObject') {
          const fields = obj.data.content.fields as any;
          totalStorageBytes += parseInt(fields.capacity_bytes);
        }
      });

      // Fetch audio submissions for purchase count
      const submissions = await suiClient.getOwnedObjects({
        owner: walletAddress,
        filter: {
          StructType: `${process.env.NEXT_PUBLIC_PACKAGE_ID}::marketplace::AudioSubmission`,
        },
        options: {
          showContent: true,
          showType: true,
        },
      });

      let totalPurchases = 0;
      submissions.data.forEach((obj) => {
        if (obj.data?.content?.dataType === 'moveObject') {
          const fields = obj.data.content.fields as any;
          totalPurchases += parseInt(fields.total_purchases || 0);
        }
      });

      setStats({
        totalDatasets: leases.data.length,
        totalStorageGb: totalStorageBytes / (1024 * 1024 * 1024),
        totalPurchases,
      });
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatStorage = (gb: number): string => {
    if (gb < 1) return `${(gb * 1024).toFixed(2)} MB`;
    return `${gb.toFixed(2)} GB`;
  };

  return (
    <div className="space-y-6">
      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Datasets */}
        <GlassCard className="bg-sonar-signal/5 border border-sonar-signal/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-sonar-highlight/60 font-mono mb-2">
                Total Uploads
              </p>
              {isLoading ? (
                <Loader2 className="w-6 h-6 text-sonar-signal animate-spin" />
              ) : (
                <p className="text-3xl font-mono font-bold text-sonar-highlight-bright">
                  {stats.totalDatasets}
                </p>
              )}
            </div>
            <Database className="w-8 h-8 text-sonar-signal/40" />
          </div>
        </GlassCard>

        {/* Total Storage */}
        <GlassCard className="bg-sonar-blue/5 border border-sonar-blue/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-sonar-highlight/60 font-mono mb-2">
                Storage Used
              </p>
              {isLoading ? (
                <Loader2 className="w-6 h-6 text-sonar-blue animate-spin" />
              ) : (
                <p className="text-3xl font-mono font-bold text-sonar-highlight-bright">
                  {formatStorage(stats.totalStorageGb)}
                </p>
              )}
            </div>
            <Zap className="w-8 h-8 text-sonar-blue/40" />
          </div>
        </GlassCard>

        {/* Total Purchases */}
        <GlassCard className="bg-sonar-coral/5 border border-sonar-coral/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-sonar-highlight/60 font-mono mb-2">
                Total Sales
              </p>
              {isLoading ? (
                <Loader2 className="w-6 h-6 text-sonar-coral animate-spin" />
              ) : (
                <p className="text-3xl font-mono font-bold text-sonar-highlight-bright">
                  {stats.totalPurchases}
                </p>
              )}
            </div>
            <TrendingUp className="w-8 h-8 text-sonar-coral/40" />
          </div>
        </GlassCard>

        {/* Revenue Tracker */}
        <GlassCard className="bg-sonar-highlight/5 border border-sonar-highlight/30">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-sonar-highlight/60 font-mono">
                Revenue
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setTokenType('SUI')}
                  className={`text-xs font-mono px-2 py-1 rounded transition-all ${
                    tokenType === 'SUI'
                      ? 'bg-sonar-signal/20 text-sonar-signal'
                      : 'text-sonar-highlight/60 hover:text-sonar-highlight'
                  }`}
                >
                  SUI
                </button>
                <button
                  onClick={() => setTokenType('SNR')}
                  className={`text-xs font-mono px-2 py-1 rounded transition-all ${
                    tokenType === 'SNR'
                      ? 'bg-sonar-signal/20 text-sonar-signal'
                      : 'text-sonar-highlight/60 hover:text-sonar-highlight'
                  }`}
                  disabled
                  title="SNR launches soon"
                >
                  SNR*
                </button>
              </div>
            </div>
            {tokenType === 'SUI' ? (
              <div>
                <p className="text-2xl font-mono font-bold text-sonar-highlight-bright">
                  — SUI
                </p>
                <p className="text-xs text-sonar-highlight/50 mt-1">
                  Coming from purchases
                </p>
              </div>
            ) : (
              <div>
                <p className="text-xs text-sonar-highlight/50">
                  SNR token launches in coming months
                </p>
              </div>
            )}
          </div>
        </GlassCard>
      </div>

      {/* Vesting Info (Example Preview) */}
      {tokenType === 'SNR' && (
        <GlassCard className="bg-sonar-signal/10 border border-sonar-signal/30 p-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-3 mb-4">
              <Clock className="w-5 h-5 text-sonar-signal" />
              <h3 className="text-lg font-mono text-sonar-highlight-bright">
                SNR Vesting Preview
              </h3>
              <span className="text-xs bg-sonar-signal/20 text-sonar-signal px-2 py-1 rounded font-mono">
                Example
              </span>
            </div>

            <p className="text-sm text-sonar-highlight/70 font-mono">
              Once SNR launches, your earnings will vest according to this schedule:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div className="bg-sonar-abyss/30 rounded-sonar p-4 border border-sonar-signal/20">
                <p className="text-xs text-sonar-highlight/60 font-mono mb-2">
                  Immediate (40%)
                </p>
                <p className="text-2xl font-mono font-bold text-sonar-highlight-bright">
                  40%
                </p>
                <p className="text-xs text-sonar-highlight/50 mt-2">
                  Liquid at launch
                </p>
              </div>

              <div className="bg-sonar-abyss/30 rounded-sonar p-4 border border-sonar-signal/20">
                <p className="text-xs text-sonar-highlight/60 font-mono mb-2">
                  6-Month Vest
                </p>
                <p className="text-2xl font-mono font-bold text-sonar-highlight-bright">
                  30%
                </p>
                <p className="text-xs text-sonar-highlight/50 mt-2">
                  Linear over 6 months
                </p>
              </div>

              <div className="bg-sonar-abyss/30 rounded-sonar p-4 border border-sonar-signal/20">
                <p className="text-xs text-sonar-highlight/60 font-mono mb-2">
                  1-Year Vest
                </p>
                <p className="text-2xl font-mono font-bold text-sonar-highlight-bright">
                  30%
                </p>
                <p className="text-xs text-sonar-highlight/50 mt-2">
                  Linear over 1 year
                </p>
              </div>
            </div>

            <p className="text-xs text-sonar-highlight/50 mt-4 font-mono">
              Vesting schedule is illustrative and may change at SNR launch.
            </p>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
