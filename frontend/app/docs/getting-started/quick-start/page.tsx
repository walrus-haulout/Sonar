'use client';

import Link from 'next/link';
import { DocContent, DocHeading, DocSection, DocParagraph, DocList, DocListItem, DocCard } from '@/components/docs/DocContent';
import { SonarButton } from '@/components/ui/SonarButton';

export default function QuickStartPage() {
  return (
    <DocContent>
      <DocSection>
        <DocHeading level={1}>Quick Start (5 Minutes)</DocHeading>
        <DocParagraph>
          Follow this guide to upload your first audio dataset in five minutes.
        </DocParagraph>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Before You Start</DocHeading>
        <DocParagraph>
          You will need:
        </DocParagraph>
        <DocList>
          <DocListItem>A wallet address (Sui network)</DocListItem>
          <DocListItem>One or more audio files in MP3, WAV, or M4A format</DocListItem>
          <DocListItem>Basic information about your audio (title, description)</DocListItem>
        </DocList>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Step 1: Connect Your Wallet (1 minute)</DocHeading>
        <DocList ordered>
          <DocListItem>Visit SONAR platform</DocListItem>
          <DocListItem>Click "Connect Wallet"</DocListItem>
          <DocListItem>Select your preferred wallet (Sui Web3 compatible)</DocListItem>
          <DocListItem>Sign the authentication message</DocListItem>
          <DocListItem>You are now authenticated and ready to upload</DocListItem>
        </DocList>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Step 2: Select Your Audio Files (1 minute)</DocHeading>
        <DocList ordered>
          <DocListItem>Click "Upload Dataset" button</DocListItem>
          <DocListItem>Select one or more audio files from your computer</DocListItem>
          <DocListItem>Review file details: duration, format, size</DocListItem>
          <DocListItem>Click "Next"</DocListItem>
        </DocList>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Step 3: Add Metadata (2 minutes)</DocHeading>
        <DocParagraph>
          Provide information about your audio:
        </DocParagraph>

        <div className="space-y-4 mt-4">
          <DocCard>
            <p className="font-mono text-sonar-signal mb-2">Title</p>
            <p className="text-sm text-sonar-highlight-bright/80">
              A clear, descriptive name. Example: "Northern Cardinal Calls, Eastern USA"
            </p>
          </DocCard>

          <DocCard>
            <p className="font-mono text-sonar-signal mb-2">Description</p>
            <p className="text-sm text-sonar-highlight-bright/80">
              What is this audio? What makes it special? Be specific. Example: "High-quality recordings of Northern Cardinal territorial and alarm calls recorded in natural woodland habitat in the Eastern United States. Multiple individuals and call types included."
            </p>
          </DocCard>

          <DocCard>
            <p className="font-mono text-sonar-signal mb-2">Languages</p>
            <p className="text-sm text-sonar-highlight-bright/80">
              Which languages are spoken or implied? Select from English, Spanish, Chinese, French, or others if applicable.
            </p>
          </DocCard>

          <DocCard>
            <p className="font-mono text-sonar-signal mb-2">Tags</p>
            <p className="text-sm text-sonar-highlight-bright/80">
              Choose relevant tags to help others find your audio (e.g., Species names, Audio type, Location, Quality indicators)
            </p>
          </DocCard>
        </div>

        <p className="text-sonar-highlight-bright/80 mt-4">
          Click "Next"
        </p>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Step 4: Review and Encrypt (1 minute)</DocHeading>
        <DocParagraph>
          Review your metadata. Everything looks good?
        </DocParagraph>
        <DocList ordered>
          <DocListItem>Click "Encrypt and Upload"</DocListItem>
          <DocListItem>Your browser will encrypt your audio locally (this takes a moment)</DocListItem>
          <DocListItem>You will see encryption progress</DocListItem>
          <DocListItem>Once complete, your encrypted audio uploads to decentralized storage</DocListItem>
          <DocListItem>Click "Next"</DocListItem>
        </DocList>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Step 5: Verify (2-3 minutes, automatic)</DocHeading>
        <DocParagraph>
          SONAR now analyzes your audio automatically. This includes:
        </DocParagraph>
        <DocList>
          <DocListItem>Quality analysis (duration, sample rate, volume)</DocListItem>
          <DocListItem>Copyright detection (checking against known works)</DocListItem>
          <DocListItem>Transcription (converting speech to text if applicable)</DocListItem>
          <DocListItem>AI analysis (content safety, insights)</DocListItem>
        </DocList>
        <p className="text-sonar-highlight-bright/80 mt-4">
          You will see progress as each stage completes. This typically takes 2-3 minutes per file.
        </p>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Step 6: Publish (1 minute)</DocHeading>
        <DocParagraph>
          Once verification passes:
        </DocParagraph>
        <DocList ordered>
          <DocListItem>Review your verification results</DocListItem>
          <DocListItem>See your estimated rarity score (0-100)</DocListItem>
          <DocListItem>Click "Publish to Blockchain"</DocListItem>
          <DocListItem>Sign the transaction in your wallet</DocListItem>
          <DocListItem>Wait for blockchain confirmation (a few seconds)</DocListItem>
          <DocListItem>Done! Your dataset is now on SONAR</DocListItem>
        </DocList>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>What Happens Next?</DocHeading>
        
        <div className="space-y-3 mt-6">
          <DocCard variant="info">
            <p className="font-mono text-sonar-signal text-sm mb-1">Within 30 seconds</p>
            <p className="text-sm text-sonar-highlight-bright/80">Your dataset appears in the marketplace</p>
          </DocCard>

          <DocCard>
            <p className="font-mono text-sonar-signal text-sm mb-1">Within 1 minute</p>
            <p className="text-sm text-sonar-highlight-bright/80">Leaderboard updates with your points</p>
          </DocCard>

          <DocCard variant="success">
            <p className="font-mono text-sonar-signal text-sm mb-1">Over 1 week</p>
            <p className="text-sm text-sonar-highlight-bright/80">Similar submissions are identified and saturation penalties calculated</p>
          </DocCard>

          <DocCard variant="warning">
            <p className="font-mono text-sonar-signal text-sm mb-1">Over 1 month</p>
            <p className="text-sm text-sonar-highlight-bright/80">Buyers can discover and purchase your dataset</p>
          </DocCard>
        </div>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Earn Your First Points</DocHeading>
        <DocParagraph>
          Points are calculated automatically based on:
        </DocParagraph>
        <DocList>
          <DocListItem><strong>Rarity Score (0-100):</strong> How unique and valuable is your audio?</DocListItem>
          <DocListItem><strong>Quality:</strong> Technical audio quality (sample rate, volume, clarity)</DocListItem>
          <DocListItem><strong>Specificity:</strong> How detailed and specific is the content?</DocListItem>
          <DocListItem><strong>Bulk Bonus:</strong> If you submitted 100+ samples in one upload</DocListItem>
          <DocListItem><strong>Early Contributor:</strong> Bonus if you are among first creators</DocListItem>
          <DocListItem><strong>Verification:</strong> Bonus if AI verified all claims</DocListItem>
        </DocList>
        <p className="text-sonar-highlight-bright/80 mt-4">
          A typical first submission earns 100-500 SONAR tokens. Rare, high-quality audio can earn 10x more.
        </p>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Tips for Higher Scores</DocHeading>
        <DocList>
          <DocListItem><strong>Be Specific:</strong> Instead of "dog barking," say "Golden Retriever barking during play, outdoor environment"</DocListItem>
          <DocListItem><strong>Focus on Rarity:</strong> Rare sounds get 3-5x multipliers. Endangered species, vintage equipment, uncommon accents</DocListItem>
          <DocListItem><strong>High Quality:</strong> Use good recording equipment. High sample rate (48kHz or better) adds points</DocListItem>
          <DocListItem><strong>Bulk Contributions:</strong> Submitting 100+ samples of one subject gives a 2x multiplier the first time</DocListItem>
          <DocListItem><strong>First to Market:</strong> Be the first to submit a subject for bonuses</DocListItem>
          <DocListItem><strong>Complete Metadata:</strong> Full, accurate descriptions help AI verify and score your audio</DocListItem>
        </DocList>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Troubleshooting</DocHeading>
        
        <div className="space-y-4 mt-6">
          <div className="border-l-2 border-sonar-signal/40 pl-4">
            <h4 className="font-mono text-sonar-highlight mb-2">Upload Failed?</h4>
            <DocList>
              <DocListItem>Check file format (MP3, WAV, M4A)</DocListItem>
              <DocListItem>Ensure file size under limit</DocListItem>
              <DocListItem>Try a different browser</DocListItem>
            </DocList>
          </div>

          <div className="border-l-2 border-sonar-signal/40 pl-4">
            <h4 className="font-mono text-sonar-highlight mb-2">Verification Failed?</h4>
            <DocList>
              <DocListItem>Audio too short (minimum 1 second)</DocListItem>
              <DocListItem>Audio too quiet (adjust volume levels)</DocListItem>
              <DocListItem>Copyrighted content detected</DocListItem>
              <DocListItem>Safety violations (hate speech, violence)</DocListItem>
            </DocList>
          </div>

          <div className="border-l-2 border-sonar-signal/40 pl-4">
            <h4 className="font-mono text-sonar-highlight mb-2">Can't See Leaderboard Update?</h4>
            <DocList>
              <DocListItem>Blockchain confirmation takes 10-20 seconds</DocListItem>
              <DocListItem>Check your wallet address matches</DocListItem>
              <DocListItem>Refresh the page</DocListItem>
            </DocList>
          </div>
        </div>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Next Steps</DocHeading>
        <DocList>
          <DocListItem>
            <strong><Link href="/docs/rarity-system" className="text-sonar-signal hover:text-sonar-highlight transition-colors">Learn about the Rarity System</Link></strong> - How scores are calculated
          </DocListItem>
          <DocListItem>
            <strong><Link href="/docs/uploading-audio" className="text-sonar-signal hover:text-sonar-highlight transition-colors">Upload More Datasets</Link></strong> - Detailed guide for advanced options
          </DocListItem>
          <DocListItem>
            <strong><Link href="/docs/rarity-system/leaderboard" className="text-sonar-signal hover:text-sonar-highlight transition-colors">Check the Leaderboard</Link></strong> - See where you rank globally
          </DocListItem>
          <DocListItem>
            <strong><Link href="/docs/rarity-system" className="text-sonar-signal hover:text-sonar-highlight transition-colors">Strategy Guide</Link></strong> - Tips for maximizing earnings
          </DocListItem>
        </DocList>
      </DocSection>

      <DocSection className="mt-12 pt-8 border-t border-sonar-signal/20">
        <div className="text-center">
          <p className="text-sonar-highlight-bright/80 mb-6">
            Congratulations on your first submission. Welcome to SONAR!
          </p>
          <Link href="/upload">
            <SonarButton variant="primary">
              Start Uploading
            </SonarButton>
          </Link>
        </div>
      </DocSection>
    </DocContent>
  );
}
