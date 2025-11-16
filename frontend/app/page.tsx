import { GlassCard } from '@/components/ui/GlassCard';
import { SonarBackground } from '@/components/animations/SonarBackground';
import { SonicWaveformHero } from '@/components/animations/SonicWaveformHero';
import { ProtocolStatsSection } from '@/components/sections/ProtocolStatsSection';

export default function HomePage() {
  return (
    <main className="relative">
      {/* Sonic Waveform Hero with Walrus Logo */}
      <SonicWaveformHero
        title="SONAR"
        subtitle="Decentralized Audio Data Marketplace"
        description="High-quality audio datasets across the full spectrum: speech, music, environmental sounds, vocals, sound effects, and more. Built on Sui blockchain with Walrus storage and Mysten Seal encryption."
        ctaText="Explore Marketplace"
        ctaHref="/marketplace"
        logoSrc="/images/walrus-icon.png"
        logoAlt="SONAR Protocol Walrus"
        logoSize={220}
      />

      {/* Animated Sonar Background */}
      <SonarBackground opacity={0.3} intensity={0.6} />

      {/* Feature Section */}
      <div className="relative z-10 container mx-auto px-6 py-20">
        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20 max-w-6xl mx-auto">
          <GlassCard className="text-center space-y-4">
            <div className="text-3xl">🔍</div>
            <h3 className="text-xl font-mono text-sonar-highlight">
              Browse & Purchase
            </h3>
            <p className="text-sm text-sonar-highlight-bright/70">
              Discover high-quality audio datasets. Purchase with SUI tokens.
              Blockchain-verified ownership and instant access.
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
            <div className="text-3xl">📤</div>
            <h3 className="text-xl font-mono text-sonar-highlight">
              Contribute Data
            </h3>
            <p className="text-sm text-sonar-highlight-bright/70">
              Upload audio datasets of any type: music, speech, environmental sounds, vocals, sound effects, and more. Pay 0.25 SUI to prevent spam. 60% of purchase revenue goes to you.
            </p>
          </GlassCard>
        </div>

        {/* Coming Soon Section */}
        <div className="max-w-2xl mx-auto text-center py-12 px-6 border border-sonar-signal/20 rounded-lg bg-sonar-abyss/20 backdrop-blur-sm mb-12">
          <h3 className="text-2xl font-mono text-sonar-highlight mb-4">SNR Token Economics</h3>
          <p className="text-sonar-highlight-bright/80">
            Earn points now for a future SNR airdrop. Advanced reward tiers, deflationary burn model, and quality-based incentives coming soon.
          </p>
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
