'use client';

import Link from 'next/link';
import { DocContent, DocHeading, DocSection, DocParagraph, DocList, DocListItem, DocCard } from '@/components/docs/DocContent';
import { SonarButton } from '@/components/ui/SonarButton';

export default function RaritySystemPage() {
  return (
    <DocContent>
      <DocSection>
        <DocHeading level={1}>Understanding the Rarity System</DocHeading>
        <DocParagraph>
          The Rarity System is how SONAR determines the value of your audio. High-rarity, high-quality audio earns more tokens and higher leaderboard rankings.
        </DocParagraph>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Overview</DocHeading>
        <DocParagraph>
          Your audio is scored on multiple dimensions:
        </DocParagraph>
        
        <DocList>
          <DocListItem><strong>Rarity Score (0-100):</strong> How unique is this audio compared to what already exists?</DocListItem>
          <DocListItem><strong>Quality Score (0-100):</strong> Technical audio quality and production value</DocListItem>
          <DocListItem><strong>Specificity Grade (A-F):</strong> How detailed and specific is the content?</DocListItem>
          <DocListItem><strong>Verification Status:</strong> Are the claims about the audio verified?</DocListItem>
          <DocListItem><strong>Subject Rarity Tier:</strong> How rare is the main subject (bird species, equipment, accent, etc.)?</DocListItem>
          <DocListItem><strong>Saturation Status:</strong> How many similar submissions already exist?</DocListItem>
          <DocListItem><strong>Bulk Status:</strong> Did you submit 100+ samples at once?</DocListItem>
        </DocList>

        <p className="text-sonar-highlight-bright/80 mt-4">
          These factors combine using the Points System to determine how many SONAR tokens you earn.
        </p>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>The Core Concept</DocHeading>
        <DocParagraph>
          SONAR rewards rarity and quality. Think of it this way:
        </DocParagraph>

        <div className="space-y-3 mt-4">
          <DocCard>
            <p><strong className="text-sonar-signal">Common Audio</strong> (dog barking, traffic noise, generic speech):<br/>
            <span className="text-sm text-sonar-highlight-bright/80">Low value, low tokens</span></p>
          </DocCard>
          <DocCard variant="info">
            <p><strong className="text-sonar-signal">Decent Audio</strong> (specific bird species, clear accent, vintage equipment):<br/>
            <span className="text-sm text-sonar-highlight-bright/80">Medium value, medium tokens</span></p>
          </DocCard>
          <DocCard variant="success">
            <p><strong className="text-sonar-signal">Rare Audio</strong> (endangered bird, unique accent, rare equipment):<br/>
            <span className="text-sm text-sonar-highlight-bright/80">High value, high tokens</span></p>
          </DocCard>
        </div>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Five Subject Rarity Tiers</DocHeading>
        <DocParagraph>
          Every subject submitted to SONAR falls into one of five rarity tiers. SONAR automatically researches each subject to assign the correct tier.
        </DocParagraph>

        <div className="space-y-4 mt-6">
          <div className="border-l-4 border-red-500 pl-4 py-2">
            <h4 className="font-mono text-red-400 font-bold">Critical Tier (5.0x multiplier)</h4>
            <p className="text-sm text-sonar-highlight-bright/80 mt-2">
              Extremely rare or unique. Examples: Javan Hawk-Eagle calls, Native American ceremonial chants, extinct animal sounds, languages with fewer than 100 speakers.
            </p>
          </div>

          <div className="border-l-4 border-orange-500 pl-4 py-2">
            <h4 className="font-mono text-orange-400 font-bold">High Rarity Tier (3.0x multiplier)</h4>
            <p className="text-sm text-sonar-highlight-bright/80 mt-2">
              Uncommon. Examples: Babirusa pig vocalizations, 1960s rotary telephone sounds, Welsh language speakers over age 80, rare regional accents.
            </p>
          </div>

          <div className="border-l-4 border-yellow-500 pl-4 py-2">
            <h4 className="font-mono text-yellow-400 font-bold">Medium Tier (2.0x multiplier)</h4>
            <p className="text-sm text-sonar-highlight-bright/80 mt-2">
              Some recordings exist but offer variants. Examples: Cardinal songs with regional variations, smartphone notifications, regional accents, vintage equipment.
            </p>
          </div>

          <div className="border-l-4 border-green-500 pl-4 py-2">
            <h4 className="font-mono text-green-400 font-bold">Standard Tier (1.0x multiplier)</h4>
            <p className="text-sm text-sonar-highlight-bright/80 mt-2">
              Common, widely available. Examples: Common dog breeds, English language generic speech, typical office environments, generic weather sounds.
            </p>
          </div>

          <div className="border-l-4 border-blue-500 pl-4 py-2">
            <h4 className="font-mono text-blue-400 font-bold">Oversaturated Tier (0.5x multiplier)</h4>
            <p className="text-sm text-sonar-highlight-bright/80 mt-2">
              Extremely common, penalty applied. Examples: Generic dog barking, common bird calls, generic traffic noise, generic ambient noise.
            </p>
          </div>
        </div>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Learn More</DocHeading>
        
        <DocList>
          <DocListItem>
            <strong><Link href="/docs/rarity-system/rarity-scoring" className="text-sonar-signal hover:text-sonar-highlight transition-colors">Rarity Scoring</Link></strong> - How rarity is determined for each subject
          </DocListItem>
          <DocListItem>
            <strong><Link href="/docs/rarity-system/points-system" className="text-sonar-signal hover:text-sonar-highlight transition-colors">Points System</Link></strong> - The 6-multiplier formula with examples
          </DocListItem>
          <DocListItem>
            <strong><Link href="/docs/rarity-system/tiers" className="text-sonar-signal hover:text-sonar-highlight transition-colors">Tiers</Link></strong> - 7 tier progression from Contributor to Legend
          </DocListItem>
          <DocListItem>
            <strong><Link href="/docs/rarity-system/leaderboard" className="text-sonar-signal hover:text-sonar-highlight transition-colors">Leaderboard</Link></strong> - How rankings work
          </DocListItem>
        </DocList>
      </DocSection>

      <DocSection className="mt-12 pt-8 border-t border-sonar-signal/20">
        <div className="text-center">
          <p className="text-sonar-highlight-bright/80 mb-6">
            Ready to learn how to maximize your earnings?
          </p>
          <Link href="/docs/rarity-system/points-system">
            <SonarButton variant="primary">
              Learn Points System
            </SonarButton>
          </Link>
        </div>
      </DocSection>
    </DocContent>
  );
}
