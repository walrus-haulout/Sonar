'use client';

import Link from 'next/link';
import { DocContent, DocHeading, DocSection, DocParagraph, DocList, DocListItem, DocCard } from '@/components/docs/DocContent';
import { SonarButton } from '@/components/ui/SonarButton';

export default function GettingStartedPage() {
  return (
    <DocContent>
      <DocSection>
        <DocHeading level={1}>Getting Started with SONAR</DocHeading>
        <DocParagraph>
          SONAR is a decentralized marketplace for audio datasets. We help you upload, verify, monetize, and purchase high-quality audio data with full privacy and transparency.
        </DocParagraph>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>What Makes SONAR Different?</DocHeading>
        
        <div className="space-y-4 mt-6">
          <DocCard variant="info">
            <h3 className="font-mono text-sonar-signal mb-2">Your Privacy is Guaranteed</h3>
            <p className="text-sm text-sonar-highlight-bright/80">
              Audio is encrypted on your computer before uploading. We never see unencrypted audio except during verification, and only with your explicit authorization.
            </p>
          </DocCard>

          <DocCard>
            <h3 className="font-mono text-sonar-signal mb-2">Intelligence First</h3>
            <p className="text-sm text-sonar-highlight-bright/80">
              We use AI to analyze audio quality, detect copyright issues, transcribe speech, and verify safety. Low-quality or problematic audio is blocked before reaching the marketplace.
            </p>
          </DocCard>

          <DocCard variant="success">
            <h3 className="font-mono text-sonar-signal mb-2">Fair Economics</h3>
            <p className="text-sm text-sonar-highlight-bright/80">
              Unlike centralized platforms that take large cuts, SONAR uses smart contracts for transparent revenue distribution. Creators, buyers, and the ecosystem all benefit fairly.
            </p>
          </DocCard>

          <DocCard variant="warning">
            <h3 className="font-mono text-sonar-signal mb-2">Competitive Leaderboards</h3>
            <p className="text-sm text-sonar-highlight-bright/80">
              Every upload is scored on rarity, specificity, and quality. Climb the leaderboard from Contributor to Legend tier and unlock achievements along the way.
            </p>
          </DocCard>
        </div>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>How It Works (60 Second Summary)</DocHeading>
        
        <DocList ordered>
          <DocListItem><strong>Upload:</strong> You select audio files and provide metadata (title, description, languages, tags)</DocListItem>
          <DocListItem><strong>Encrypt:</strong> Your browser encrypts the audio using client-side encryption. No unencrypted file ever leaves your device</DocListItem>
          <DocListItem><strong>Verify:</strong> SONAR's AI analyzes the audio for quality, copyright, transcription, and safety</DocListItem>
          <DocListItem><strong>Publish:</strong> Your dataset is registered on the Sui blockchain with the encrypted audio reference</DocListItem>
          <DocListItem><strong>Earn:</strong> You receive SONAR tokens based on how rare and high-quality your audio is</DocListItem>
          <DocListItem><strong>Compete:</strong> Your score updates the global leaderboard, and you unlock achievements</DocListItem>
          <DocListItem><strong>Monetize:</strong> Buyers can purchase access to your dataset and listen securely</DocListItem>
        </DocList>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Next Steps</DocHeading>
        
        <DocList>
          <DocListItem>
            <strong><Link href="/docs/getting-started/concepts" className="text-sonar-signal hover:text-sonar-highlight transition-colors">Learn the Key Concepts</Link></strong> - Understand the core ideas that make SONAR work
          </DocListItem>
          <DocListItem>
            <strong><Link href="/docs/getting-started/quick-start" className="text-sonar-signal hover:text-sonar-highlight transition-colors">5-Minute Quickstart</Link></strong> - Follow a step-by-step guide to upload your first dataset
          </DocListItem>
          <DocListItem>
            <strong><Link href="/docs/uploading-audio" className="text-sonar-signal hover:text-sonar-highlight transition-colors">Upload Audio</Link></strong> - Detailed walkthrough of the entire upload process
          </DocListItem>
        </DocList>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Common Questions</DocHeading>
        
        <div className="space-y-4 mt-6">
          <div className="border-l-2 border-sonar-signal/40 pl-4">
            <h4 className="font-mono text-sonar-highlight mb-2">Is my audio really private?</h4>
            <p className="text-sonar-highlight-bright/80 text-sm">
              Yes. Encryption happens on your computer before upload. We never see your plaintext audio except during AI verification, which requires your authorization. Even SONAR servers cannot decrypt your data without your permission.
            </p>
          </div>

          <div className="border-l-2 border-sonar-signal/40 pl-4">
            <h4 className="font-mono text-sonar-highlight mb-2">Why do I need to connect my wallet?</h4>
            <p className="text-sonar-highlight-bright/80 text-sm">
              Your wallet proves you own the audio dataset. It's also how you receive SONAR token rewards and purchase other datasets. You control your earnings completely.
            </p>
          </div>

          <div className="border-l-2 border-sonar-signal/40 pl-4">
            <h4 className="font-mono text-sonar-highlight mb-2">What if my audio is copied?</h4>
            <p className="text-sonar-highlight-bright/80 text-sm">
              During verification, we check against copyrighted works. If high-quality matches are found, the upload is rejected before reaching the marketplace. Additionally, the blockchain records your ownership timestamp, proving you published first.
            </p>
          </div>

        </div>
      </DocSection>

      <DocSection className="mt-12 pt-8 border-t border-sonar-signal/20">
        <div className="text-center">
          <p className="text-sonar-highlight-bright/80 mb-6">
            Ready to upload your first audio dataset?
          </p>
          <Link href="/docs/getting-started/quick-start">
            <SonarButton variant="primary">
              5-Minute Quickstart
            </SonarButton>
          </Link>
        </div>
      </DocSection>
    </DocContent>
  );
}
