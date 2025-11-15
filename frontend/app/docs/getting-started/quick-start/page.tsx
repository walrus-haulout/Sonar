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
          <DocListItem>One or more audio files in MP3, WAV, M4A, FLAC, or OGG format</DocListItem>
          <DocListItem><strong>Required:</strong> Basic information about your dataset (title, description, languages, tags)</DocListItem>
          <DocListItem><strong>Required:</strong> Content categorization (use case, content type, domain)</DocListItem>
          <DocListItem><strong>Required:</strong> Individual title and description for each audio file</DocListItem>
          <DocListItem><strong>Optional but recommended:</strong> Technical audio specs (sample rate, channels, codec, bit depth)</DocListItem>
          <DocListItem><strong>Optional but recommended:</strong> Speaker demographics (count, age, gender, accent)</DocListItem>
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
        <DocHeading level={2}>Step 3: Add Comprehensive Metadata (2 minutes)</DocHeading>
        <DocParagraph>
          Provide detailed information about your audio across multiple sections. The form uses collapsible sections for easy navigation:
        </DocParagraph>

        <div className="space-y-4 mt-4">
          <DocCard variant="info">
            <p className="font-mono text-sonar-signal mb-2">Basic Information</p>
            <p className="text-sm text-sonar-highlight-bright/80 mb-2">
              <strong>Title:</strong> A clear, descriptive name. Example: "Northern Cardinal Calls, Eastern USA"
            </p>
            <p className="text-sm text-sonar-highlight-bright/80 mb-2">
              <strong>Description:</strong> What is this audio? What makes it special? Example: "High-quality recordings of Northern Cardinal territorial and alarm calls recorded in natural woodland habitat."
            </p>
            <p className="text-sm text-sonar-highlight-bright/80 mb-2">
              <strong>Languages:</strong> Which languages are spoken or implied? Select from available options.
            </p>
            <p className="text-sm text-sonar-highlight-bright/80">
              <strong>Tags:</strong> Choose relevant tags to help others find your audio (e.g., Species, Audio type, Location, Quality)
            </p>
          </DocCard>

          <DocCard>
            <p className="font-mono text-sonar-signal mb-2">Per-File Labels</p>
            <p className="text-sm text-sonar-highlight-bright/80">
              Provide individual title and description for each uploaded file. This helps categorize datasets with multiple audio clips.
            </p>
          </DocCard>

          <DocCard variant="success">
            <p className="font-mono text-sonar-signal mb-2">Audio Quality (Optional - +10% Bonus)</p>
            <p className="text-sm text-sonar-highlight-bright/80 mb-2">
              Specify technical details about your audio if you know them:
            </p>
            <ul className="text-sm text-sonar-highlight-bright/80 list-disc list-inside space-y-1">
              <li><strong>Sample Rate:</strong> Hz (e.g., 44100, 48000, 96000)</li>
              <li><strong>Channels:</strong> Mono (1), Stereo (2), or Multichannel</li>
              <li><strong>Codec:</strong> MP3, AAC, FLAC, WAV, etc.</li>
              <li><strong>Bit Depth:</strong> 16, 24, or 32 bit</li>
              <li><strong>Recording Quality:</strong> Professional, High, Medium, Low, or "I Don't Know"</li>
            </ul>
            <p className="text-xs text-sonar-signal mt-2">Accurate specs earn you a 10% points bonus!</p>
          </DocCard>

          <DocCard variant="warning">
            <p className="font-mono text-sonar-signal mb-2">Speaker Information (Optional - +15% Bonus)</p>
            <p className="text-sm text-sonar-highlight-bright/80 mb-2">
              Describe the speakers/participants if you want to:
            </p>
            <ul className="text-sm text-sonar-highlight-bright/80 list-disc list-inside space-y-1">
              <li><strong>Speaker Count:</strong> Number of speakers (1-20) - optional</li>
              <li><strong>Per Speaker:</strong> Role, Age range, Gender, Accent - all optional</li>
              <li><strong>Unknown Values:</strong> Select "Unknown" if you don't want to specify</li>
            </ul>
            <p className="text-xs text-sonar-signal mt-2">Complete speaker data earns you a 15% points bonus!</p>
          </DocCard>

          <DocCard>
            <p className="font-mono text-sonar-signal mb-2">Content Categorization (Required)</p>
            <p className="text-sm text-sonar-highlight-bright/80 mb-2">
              Categorize your audio content to help buyers find your data:
            </p>
            <ul className="text-sm text-sonar-highlight-bright/80 list-disc list-inside space-y-1">
              <li><strong>Use Case:</strong> Training Data, Podcast, Music, Interview, Lecture, etc. (required)</li>
              <li><strong>Content Type:</strong> Conversational, Monologue, Music, Ambient/SFX, Mixed (required)</li>
              <li><strong>Domain:</strong> Technology, Healthcare, Education, Business, Science, etc. (required)</li>
            </ul>
          </DocCard>
        </div>

        <div className="p-3 rounded-sonar bg-sonar-blue/5 border border-sonar-blue/20 mt-4 space-y-2">
          <p className="text-sm font-mono text-sonar-blue">✓ Required Fields:</p>
          <p className="text-xs text-sonar-highlight/80">
            Title, Description, Languages, Tags, Per-File Metadata, Content Categorization
          </p>
          <p className="text-sm font-mono text-sonar-signal mt-3">+ Optional but Recommended:</p>
          <p className="text-xs text-sonar-highlight/80">
            Audio Quality Details (+10% bonus) • Speaker Information (+15% bonus)
          </p>
        </div>

        <p className="text-sonar-highlight-bright/80 mt-4">
          Click "Continue" when you've filled in all required fields.
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
          <DocListItem><strong>High Quality:</strong> Use good recording equipment. High sample rate (48kHz or better) and professional quality settings add points</DocListItem>
          <DocListItem><strong>Detailed Audio Metadata:</strong> Accurate sample rates, channel info, and codec details help with scoring</DocListItem>
          <DocListItem><strong>Complete Speaker Labels:</strong> Specifying speaker demographics (age, gender, accent) makes data more valuable</DocListItem>
          <DocListItem><strong>Proper Categorization:</strong> Correct use case and content type help buyers find your data</DocListItem>
          <DocListItem><strong>Per-File Descriptions:</strong> Individual titles and descriptions for each file improve discoverability</DocListItem>
          <DocListItem><strong>Bulk Contributions:</strong> Submitting 100+ samples of one subject gives a 2x multiplier the first time</DocListItem>
          <DocListItem><strong>First to Market:</strong> Be the first to submit a subject for bonuses</DocListItem>
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
