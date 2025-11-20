'use client';

import { useCurrentAccount } from '@mysten/dapp-kit';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { SonarButton } from '@/components/ui/SonarButton';
import { SonarBackground } from '@/components/animations/SonarBackground';
import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { UserSubmissions } from '@/components/dashboard/UserSubmissions';
import { Database, Upload, TrendingUp } from 'lucide-react';

interface DashboardFilters {
  status?: 'all' | 'active' | 'warning' | 'expired';
  listing?: 'all' | 'listed' | 'unlisted';
}

export default function DashboardPage() {
  const account = useCurrentAccount();
  const router = useRouter();
  const [filters, setFilters] = useState<DashboardFilters>({
    status: 'all',
    listing: 'all',
  });

  useEffect(() => {
    if (!account) {
      router.push('/');
    }
  }, [account, router]);

  if (!account) {
    return null;
  }

  return (
    <main className="relative min-h-screen">
      {/* Background Animation */}
      <SonarBackground opacity={0.2} intensity={0.5} />

      <div className="relative z-10 container mx-auto px-6 py-12">
        {/* Page Header */}
        <div className="max-w-6xl mx-auto mb-12">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-5xl font-mono tracking-radar text-sonar-highlight mb-4">
                Dashboard
              </h1>
              <p className="text-xl text-sonar-highlight-bright/80">
                Manage your audio datasets and storage
              </p>
            </div>
            <div className="flex gap-3">
              <SonarButton
                variant="primary"
                onClick={() => router.push('/upload')}
                className="flex items-center space-x-2"
              >
                <Upload className="w-5 h-5" />
                <span>Upload</span>
              </SonarButton>
              <SonarButton
                variant="secondary"
                onClick={() => router.push('/marketplace')}
              >
                Browse
              </SonarButton>
            </div>
          </div>
        </div>

        {/* Dashboard Stats */}
        <div className="max-w-6xl mx-auto mb-12">
          <DashboardStats walletAddress={account.address} />
        </div>

        {/* Filters + Results */}
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sidebar Filters */}
            <aside className="lg:col-span-1">
              <GlassCard className="sticky top-24">
                <h3 className="text-lg font-mono text-sonar-highlight mb-4">
                  Filters
                </h3>

                {/* Status Filter */}
                <div className="mb-6">
                  <label className="block text-sm text-sonar-highlight-bright/70 mb-2">
                    Storage Status
                  </label>
                  <select
                    value={filters.status || 'all'}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        status: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 bg-sonar-abyss/50 border border-sonar-signal/30 rounded-sonar text-sonar-highlight-bright focus:outline-none focus:ring-2 focus:ring-sonar-signal"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="warning">Expiring Soon</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>

                {/* Listing Filter */}
                <div className="mb-6">
                  <label className="block text-sm text-sonar-highlight-bright/70 mb-2">
                    Marketplace Listing
                  </label>
                  <select
                    value={filters.listing || 'all'}
                    onChange={(e) =>
                      setFilters({
                        ...filters,
                        listing: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 bg-sonar-abyss/50 border border-sonar-signal/30 rounded-sonar text-sonar-highlight-bright focus:outline-none focus:ring-2 focus:ring-sonar-signal"
                  >
                    <option value="all">All Listings</option>
                    <option value="listed">Listed for Sale</option>
                    <option value="unlisted">Not Listed</option>
                  </select>
                </div>

                {/* Clear Filters */}
                {(filters.status !== 'all' || filters.listing !== 'all') && (
                  <SonarButton
                    variant="secondary"
                    onClick={() => setFilters({ status: 'all', listing: 'all' })}
                    className="w-full text-sm"
                  >
                    Clear Filters
                  </SonarButton>
                )}
              </GlassCard>
            </aside>

            {/* Results Grid */}
            <div className="lg:col-span-3">
              <UserSubmissions
                walletAddress={account.address}
                filters={filters}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
