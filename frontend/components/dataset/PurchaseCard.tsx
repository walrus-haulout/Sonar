'use client';

import { useCurrentAccount } from '@mysten/dapp-kit';
import { GlassCard } from '@/components/ui/GlassCard';
import { SonarButton } from '@/components/ui/SonarButton';
import { SignalBadge } from '@/components/ui/SignalBadge';
import { getTierInfo, calculateBurnAmount, calculateCreatorReward } from '@/lib/tier-utils';
import { formatSonarAmount } from '@/lib/tier-utils';
import { getTxExplorerUrl } from '@/lib/sui/client';
import { usePurchase } from '@/hooks/usePurchase';
import type { Dataset } from '@/types/blockchain';
import type { ProtocolStats } from '@/types/blockchain';

interface PurchaseCardProps {
  dataset: Dataset;
  stats?: ProtocolStats;
}

/**
 * PurchaseCard Component
 * Displays pricing, burn breakdown, and purchase button for marketplace purchases
 */
export function PurchaseCard({ dataset, stats }: PurchaseCardProps) {
  const currentAccount = useCurrentAccount();
  const { purchaseDataset, state, reset } = usePurchase();

  const price = Number(dataset.price) / 1_000_000; // Convert from smallest units
  const currentTier = stats ? getTierInfo(stats.circulating_supply) : null;

  // Calculate burn and creator amounts
  const burnAmount = stats ? calculateBurnAmount(price, stats.circulating_supply) : price * 0.6;
  const creatorAmount = stats ? calculateCreatorReward(price, stats.circulating_supply) : price * 0.4;

  const handlePurchase = async () => {
    if (!currentAccount) {
      alert('Please connect your wallet first');
      return;
    }

    await purchaseDataset(dataset);
  };

  return (
    <GlassCard className="sonar-glow">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-mono text-sonar-highlight">Purchase Dataset</h3>
      </div>

      {/* Price Display */}
      <div className="text-center py-6 mb-6 bg-sonar-abyss/30 rounded-sonar border border-sonar-signal/20">
        <div className="text-5xl font-mono font-bold text-sonar-signal mb-2">
          {price.toFixed(2)}
        </div>
        <div className="text-sm text-sonar-highlight-bright/60 uppercase tracking-wide">
          SONAR
        </div>
      </div>

      {/* Current Tier Info */}
      {currentTier && (
        <div className="mb-6 p-4 bg-sonar-abyss/20 rounded-sonar border border-sonar-highlight/20">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-sonar-highlight-bright/70">Current Tier</span>
            <SignalBadge
              variant={currentTier.level === 1 ? 'danger' : currentTier.level === 2 ? 'warning' : 'success'}
              className="text-xs"
            >
              Tier {currentTier.level}
            </SignalBadge>
          </div>
          <div className="text-xs text-sonar-highlight-bright/60">
            {currentTier.description}
          </div>
        </div>
      )}

      {/* Token Economics Breakdown */}
      <div className="space-y-3 mb-6">
        <h4 className="text-sm font-mono text-sonar-highlight-bright/70 mb-3">
          Purchase Breakdown
        </h4>

        {/* Burn Amount */}
        <div className="flex justify-between items-center py-3 bg-sonar-abyss/20 rounded-sonar px-4">
          <div className="flex items-center space-x-2">
            <span className="text-2xl">🔥</span>
            <span className="text-sm text-sonar-highlight-bright/70">Tokens Burned</span>
          </div>
          <div className="text-right">
            <div className="text-sm font-mono text-sonar-coral font-bold">
              {burnAmount.toFixed(2)} SONAR
            </div>
            <div className="text-xs text-sonar-highlight-bright/50">
              {currentTier ? `${(currentTier.burnRate * 100).toFixed(0)}%` : '60%'}
            </div>
          </div>
        </div>

        {/* Creator Reward */}
        <div className="flex justify-between items-center py-3 bg-sonar-abyss/20 rounded-sonar px-4">
          <div className="flex items-center space-x-2">
            <span className="text-2xl">👤</span>
            <span className="text-sm text-sonar-highlight-bright/70">Creator Receives</span>
          </div>
          <div className="text-right">
            <div className="text-sm font-mono text-sonar-highlight font-bold">
              {creatorAmount.toFixed(2)} SONAR
            </div>
            <div className="text-xs text-sonar-highlight-bright/50">
              {currentTier ? `${((1 - currentTier.burnRate) * 100).toFixed(0)}%` : '40%'}
            </div>
          </div>
        </div>
      </div>

      {/* Purchase Button */}
      {dataset.listed ? (
        <div className="space-y-3">
          {/* Transaction Success */}
          {state.isSuccess && state.digest && (
            <div className="p-4 bg-sonar-highlight/10 rounded-sonar border border-sonar-highlight/30 mb-3">
              <div className="flex items-center space-x-2 mb-2">
                <span className="text-lg">✓</span>
                <span className="text-sm font-mono text-sonar-highlight">
                  Purchase Successful!
                </span>
              </div>
              <a
                href={getTxExplorerUrl(state.digest)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-sonar-signal hover:text-sonar-highlight-bright underline"
              >
                View on Explorer →
              </a>
            </div>
          )}

          {/* Transaction Error */}
          {state.isError && state.error && (
            <div className="p-4 bg-sonar-coral/10 rounded-sonar border border-sonar-coral/30 mb-3">
              <div className="flex items-center space-x-2 mb-2">
                <span className="text-lg">⚠️</span>
                <span className="text-sm font-mono text-sonar-coral">
                  Transaction Failed
                </span>
              </div>
              <p className="text-xs text-sonar-highlight-bright/70">
                {state.error.message}
              </p>
              <SonarButton
                variant="secondary"
                onClick={reset}
                className="w-full text-sm mt-3"
              >
                Try Again
              </SonarButton>
            </div>
          )}

          {/* Purchase Button */}
          {!state.isSuccess && (
            <SonarButton
              variant="primary"
              onClick={handlePurchase}
              disabled={state.isPurchasing || !currentAccount}
              className="w-full text-lg py-4"
            >
              {state.isPurchasing
                ? 'Processing Transaction...'
                : !currentAccount
                  ? 'Connect Wallet to Purchase'
                  : 'Purchase Dataset'}
            </SonarButton>
          )}
        </div>
      ) : (
        <div className="text-center py-4">
          <SignalBadge variant="danger">Unlisted</SignalBadge>
          <p className="text-xs text-sonar-highlight-bright/50 mt-2">
            This dataset is not currently available for purchase
          </p>
        </div>
      )}

      {/* What You Get */}
      <div className="mt-6 pt-6 border-t border-white/5">
        <h4 className="text-sm font-mono text-sonar-highlight-bright/70 mb-3">What You Get</h4>
        <ul className="space-y-2 text-xs text-sonar-highlight-bright/70">
          <li className="flex items-start">
            <span className="text-sonar-signal mr-2">✓</span>
            <span>Lifetime access to full audio dataset</span>
          </li>
          <li className="flex items-start">
            <span className="text-sonar-signal mr-2">✓</span>
            <span>All available formats ({dataset.formats.join(', ')})</span>
          </li>
          <li className="flex items-start">
            <span className="text-sonar-signal mr-2">✓</span>
            <span>Commercial use license</span>
          </li>
          <li className="flex items-start">
            <span className="text-sonar-signal mr-2">✓</span>
            <span>Decrypted via Seal encryption by Mysten Labs (privacy-first)</span>
          </li>
          <li className="flex items-start">
            <span className="text-sonar-signal mr-2">✓</span>
            <span>{formatSonarAmount(dataset.sample_count)} audio samples</span>
          </li>
        </ul>
      </div>

      {/* Security Note */}
      <div className="mt-6 p-3 bg-sonar-signal/5 rounded-sonar border border-sonar-signal/20">
        <p className="text-xs text-sonar-highlight-bright/60">
          <span className="font-mono text-sonar-signal">🔒 Secure:</span> Purchase is recorded
          on Sui blockchain. Audio files are stored on Walrus with end-to-end encryption.
        </p>
      </div>
    </GlassCard>
  );
}
