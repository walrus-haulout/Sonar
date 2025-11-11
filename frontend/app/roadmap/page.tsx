'use client';

import Link from 'next/link';
import { CheckCircle, Rocket, Target, Zap, Shield, Waves, Brain, Users, Coins, Vote, ChartBar, Globe } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { SonarButton } from '@/components/ui/SonarButton';
import { SignalBadge } from '@/components/ui/SignalBadge';
import { SonarBackground } from '@/components/animations/SonarBackground';

/**
 * Roadmap Page
 * Displays SONAR's development roadmap in three phases
 */
export default function RoadmapPage() {
  return (
    <main className="relative min-h-screen">
      {/* Background Animation */}
      <SonarBackground opacity={0.2} intensity={0.5} />

      <div className="relative z-10 container mx-auto px-6 py-12">
        {/* Page Header */}
        <div className="max-w-6xl mx-auto mb-12">
          <h1 className="text-5xl font-mono tracking-radar text-sonar-highlight mb-4">
            SONAR Roadmap
          </h1>
          <p className="text-xl text-sonar-highlight-bright/80 max-w-3xl">
            Building the future of decentralized audio datasets, from hackathon MVP to global creator network
          </p>
        </div>

        {/* Roadmap Phases */}
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Phase 1: NOW - Hackathon MVP */}
          <section>
            <GlassCard glow className="relative overflow-hidden">
              {/* Phase Badge */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <SignalBadge variant="success">Phase 1</SignalBadge>
                  <h2 className="text-3xl font-mono text-sonar-highlight">NOW</h2>
                  <span className="text-sonar-highlight-bright/60">Hackathon MVP</span>
                </div>
                <SignalBadge variant="success">Completed</SignalBadge>
              </div>

              {/* Description */}
              <p className="text-sonar-highlight-bright/80 mb-6">
                Core infrastructure for decentralized audio storage, encryption, and marketplace
              </p>

              {/* Features Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FeatureItem icon={<Waves />} completed>
                  Walrus storage integration for decentralized file hosting
                </FeatureItem>
                <FeatureItem icon={<Shield />} completed>
                  SEAL encryption for dataset privacy and access control
                </FeatureItem>
                <FeatureItem icon={<Brain />} completed>
                  Audio verification with pre-encryption quality checks
                </FeatureItem>
                <FeatureItem icon={<Coins />} completed>
                  Charge 1 SUI per audio upload to deter spam
                </FeatureItem>
                <FeatureItem icon={<CheckCircle />} completed>
                  Blockchain verification & on-chain marketplace
                </FeatureItem>
                <FeatureItem icon={<Zap />} completed>
                  Purchase system with automated decryption key delivery
                </FeatureItem>
              </div>
            </GlassCard>
          </section>

          {/* Phase 2: NEXT - Post-Hackathon Growth */}
          <section>
            <GlassCard glow className="relative overflow-hidden">
              {/* Phase Badge */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <SignalBadge variant="warning">Phase 2</SignalBadge>
                  <h2 className="text-3xl font-mono text-sonar-highlight">NEXT</h2>
                  <span className="text-sonar-highlight-bright/60">6-12 Months</span>
                </div>
                <SignalBadge variant="warning">Planned</SignalBadge>
              </div>

              {/* Description */}
              <p className="text-sonar-highlight-bright/80 mb-6">
                Enhanced verification, multi-modal datasets, and community curation features
              </p>

              {/* Features Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FeatureItem icon={<Rocket />}>
                  Integrate Nautilus compute layer for scalable on-chain processing
                </FeatureItem>
                <FeatureItem icon={<Brain />}>
                  Advanced AI verification (deepfake detection, copyright checks)
                </FeatureItem>
                <FeatureItem icon={<Waves />}>
                  Multi-modal datasets (images, video, text, sensor data)
                </FeatureItem>
                <FeatureItem icon={<ChartBar />}>
                  Creator dashboard with analytics and earnings tracking
                </FeatureItem>
                <FeatureItem icon={<Vote />}>
                  Community voting & curation mechanisms
                </FeatureItem>
                <FeatureItem icon={<Shield />}>
                  Enhanced storage lease management with renewal options
                </FeatureItem>
              </div>
            </GlassCard>
          </section>

          {/* Phase 3: FUTURE - Scale & Decentralize */}
          <section>
            <GlassCard glow className="relative overflow-hidden">
              {/* Phase Badge */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <SignalBadge variant="info">Phase 3</SignalBadge>
                  <h2 className="text-3xl font-mono text-sonar-highlight">FUTURE</h2>
                  <span className="text-sonar-highlight-bright/60">12+ Months</span>
                </div>
                <SignalBadge variant="info">Vision</SignalBadge>
              </div>

              {/* Description */}
              <p className="text-sonar-highlight-bright/80 mb-6">
                Full decentralization with token economics, governance, and global expansion
              </p>

              {/* Features Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FeatureItem icon={<Coins />}>
                  SNR token launch (exploring launch options)
                </FeatureItem>
                <FeatureItem icon={<Target />}>
                  Token economics & staking rewards for creators
                </FeatureItem>
                <FeatureItem icon={<Vote />}>
                  DAO governance for protocol parameters and upgrades
                </FeatureItem>
                <FeatureItem icon={<Globe />}>
                  Cross-chain expansion (Ethereum, Polygon, Solana)
                </FeatureItem>
                <FeatureItem icon={<Users />}>
                  Enterprise partnerships & institutional adoption
                </FeatureItem>
                <FeatureItem icon={<Waves />}>
                  Global creator network with 10K+ verified datasets
                </FeatureItem>
              </div>
            </GlassCard>
          </section>

          {/* Call to Action */}
          <section className="text-center py-8">
            <GlassCard className="max-w-2xl mx-auto">
              <h3 className="text-2xl font-mono text-sonar-highlight mb-4">
                Join the Mission
              </h3>
              <p className="text-sonar-highlight-bright/80 mb-6">
                Help build the future of decentralized audio datasets. Upload your first dataset or explore the marketplace.
              </p>
              <div className="flex gap-4 justify-center">
                <Link href="/marketplace">
                  <SonarButton variant="primary">
                    Explore Marketplace
                  </SonarButton>
                </Link>
              </div>
            </GlassCard>
          </section>
        </div>
      </div>
    </main>
  );
}

/**
 * FeatureItem Component
 * Individual feature with icon and checkmark/status
 */
interface FeatureItemProps {
  icon: React.ReactNode;
  children: React.ReactNode;
  completed?: boolean;
}

function FeatureItem({ icon, children, completed }: FeatureItemProps) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-sonar-deep/30 border border-sonar-signal/20 hover:border-sonar-signal/40 transition-colors">
      {/* Icon */}
      <div className="flex-shrink-0 mt-0.5 text-sonar-signal">
        {completed ? (
          <CheckCircle className="w-5 h-5" />
        ) : (
          <div className="w-5 h-5">{icon}</div>
        )}
      </div>

      {/* Text */}
      <p className="text-sm text-sonar-highlight-bright/90 leading-relaxed">
        {children}
      </p>
    </div>
  );
}
