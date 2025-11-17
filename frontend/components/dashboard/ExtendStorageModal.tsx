'use client';

import { useState } from 'react';
import { useSignAndExecuteTransactionBlock, useSuiClient } from '@mysten/dapp-kit';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { GlassCard } from '@/components/ui/GlassCard';
import { SonarButton } from '@/components/ui/SonarButton';
import { X, Calendar, Coins, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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

interface ExtendStorageModalProps {
  lease: StorageLease;
  onClose: () => void;
  onSuccess: () => void;
}

const EPOCH_DURATION_DAYS = 14;
const EXTENSION_OPTIONS = [
  { epochs: 26, label: '1 Year', days: 364 },
  { epochs: 52, label: '2 Years', days: 728 },
  { epochs: 78, label: '3 Years', days: 1092 },
];

export function ExtendStorageModal({ lease, onClose, onSuccess }: ExtendStorageModalProps) {
  const suiClient = useSuiClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransactionBlock();

  const [selectedEpochs, setSelectedEpochs] = useState(26);
  const [isExtending, setIsExtending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleExtend = async () => {
    setIsExtending(true);
    setError(null);

    try {
      const tx = new TransactionBlock();

      // Call storage_lease::extend_lease
      tx.moveCall({
        target: `${process.env.NEXT_PUBLIC_PACKAGE_ID}::storage_lease::extend_lease`,
        arguments: [
          tx.object(lease.id),
          tx.pure(selectedEpochs, 'u64'),
        ],
      });

      signAndExecute(
        {
          transactionBlock: tx,
          options: {
            showEffects: true,
            showObjectChanges: true,
          },
        },
        {
          onSuccess: (result) => {
            console.log('Storage extended successfully:', result);
            setSuccess(true);
            setTimeout(() => {
              onSuccess();
            }, 2000);
          },
          onError: (err) => {
            console.error('Failed to extend storage:', err);
            setError(err.message || 'Failed to extend storage');
            setIsExtending(false);
          },
        }
      );
    } catch (err) {
      console.error('Transaction error:', err);
      setError(err instanceof Error ? err.message : 'Failed to extend storage');
      setIsExtending(false);
    }
  };

  const calculateNewExpiry = () => {
    const newExpiryEpoch = lease.expires_at_epoch + selectedEpochs;
    const currentEpoch = Math.floor(Date.now() / (1000 * 60 * 60 * 24 * EPOCH_DURATION_DAYS));
    const daysFromNow = (newExpiryEpoch - currentEpoch) * EPOCH_DURATION_DAYS;
    const expiryDate = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
    return expiryDate.toLocaleDateString();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-sonar-abyss/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="max-w-2xl w-full"
        >
          <GlassCard className="bg-sonar-abyss/95 border-sonar-signal/30">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-mono font-bold text-sonar-highlight-bright mb-1">
                  Extend Storage
                </h2>
                <p className="text-sm text-sonar-highlight/70 font-mono">
                  Blob: {lease.walrus_blob_id.slice(0, 24)}...
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-sonar hover:bg-sonar-highlight/10 transition-colors"
              >
                <X className="w-5 h-5 text-sonar-highlight/70" />
              </button>
            </div>

            {!success ? (
              <>
                {/* Current Status */}
                <div className="mb-6 p-4 rounded-sonar bg-sonar-blue/10 border border-sonar-blue/30">
                  <p className="text-sm text-sonar-highlight/70 font-mono mb-2">
                    Current Expiry
                  </p>
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-5 h-5 text-sonar-blue" />
                    <p className="font-mono font-semibold text-sonar-highlight-bright">
                      Epoch {lease.expires_at_epoch}
                    </p>
                  </div>
                </div>

                {/* Extension Options */}
                <div className="mb-6">
                  <p className="text-sm text-sonar-highlight/70 font-mono mb-3">
                    Select Extension Duration
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {EXTENSION_OPTIONS.map((option) => (
                      <button
                        key={option.epochs}
                        onClick={() => setSelectedEpochs(option.epochs)}
                        className={`p-4 rounded-sonar border-2 transition-all ${
                          selectedEpochs === option.epochs
                            ? 'bg-sonar-signal/20 border-sonar-signal'
                            : 'bg-sonar-highlight/5 border-sonar-highlight/20 hover:border-sonar-highlight/40'
                        }`}
                      >
                        <p className="font-mono font-bold text-sonar-highlight-bright mb-1">
                          {option.label}
                        </p>
                        <p className="text-xs text-sonar-highlight/60 font-mono">
                          {option.epochs} epochs
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* New Expiry Preview */}
                <div className="mb-6 p-4 rounded-sonar bg-sonar-signal/10 border border-sonar-signal/30">
                  <p className="text-sm text-sonar-highlight/70 font-mono mb-2">
                    New Expiry Date
                  </p>
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-5 h-5 text-sonar-signal" />
                    <p className="font-mono font-semibold text-sonar-signal">
                      {calculateNewExpiry()} (Epoch {lease.expires_at_epoch + selectedEpochs})
                    </p>
                  </div>
                </div>

                {/* Cost Estimate */}
                <div className="mb-6 p-4 rounded-sonar bg-sonar-highlight/5 border border-sonar-highlight/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Coins className="w-5 h-5 text-sonar-highlight/70" />
                      <p className="text-sm text-sonar-highlight/70 font-mono">
                        Estimated Cost
                      </p>
                    </div>
                    <p className="font-mono font-semibold text-sonar-highlight-bright">
                      TBD
                    </p>
                  </div>
                  <p className="text-xs text-sonar-highlight/50 font-mono mt-2">
                    Cost will be calculated based on storage size and duration
                  </p>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="mb-6 p-4 rounded-sonar bg-sonar-coral/10 border border-sonar-coral/30">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="w-5 h-5 text-sonar-coral" />
                      <p className="text-sm text-sonar-coral font-mono">{error}</p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <SonarButton
                    variant="secondary"
                    onClick={onClose}
                    className="flex-1"
                    disabled={isExtending}
                  >
                    Cancel
                  </SonarButton>
                  <SonarButton
                    onClick={handleExtend}
                    className="flex-1"
                    disabled={isExtending}
                  >
                    {isExtending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Extending...
                      </>
                    ) : (
                      `Extend for ${EXTENSION_OPTIONS.find(o => o.epochs === selectedEpochs)?.label}`
                    )}
                  </SonarButton>
                </div>
              </>
            ) : (
              /* Success State */
              <div className="text-center py-8">
                <CheckCircle className="w-16 h-16 text-sonar-signal mx-auto mb-4" />
                <h3 className="text-xl font-mono font-bold text-sonar-signal mb-2">
                  Storage Extended!
                </h3>
                <p className="text-sonar-highlight/70 font-mono">
                  Your storage has been extended successfully
                </p>
              </div>
            )}
          </GlassCard>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
