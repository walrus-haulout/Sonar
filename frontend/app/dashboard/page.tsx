'use client';

import { useCurrentAccount } from '@mysten/dapp-kit';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { SonarButton } from '@/components/ui/SonarButton';
import { UserSubmissions } from '@/components/dashboard/UserSubmissions';
import { Database, Upload, TrendingUp } from 'lucide-react';

export default function DashboardPage() {
  const account = useCurrentAccount();
  const router = useRouter();

  useEffect(() => {
    if (!account) {
      router.push('/');
    }
  }, [account, router]);

  if (!account) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-mono font-bold text-sonar-highlight-bright mb-2">
          Dashboard
        </h1>
        <p className="text-sonar-highlight/70">
          Manage your audio datasets and storage
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <GlassCard className="bg-sonar-signal/5 border border-sonar-signal/30">
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-sonar bg-sonar-signal/10">
              <Database className="w-6 h-6 text-sonar-signal" />
            </div>
            <div>
              <p className="text-sm text-sonar-highlight/60 font-mono">
                Total Datasets
              </p>
              <p className="text-2xl font-mono font-bold text-sonar-highlight-bright">
                —
              </p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="bg-sonar-blue/5 border border-sonar-blue/30">
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-sonar bg-sonar-blue/10">
              <Upload className="w-6 h-6 text-sonar-blue" />
            </div>
            <div>
              <p className="text-sm text-sonar-highlight/60 font-mono">
                Active Storage
              </p>
              <p className="text-2xl font-mono font-bold text-sonar-highlight-bright">
                —
              </p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="bg-sonar-coral/5 border border-sonar-coral/30">
          <div className="flex items-center space-x-4">
            <div className="p-3 rounded-sonar bg-sonar-coral/10">
              <TrendingUp className="w-6 h-6 text-sonar-coral" />
            </div>
            <div>
              <p className="text-sm text-sonar-highlight/60 font-mono">
                Total Sales
              </p>
              <p className="text-2xl font-mono font-bold text-sonar-highlight-bright">
                —
              </p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 mb-8">
        <SonarButton onClick={() => router.push('/upload')}>
          Upload New Dataset
        </SonarButton>
        <SonarButton variant="secondary" onClick={() => router.push('/marketplace')}>
          Browse Marketplace
        </SonarButton>
      </div>

      {/* User Submissions Table */}
      <UserSubmissions walletAddress={account.address} />
    </div>
  );
}
