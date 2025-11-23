'use client';

import { motion } from 'framer-motion';
import { CheckCircle, ExternalLink, Share2, Copy, Twitter } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { PublishResult, DatasetMetadata } from '@/lib/types/upload';
import { SonarButton } from '@/components/ui/SonarButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { toast } from 'sonner';
import { getTxExplorerUrl } from '@/lib/sui/client';

interface SuccessStepProps {
  publish: PublishResult;
  metadata: DatasetMetadata;
  onClose: () => void;
}

/**
 * SuccessStep Component
 * Displays success message and sharing options
 */
export function SuccessStep({
  publish,
  metadata,
  onClose,
}: SuccessStepProps) {
  const [copied, setCopied] = useState(false);

  // Defensive check - this should never be null, but handle it gracefully
  if (!publish) {
    console.error('[SuccessStep] Publish data is null - this should not happen');
    return (
      <div className="text-center space-y-4">
        <p className="text-sonar-coral">Error: Missing publish data</p>
        <SonarButton onClick={onClose}>Go Back</SonarButton>
      </div>
    );
  }

  const datasetUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/dataset/${publish.datasetId}`;
  const txUrl = getTxExplorerUrl(publish.txDigest);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(datasetUrl);
    setCopied(true);
    toast.success('Link copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareTwitter = () => {
    const text = `I just published "${metadata.title}" on SONAR Protocol! 🎵\n\nDecentralized audio data marketplace built on @SuiNetwork with @WalrusProtocol storage.\n\n${datasetUrl}`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(twitterUrl, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Success Animation */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', duration: 0.6, bounce: 0.5 }}
        className="flex justify-center"
      >
        <div className="relative">
          <motion.div
            className="absolute inset-0 bg-sonar-signal/30 rounded-full blur-2xl"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.5, 0.8, 0.5],
            }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <div className="relative p-8 rounded-full bg-sonar-signal/10">
            <CheckCircle className="w-24 h-24 text-sonar-signal" />
          </div>
        </div>
      </motion.div>

      {/* Success Message */}
      <div className="text-center space-y-3">
        <h2 className="text-3xl font-mono font-bold text-sonar-highlight-bright">
          Dataset Published!
        </h2>
        <p className="text-sonar-highlight/70 max-w-lg mx-auto">
          Your dataset <span className="text-sonar-signal font-semibold">"{metadata.title}"</span> is now live on the SONAR marketplace
        </p>
      </div>

      {/* Transaction Info */}
      <GlassCard>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-sonar-highlight/70 uppercase tracking-wide mb-1 block">
              Dataset ID
            </label>
            <div className="font-mono text-sm text-sonar-signal break-all">
              {publish.datasetId}
            </div>
          </div>

          <div>
            <label className="text-xs text-sonar-highlight/70 uppercase tracking-wide mb-1 block">
              Transaction
            </label>
            <a
              href={txUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex items-center space-x-2',
                'text-sonar-blue hover:text-sonar-signal',
                'transition-colors font-mono text-sm'
              )}
            >
              <span className="truncate max-w-md">{publish.txDigest}</span>
              <ExternalLink className="w-4 h-4 flex-shrink-0" />
            </a>
          </div>
        </div>
      </GlassCard>

      {/* Sharing Options */}
      <GlassCard className="bg-sonar-blue/5">
        <div className="space-y-4">
          <div className="flex items-center space-x-2 text-sonar-blue">
            <Share2 className="w-5 h-5" />
            <h3 className="font-mono font-semibold">Share Your Dataset</h3>
          </div>

          <div className="flex items-center space-x-3">
            <SonarButton
              variant="secondary"
              onClick={handleCopyLink}
              className="flex-1"
            >
              {copied ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Link
                </>
              )}
            </SonarButton>

            <SonarButton
              variant="secondary"
              onClick={handleShareTwitter}
              className="flex-1"
            >
              <Twitter className="w-4 h-4 mr-2" />
              Share on X
            </SonarButton>
          </div>
        </div>
      </GlassCard>

      {/* Next Steps */}
      <GlassCard className="bg-sonar-signal/5">
        <div className="space-y-3">
          <p className="font-mono font-semibold text-sonar-signal">
            What's next?
          </p>
          <ul className="space-y-2 text-sm text-sonar-highlight/80">
            <li className="flex items-start space-x-2">
              <span className="text-sonar-signal mt-0.5">•</span>
              <span>
                Your dataset is now discoverable in the marketplace
              </span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-sonar-signal mt-0.5">•</span>
              <span>
                Buyers can purchase access using SONAR tokens
              </span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-sonar-signal mt-0.5">•</span>
              <span>
                Revenue is automatically sent to your wallet
              </span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-sonar-signal mt-0.5">•</span>
              <span>
                Track your sales and analytics from your profile
              </span>
            </li>
          </ul>
        </div>
      </GlassCard>

      {/* Action Buttons */}
      <div className="flex items-center justify-center gap-4 pt-4">
        <SonarButton variant="secondary" onClick={onClose}>
          Upload Another
        </SonarButton>
        <a href={`/dataset/${publish.datasetId}`}>
          <SonarButton variant="primary">View Dataset →</SonarButton>
        </a>
      </div>

      {/* Confetti Animation */}
      <motion.div
        className="fixed inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 bg-sonar-signal rounded-full"
            initial={{
              x: '50vw',
              y: '50vh',
              scale: 0,
            }}
            animate={{
              x: `${50 + (Math.random() - 0.5) * 80}vw`,
              y: `${50 + (Math.random() - 0.5) * 80}vh`,
              scale: [0, 1, 0],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: 2,
              delay: i * 0.05,
              ease: 'easeOut',
            }}
          />
        ))}
      </motion.div>
    </div>
  );
}
