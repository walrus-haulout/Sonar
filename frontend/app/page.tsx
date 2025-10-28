import Link from 'next/link';
import { GlassCard } from '@/components/ui/GlassCard';
import { SonarButton } from '@/components/ui/SonarButton';
import { SignalBadge } from '@/components/ui/SignalBadge';
import { SonarBackground } from '@/components/animations/SonarBackground';
import { ProtocolStatsSection } from '@/components/sections/ProtocolStatsSection';

export default function HomePage() {
  return (
    <main className="relative min-h-screen">
      {/* Animated Sonar Background */}
      <SonarBackground opacity={0.3} intensity={0.6} />

      {/* Hero Section */}
      <div className="relative z-10 container mx-auto px-6 py-20">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Logo/Title */}
          <div className="space-y-4">
            <h1 className="text-7xl font-mono tracking-radar text-sonar-highlight">
              SONAR
            </h1>
            <p className="text-2xl text-sonar-highlight-bright font-mono tracking-wide">
              Sound Oracle Network for Audio Rewards
            </p>
          </div>

          {/* Tagline */}
          <p className="text-xl text-sonar-highlight-bright/80 max-w-2xl mx-auto">
            Decentralized marketplace for high-quality conversational audio data
            with privacy-first design and adaptive token economics
          </p>

          {/* CTA Buttons */}
          <div className="flex gap-4 justify-center pt-8">
            <Link href="/marketplace">
              <SonarButton variant="primary">Explore Marketplace</SonarButton>
            </Link>
            <Link href="/stats">
              <SonarButton variant="secondary">View Economics</SonarButton>
            </Link>
          </div>

          {/* Status Badges */}
          <div className="flex gap-3 justify-center pt-4">
            <SignalBadge variant="info">Testnet</SignalBadge>
            <SignalBadge variant="success">Live</SignalBadge>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 max-w-6xl mx-auto">
          <GlassCard className="text-center space-y-4">
            <div className="text-3xl">🎯</div>
            <h3 className="text-xl font-mono text-sonar-highlight">
              Quality First
            </h3>
            <p className="text-sm text-sonar-highlight-bright/70">
              LLM-validated conversational quality scoring. Tiered rewards based
              on contribution quality (0.001% - 0.005% of supply)
            </p>
          </GlassCard>

          <GlassCard className="text-center space-y-4">
            <div className="text-3xl">🔒</div>
            <h3 className="text-xl font-mono text-sonar-highlight">
              Privacy by Design
            </h3>
            <p className="text-sm text-sonar-highlight-bright/70">
              Client-side encryption with Mysten Seal. Decentralized storage on
              Walrus. Only authorized purchasers receive decryption shares
            </p>
          </GlassCard>

          <GlassCard className="text-center space-y-4">
            <div className="text-3xl">⚡</div>
            <h3 className="text-xl font-mono text-sonar-highlight">
              Adaptive Economics
            </h3>
            <p className="text-sm text-sonar-highlight-bright/70">
              Absolute-threshold dynamic burn model. Burn rate adjusts from 60%
              to 20% as supply becomes scarce. Sustainable long-term tokenomics
            </p>
          </GlassCard>
        </div>

        {/* Stats Preview with Real-Time Data */}
        <ProtocolStatsSection />

        {/* Footer */}
        <div className="mt-20 text-center text-sonar-highlight-bright/50 text-sm space-y-2">
          <p>Built for Walrus Haulout 2025 Hackathon</p>
          <p className="font-mono">
            Powered by Sui • Walrus • Mysten Seal
          </p>
        </div>
      </div>
    </main>
  );
}
