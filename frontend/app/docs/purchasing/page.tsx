'use client';

import { DocContent, DocHeading, DocSection, DocParagraph, DocList, DocListItem, DocCard } from '@/components/docs/DocContent';

export default function PurchasingPage() {
  return (
    <DocContent>
      <DocSection>
        <DocHeading level={1}>Purchasing Datasets</DocHeading>
        <DocParagraph>
          SONAR is not just for creators. Buyers can browse, preview, and purchase high-quality verified audio datasets for AI training, research, sound design, and more.
        </DocParagraph>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>How Purchasing Works</DocHeading>
        
        <DocList ordered>
          <DocListItem><strong>Browse:</strong> Explore datasets by subject, quality, or popularity</DocListItem>
          <DocListItem><strong>Preview:</strong> Listen to the first 30 seconds for free</DocListItem>
          <DocListItem><strong>Review:</strong> Read the full description and quality scores</DocListItem>
          <DocListItem><strong>Purchase:</strong> Pay in SONAR tokens</DocListItem>
          <DocListItem><strong>Download:</strong> Decrypt and access the full audio</DocListItem>
        </DocList>

        <p className="text-sonar-highlight-bright/80 mt-4">
          Each purchase is secure, fair, and transparent.
        </p>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Pricing</DocHeading>
        <DocParagraph>
          Creators set their own prices, but typical pricing:
        </DocParagraph>

        <div className="space-y-3 mt-4">
          <DocCard>
            <p className="font-mono text-sonar-signal mb-1">Small Datasets (1-5 samples)</p>
            <p className="text-sm text-sonar-highlight-bright/80">10-100 SONAR</p>
          </DocCard>
          <DocCard>
            <p className="font-mono text-sonar-signal mb-1">Medium Datasets (5-50 samples)</p>
            <p className="text-sm text-sonar-highlight-bright/80">100-1,000 SONAR</p>
          </DocCard>
          <DocCard>
            <p className="font-mono text-sonar-signal mb-1">Large Datasets (50-1,000 samples)</p>
            <p className="text-sm text-sonar-highlight-bright/80">1,000-10,000 SONAR</p>
          </DocCard>
          <DocCard>
            <p className="font-mono text-sonar-signal mb-1">Comprehensive Collections (1,000+ samples)</p>
            <p className="text-sm text-sonar-highlight-bright/80">10,000-100,000+ SONAR</p>
          </DocCard>
        </div>

        <p className="text-sonar-highlight-bright/80 mt-4">
          High-rarity, verified datasets command premium prices.
        </p>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>What You Get</DocHeading>
        <DocParagraph>
          When you purchase a dataset, you receive:
        </DocParagraph>

        <DocList>
          <DocListItem><strong>Full-Quality Audio:</strong> Complete, uncompressed audio at original quality</DocListItem>
          <DocListItem><strong>Full Duration:</strong> Entire recording(s), not just preview</DocListItem>
          <DocListItem><strong>Metadata:</strong> Complete information about the recording</DocListItem>
          <DocListItem><strong>Permanent Access:</strong> Can download and re-download anytime</DocListItem>
          <DocListItem><strong>Commercial Rights:</strong> Subject to creator's license terms</DocListItem>
          <DocListItem><strong>No DRM:</strong> Downloaded files are completely yours</DocListItem>
        </DocList>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Privacy and Security</DocHeading>
        <DocParagraph>
          Your purchases are:
        </DocParagraph>

        <DocList>
          <DocListItem><strong>Blockchain-Recorded:</strong> Permanent record of your purchase ownership</DocListItem>
          <DocListItem><strong>Decentralized:</strong> No central authority controls your access</DocListItem>
          <DocListItem><strong>Encrypted:</strong> Audio remains encrypted until you authorize decryption</DocListItem>
          <DocListItem><strong>Your Data:</strong> Creators cannot revoke access or track how you use audio</DocListItem>
        </DocList>

        <p className="text-sonar-highlight-bright/80 mt-4">
          Creator knows you purchased but cannot see how you use the audio.
        </p>
      </DocSection>
    </DocContent>
  );
}
