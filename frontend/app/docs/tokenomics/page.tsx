'use client';

import Link from 'next/link';
import { DocContent, DocHeading, DocSection, DocParagraph, DocList, DocListItem, DocCard } from '@/components/docs/DocContent';

export default function TokenomicsPage() {
  return (
    <DocContent>
      <DocSection>
        <DocHeading level={1}>Token Economics</DocHeading>
        <DocParagraph>
          SONAR token economics are designed to be sustainable and prevent the death spiral that kills most crypto projects.
        </DocParagraph>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>The Problem SONAR Solves</DocHeading>
        <DocParagraph>
          Most crypto projects use fixed token burn rates. As the project grows, token supply shrinks, prices must climb constantly, and when price drops, the burn rate becomes untenable. The project dies or shifts models.
        </DocParagraph>
        <DocParagraph className="mt-4">
          SONAR uses adaptive tokenomics that respond to market conditions, preventing this death spiral.
        </DocParagraph>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Adaptive Burns</DocHeading>
        <DocParagraph>
          SONAR adjusts burn rates automatically based on circulating supply:
        </DocParagraph>

        <div className="space-y-3 mt-6">
          <DocCard variant="info">
            <div className="font-mono text-sonar-signal mb-2">Over 50 Million SONAR</div>
            <ul className="text-sm text-sonar-highlight-bright/80 space-y-1">
              <li>20% burned on each purchase</li>
              <li>50% to creator</li>
              <li>30% to operations</li>
            </ul>
          </DocCard>

          <DocCard>
            <div className="font-mono text-sonar-signal mb-2">35-50 Million SONAR</div>
            <ul className="text-sm text-sonar-highlight-bright/80 space-y-1">
              <li>15% burned</li>
              <li>60% to creator</li>
              <li>25% to operations</li>
            </ul>
          </DocCard>

          <DocCard variant="success">
            <div className="font-mono text-sonar-signal mb-2">20-35 Million SONAR</div>
            <ul className="text-sm text-sonar-highlight-bright/80 space-y-1">
              <li>10% burned</li>
              <li>65% to creator</li>
              <li>25% to operations</li>
            </ul>
          </DocCard>

          <DocCard variant="warning">
            <div className="font-mono text-sonar-signal mb-2">Under 20 Million SONAR</div>
            <ul className="text-sm text-sonar-highlight-bright/80 space-y-1">
              <li>0% burned (no burn)</li>
              <li>80% to creator</li>
              <li>20% to operations</li>
            </ul>
          </DocCard>
        </div>

        <p className="text-sonar-highlight-bright/80 mt-4">
          As supply shrinks, burn slows and creator rewards increase. This prevents the death spiral.
        </p>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Long-Term Sustainability</DocHeading>
        <DocParagraph>
          SONAR targets an equilibrium at 50M SONAR:
        </DocParagraph>

        <DocList>
          <DocListItem>Not deflationary (would require massive burn)</DocListItem>
          <DocListItem>Not inflationary (would dilute holders)</DocListItem>
          <DocListItem>Provides yield (burn reduces supply)</DocListItem>
          <DocListItem>Sustainable forever</DocListItem>
        </DocList>

        <p className="text-sonar-highlight-bright/80 mt-4">
          At 50M SONAR: 20% purchase burn = equilibrium. Creator share 50% = fair. Operations 30% = sufficient.
        </p>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Learn More</DocHeading>
        
        <DocList>
          <DocListItem>
            <strong><Link href="/docs/tokenomics/adaptive-burns" className="text-sonar-signal hover:text-sonar-highlight transition-colors">Adaptive Burn Mechanics</Link></strong> - How burns adjust
          </DocListItem>
        </DocList>
      </DocSection>
    </DocContent>
  );
}
