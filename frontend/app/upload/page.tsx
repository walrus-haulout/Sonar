'use client';

import { useCurrentAccount } from '@mysten/dapp-kit';
import { ConnectButton } from '@mysten/dapp-kit';
import { useState } from 'react';
import { UploadWizard } from '@/components/upload/UploadWizard';
import { GlassCard } from '@/components/ui/GlassCard';
import { SonarBackground } from '@/components/animations/SonarBackground';
import { Wallet } from 'lucide-react';

export default function UploadPage() {
  const account = useCurrentAccount();
  const [isOpen, setIsOpen] = useState(true);

  console.log('[UploadPage] 📊 Render:', {
    timestamp: new Date().toISOString(),
    hasAccount: !!account,
    accountAddress: account?.address || 'undefined',
    isOpen,
  });

  const handleClose = () => {
    console.log('[UploadPage] 🔔 handleClose called');
    setIsOpen(false);
  };

  // If no account, show wallet connection prompt
  if (!account) {
    console.log('[UploadPage] 📱 No wallet connected - showing connection prompt');
    return (
      <main className="relative min-h-screen">
        <SonarBackground opacity={0.2} intensity={0.5} />
        <div className="relative z-10 container mx-auto px-6 py-12">
          <div className="max-w-2xl mx-auto">
            <GlassCard className="p-12 text-center space-y-6">
              <div className="flex justify-center">
                <div className="p-6 rounded-full bg-sonar-signal/10">
                  <Wallet className="w-12 h-12 text-sonar-signal" />
                </div>
              </div>

              <div className="space-y-3">
                <h1 className="text-3xl font-mono font-bold text-sonar-highlight-bright">
                  Connect Your Wallet
                </h1>
                <p className="text-sonar-highlight/70">
                  You need to connect your Sui wallet to upload datasets to SONAR Protocol
                </p>
              </div>

              <div className="flex justify-center pt-4">
                <ConnectButton />
              </div>

              <p className="text-xs text-sonar-highlight/50 pt-4">
                Don't have a wallet? Install one of the supported Sui wallets to get started
              </p>
            </GlassCard>
          </div>
        </div>
      </main>
    );
  }

  console.log('[UploadPage] ✨ Rendering UploadWizard fullscreen');
  return (
    <UploadWizard
      open={isOpen}
      onOpenChange={handleClose}
      fullscreen={true}
    />
  );
}
