'use client';

import { useState, useEffect } from 'react';
import { useSuiClient } from '@mysten/dapp-kit';
import { GlassCard } from '@/components/ui/GlassCard';
import { SonarButton } from '@/components/ui/SonarButton';
import { Clock, Calendar, Plus, AlertCircle, Loader2, Database } from 'lucide-react';
import { ExtendStorageModal } from './ExtendStorageModal';

interface StorageLease {
  id: string;
  owner: string;
  submission_id: string;
  walrus_blob_id: string;
  capacity_bytes: number;
  created_at_epoch: number;
  expires_at_epoch: number;
  lease_duration_epochs: number;
  total_renewals: number;
}

interface UserSubmissionsProps {
  walletAddress: string;
}

const EPOCH_DURATION_DAYS = 14; // Mainnet epoch = 14 days

export function UserSubmissions({ walletAddress }: UserSubmissionsProps) {
  const suiClient = useSuiClient();
  const [leases, setLeases] = useState<StorageLease[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLease, setSelectedLease] = useState<StorageLease | null>(null);

  useEffect(() => {
    fetchUserSubmissions();
  }, [walletAddress]);

  const fetchUserSubmissions = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Query for StorageLease objects owned by the user
      const ownedObjects = await suiClient.getOwnedObjects({
        owner: walletAddress,
        filter: {
          StructType: `${process.env.NEXT_PUBLIC_PACKAGE_ID}::storage_lease::StorageLease`,
        },
        options: {
          showContent: true,
          showType: true,
        },
      });

      const leasesData: StorageLease[] = [];

      for (const obj of ownedObjects.data) {
        if (obj.data?.content?.dataType === 'moveObject') {
          const fields = obj.data.content.fields as any;
          leasesData.push({
            id: fields.id.id,
            owner: fields.owner,
            submission_id: fields.submission_id,
            walrus_blob_id: fields.walrus_blob_id,
            capacity_bytes: parseInt(fields.capacity_bytes),
            created_at_epoch: parseInt(fields.created_at_epoch),
            expires_at_epoch: parseInt(fields.expires_at_epoch),
            lease_duration_epochs: parseInt(fields.lease_duration_epochs),
            total_renewals: parseInt(fields.total_renewals),
          });
        }
      }

      setLeases(leasesData);
    } catch (err) {
      console.error('Failed to fetch submissions:', err);
      setError(err instanceof Error ? err.message : 'Failed to load submissions');
    } finally {
      setIsLoading(false);
    }
  };

  const calculateDaysUntilExpiry = (expiresAtEpoch: number, currentEpoch: number): number => {
    const epochsRemaining = expiresAtEpoch - currentEpoch;
    return epochsRemaining * EPOCH_DURATION_DAYS;
  };

  const formatExpiryDate = (expiresAtEpoch: number): string => {
    // Estimate based on current date and epochs
    const currentEpoch = Math.floor(Date.now() / (1000 * 60 * 60 * 24 * EPOCH_DURATION_DAYS));
    const epochsRemaining = expiresAtEpoch - currentEpoch;
    const daysRemaining = epochsRemaining * EPOCH_DURATION_DAYS;
    const expiryDate = new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000);
    return expiryDate.toLocaleDateString();
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const getExpiryStatus = (expiresAtEpoch: number): 'active' | 'warning' | 'expired' => {
    const currentEpoch = Math.floor(Date.now() / (1000 * 60 * 60 * 24 * EPOCH_DURATION_DAYS));
    const epochsRemaining = expiresAtEpoch - currentEpoch;

    if (epochsRemaining <= 0) return 'expired';
    if (epochsRemaining <= 4) return 'warning'; // Warning if < 2 months
    return 'active';
  };

  if (isLoading) {
    return (
      <GlassCard className="text-center py-12">
        <Loader2 className="w-8 h-8 text-sonar-signal animate-spin mx-auto mb-4" />
        <p className="text-sonar-highlight/70">Loading your submissions...</p>
      </GlassCard>
    );
  }

  if (error) {
    return (
      <GlassCard className="bg-sonar-coral/10 border border-sonar-coral/30">
        <div className="flex items-center space-x-3">
          <AlertCircle className="w-6 h-6 text-sonar-coral" />
          <div>
            <p className="font-mono font-semibold text-sonar-coral">Error Loading Submissions</p>
            <p className="text-sm text-sonar-highlight/70 mt-1">{error}</p>
          </div>
        </div>
      </GlassCard>
    );
  }

  if (leases.length === 0) {
    return (
      <GlassCard className="text-center py-12">
        <Database className="w-16 h-16 text-sonar-highlight/30 mx-auto mb-4" />
        <h3 className="text-xl font-mono font-bold text-sonar-highlight-bright mb-2">
          No Submissions Yet
        </h3>
        <p className="text-sonar-highlight/70 mb-6">
          Upload your first audio dataset to get started
        </p>
        <SonarButton onClick={() => window.location.href = '/upload'}>
          Upload Dataset
        </SonarButton>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-mono font-bold text-sonar-highlight-bright mb-4">
        My Submissions ({leases.length})
      </h2>

      <div className="space-y-3">
        {leases.map((lease) => {
          const status = getExpiryStatus(lease.expires_at_epoch);
          const currentEpoch = Math.floor(Date.now() / (1000 * 60 * 60 * 24 * EPOCH_DURATION_DAYS));
          const daysRemaining = calculateDaysUntilExpiry(lease.expires_at_epoch, currentEpoch);

          return (
            <GlassCard
              key={lease.id}
              className={
                status === 'expired'
                  ? 'bg-sonar-coral/10 border-sonar-coral/30'
                  : status === 'warning'
                  ? 'bg-yellow-500/10 border-yellow-500/30'
                  : 'bg-sonar-signal/5 border-sonar-signal/30'
              }
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-3">
                    <h3 className="font-mono font-semibold text-sonar-highlight-bright">
                      {lease.walrus_blob_id.slice(0, 16)}...
                    </h3>
                    <span
                      className={`text-xs font-mono px-2 py-1 rounded ${
                        status === 'expired'
                          ? 'bg-sonar-coral/20 text-sonar-coral'
                          : status === 'warning'
                          ? 'bg-yellow-500/20 text-yellow-500'
                          : 'bg-sonar-signal/20 text-sonar-signal'
                      }`}
                    >
                      {status === 'expired'
                        ? 'Expired'
                        : status === 'warning'
                        ? 'Expiring Soon'
                        : 'Active'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-sonar-highlight/50 font-mono mb-1">Storage Size</p>
                      <p className="text-sonar-highlight font-mono">
                        {formatBytes(lease.capacity_bytes)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sonar-highlight/50 font-mono mb-1">Expires</p>
                      <div className="flex items-center space-x-2">
                        <Calendar className="w-4 h-4 text-sonar-highlight/70" />
                        <p className="text-sonar-highlight font-mono">
                          {formatExpiryDate(lease.expires_at_epoch)}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sonar-highlight/50 font-mono mb-1">Time Remaining</p>
                      <div className="flex items-center space-x-2">
                        <Clock className="w-4 h-4 text-sonar-highlight/70" />
                        <p className="text-sonar-highlight font-mono">
                          {daysRemaining > 0 ? `${daysRemaining} days` : 'Expired'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {lease.total_renewals > 0 && (
                    <p className="text-xs text-sonar-highlight/50 font-mono mt-3">
                      Renewed {lease.total_renewals} time{lease.total_renewals !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>

                <div className="ml-4">
                  <SonarButton
                    variant={status === 'expired' ? 'primary' : 'secondary'}
                    onClick={() => setSelectedLease(lease)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {status === 'expired' ? 'Renew' : 'Extend'}
                  </SonarButton>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* Extend Storage Modal */}
      {selectedLease && (
        <ExtendStorageModal
          lease={selectedLease}
          onClose={() => setSelectedLease(null)}
          onSuccess={() => {
            setSelectedLease(null);
            fetchUserSubmissions();
          }}
        />
      )}
    </div>
  );
}
