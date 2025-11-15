'use client';

import Link from 'next/link';
import { DocContent, DocHeading, DocSection, DocParagraph, DocCard } from '@/components/docs/DocContent';
import { ArrowRight, BookOpen, Zap, Target, Lightbulb } from 'lucide-react';
import { SonarButton } from '@/components/ui/SonarButton';

export default function DocsPage() {
  return (
    <DocContent>
      {/* Header */}
      <DocSection>
        <DocHeading level={1}>SONAR Documentation</DocHeading>
        <DocParagraph>
          Learn how to use SONAR, understand our rarity system, and maximize your earnings on the decentralized audio marketplace.
        </DocParagraph>
      </DocSection>

      {/* Quick Links */}
      <DocSection className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
        <Link href="/docs/getting-started/quick-start" className="group">
          <DocCard variant="info" className="cursor-pointer group-hover:border-sonar-signal/60 transition-colors h-full">
            <div className="flex items-start gap-3">
              <Zap className="w-6 h-6 text-sonar-signal flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-mono text-sonar-highlight mb-2">5-Minute Quickstart</h3>
                <p className="text-sm text-sonar-highlight-bright/70">
                  Upload your first audio dataset in minutes
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-sonar-signal group-hover:translate-x-1 transition-transform ml-auto flex-shrink-0" />
            </div>
          </DocCard>
        </Link>

        <Link href="/docs/rarity-system" className="group">
          <DocCard variant="success" className="cursor-pointer group-hover:border-green-500/60 transition-colors h-full">
            <div className="flex items-start gap-3">
              <Target className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-mono text-sonar-highlight mb-2">Rarity System</h3>
                <p className="text-sm text-sonar-highlight-bright/70">
                  How your audio is scored and valued
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-green-400 group-hover:translate-x-1 transition-transform ml-auto flex-shrink-0" />
            </div>
          </DocCard>
        </Link>

        <Link href="/docs/uploading-audio" className="group">
          <DocCard variant="default" className="cursor-pointer group-hover:border-sonar-signal/60 transition-colors h-full">
            <div className="flex items-start gap-3">
              <BookOpen className="w-6 h-6 text-sonar-highlight flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-mono text-sonar-highlight mb-2">Upload Guide</h3>
                <p className="text-sm text-sonar-highlight-bright/70">
                  Complete step-by-step uploading instructions
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-sonar-signal group-hover:translate-x-1 transition-transform ml-auto flex-shrink-0" />
            </div>
          </DocCard>
        </Link>

        <Link href="/docs/getting-started/concepts" className="group">
          <DocCard variant="warning" className="cursor-pointer group-hover:border-sonar-coral/60 transition-colors h-full">
            <div className="flex items-start gap-3">
              <Lightbulb className="w-6 h-6 text-sonar-coral flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-mono text-sonar-highlight mb-2">Key Concepts</h3>
                <p className="text-sm text-sonar-highlight-bright/70">
                  Encryption, rarity, points, and more
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-sonar-coral group-hover:translate-x-1 transition-transform ml-auto flex-shrink-0" />
            </div>
          </DocCard>
        </Link>
      </DocSection>

      {/* Featured Sections */}
      <DocSection className="mt-12">
        <DocHeading level={2}>Start Here</DocHeading>
        
        <div className="space-y-4">
          <div>
            <h3 className="font-mono text-sonar-signal text-lg mb-2">New to SONAR?</h3>
            <p className="text-sonar-highlight-bright/80 mb-4">
              Start with our <Link href="/docs/getting-started" className="text-sonar-signal hover:text-sonar-highlight transition-colors">Getting Started guide</Link> to understand what SONAR is and how it works.
            </p>
          </div>

          <div>
            <h3 className="font-mono text-sonar-signal text-lg mb-2">Ready to Upload?</h3>
            <p className="text-sonar-highlight-bright/80 mb-4">
              Follow our <Link href="/docs/uploading-audio" className="text-sonar-signal hover:text-sonar-highlight transition-colors">Upload Guide</Link> for a detailed walkthrough of each step.
            </p>
          </div>

          <div>
            <h3 className="font-mono text-sonar-signal text-lg mb-2">Maximize Your Earnings?</h3>
            <p className="text-sonar-highlight-bright/80 mb-4">
              Learn about the <Link href="/docs/rarity-system/points-system" className="text-sonar-signal hover:text-sonar-highlight transition-colors">Points System</Link> and <Link href="/docs/rarity-system" className="text-sonar-signal hover:text-sonar-highlight transition-colors">Rarity Scoring</Link> to earn more tokens.
            </p>
          </div>
        </div>
      </DocSection>

      {/* All Sections */}
      <DocSection className="mt-12">
        <DocHeading level={2}>All Sections</DocHeading>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div className="space-y-3">
            <h4 className="font-mono text-sonar-highlight text-base">Getting Started</h4>
            <ul className="space-y-2 text-sm text-sonar-highlight-bright/70">
              <li>
                <Link href="/docs/getting-started" className="hover:text-sonar-signal transition-colors">
                  Overview
                </Link>
              </li>
              <li>
                <Link href="/docs/getting-started/quick-start" className="hover:text-sonar-signal transition-colors">
                  Quick Start
                </Link>
              </li>
              <li>
                <Link href="/docs/getting-started/concepts" className="hover:text-sonar-signal transition-colors">
                  Key Concepts
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="font-mono text-sonar-highlight text-base">Uploading Audio</h4>
            <ul className="space-y-2 text-sm text-sonar-highlight-bright/70">
              <li>
                <Link href="/docs/uploading-audio" className="hover:text-sonar-signal transition-colors">
                  Overview
                </Link>
              </li>
              <li>
                <Link href="/docs/uploading-audio/file-selection" className="hover:text-sonar-signal transition-colors">
                  File Selection
                </Link>
              </li>
              <li>
                <Link href="/docs/uploading-audio/metadata" className="hover:text-sonar-signal transition-colors">
                  Metadata
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="font-mono text-sonar-highlight text-base">Rarity System</h4>
            <ul className="space-y-2 text-sm text-sonar-highlight-bright/70">
              <li>
                <Link href="/docs/rarity-system" className="hover:text-sonar-signal transition-colors">
                  Overview
                </Link>
              </li>
              <li>
                <Link href="/docs/rarity-system/points-system" className="hover:text-sonar-signal transition-colors">
                  Points System
                </Link>
              </li>
              <li>
                <Link href="/docs/rarity-system/tiers" className="hover:text-sonar-signal transition-colors">
                  Tier Progression
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="font-mono text-sonar-highlight text-base">Technical</h4>
            <ul className="space-y-2 text-sm text-sonar-highlight-bright/70">
              <li>
                <Link href="/docs/technical" className="hover:text-sonar-signal transition-colors">
                  Overview
                </Link>
              </li>
              <li>
                <Link href="/docs/tokenomics" className="hover:text-sonar-signal transition-colors">
                  Tokenomics
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </DocSection>

      {/* CTA */}
      <DocSection className="mt-12 pt-8 border-t border-sonar-signal/20">
        <div className="text-center">
          <p className="text-sonar-highlight-bright/80 mb-6">
            Ready to start? Upload your first audio dataset and join the SONAR community.
          </p>
          <Link href="/upload">
            <SonarButton variant="primary">
              Upload Audio
            </SonarButton>
          </Link>
        </div>
      </DocSection>
    </DocContent>
  );
}
