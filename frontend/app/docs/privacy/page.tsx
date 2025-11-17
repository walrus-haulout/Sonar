'use client';

import Link from 'next/link';
import { DocContent, DocHeading, DocSection, DocParagraph, DocList, DocListItem, DocCard } from '@/components/docs/DocContent';

export default function PrivacyPolicyPage() {
  return (
    <DocContent>
      <DocSection>
        <DocHeading level={1}>Privacy Policy</DocHeading>
        <DocParagraph>
          At SONAR, we vow to keep your data safe. Your audio is encrypted using SEAL threshold cryptography and stored in decentralized Walrus storage. We are committed to transparency about how we use your data and protecting your privacy at every step.
        </DocParagraph>
        <DocParagraph className="text-sm text-sonar-highlight-bright/60 italic">
          Last updated: January 2025
        </DocParagraph>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Our Commitment to Data Security</DocHeading>

        <div className="space-y-4 mt-6">
          <DocCard variant="info">
            <h3 className="font-mono text-sonar-signal mb-2">Encrypted at Rest</h3>
            <p className="text-sm text-sonar-highlight-bright/80">
              All audio data is encrypted using SEAL (threshold cryptography) before leaving your device. Your data remains encrypted in Walrus decentralized storage, ensuring no single entity can access it without authorization.
            </p>
          </DocCard>

          <DocCard variant="success">
            <h3 className="font-mono text-sonar-signal mb-2">Threshold Decryption</h3>
            <p className="text-sm text-sonar-highlight-bright/80">
              SONAR uses a 4-of-6 key server architecture. This means at least 4 independent servers must cooperate to decrypt your data. No single server or individual can access your audio alone.
            </p>
          </DocCard>

          <DocCard>
            <h3 className="font-mono text-sonar-signal mb-2">Decentralized Storage</h3>
            <p className="text-sm text-sonar-highlight-bright/80">
              Your encrypted audio is stored on Walrus, a decentralized storage network. This prevents data loss, censorship, and single points of failure.
            </p>
          </DocCard>
        </div>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>What Data We Collect</DocHeading>

        <DocParagraph>
          When you upload audio to SONAR, we collect:
        </DocParagraph>

        <DocList>
          <DocListItem><strong>Audio files:</strong> The actual audio content you upload (encrypted)</DocListItem>
          <DocListItem><strong>Metadata:</strong> Title, description, tags, language, duration, and other descriptive information</DocListItem>
          <DocListItem><strong>Wallet address:</strong> Your Sui blockchain wallet address for ownership and payment</DocListItem>
          <DocListItem><strong>Verification data:</strong> Quality scores, transcriptions, safety checks, and copyright analysis results</DocListItem>
          <DocListItem><strong>Usage analytics:</strong> Upload times, file sizes, and platform interaction data</DocListItem>
        </DocList>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>How We Use Your Data</DocHeading>

        <DocParagraph>
          Your data is used for the following purposes:
        </DocParagraph>

        <div className="space-y-6 mt-6">
          <div className="border-l-2 border-sonar-signal/40 pl-4">
            <h4 className="font-mono text-sonar-highlight mb-2">1. Audio Verification</h4>
            <p className="text-sonar-highlight-bright/80 text-sm">
              We analyze audio quality, detect copyright issues, transcribe speech content, and verify safety. This ensures only high-quality, legal content enters the marketplace.
            </p>
          </div>

          <div className="border-l-2 border-sonar-signal/40 pl-4">
            <h4 className="font-mono text-sonar-highlight mb-2">2. AI Model Training</h4>
            <p className="text-sonar-highlight-bright/80 text-sm">
              <strong>We pull data from the entire project to train AI models.</strong> Your audio contributes to building better speech recognition, audio quality assessment, and safety detection systems. This benefits the entire community.
            </p>
          </div>

          <div className="border-l-2 border-sonar-signal/40 pl-4">
            <h4 className="font-mono text-sonar-highlight mb-2">3. Platform Improvement</h4>
            <p className="text-sonar-highlight-bright/80 text-sm">
              We use aggregated data to improve SONAR's performance, user experience, and marketplace features. This includes analyzing upload patterns, quality trends, and user behavior.
            </p>
          </div>

          <div className="border-l-2 border-sonar-signal/40 pl-4">
            <h4 className="font-mono text-sonar-highlight mb-2">4. Research & Development</h4>
            <p className="text-sonar-highlight-bright/80 text-sm">
              Your data may be used for academic research, technical papers, and advancing the state-of-the-art in audio processing and decentralized systems.
            </p>
          </div>
        </div>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Open Source AI Commitment</DocHeading>

        <DocCard variant="success">
          <h3 className="font-mono text-sonar-signal mb-3">We Plan to Release Everything</h3>
          <DocParagraph>
            <strong>All AI models and weights trained on SONAR data will be released as open source.</strong> When you contribute audio to SONAR, you're helping build public goods that benefit everyone, not proprietary systems locked behind corporate walls.
          </DocParagraph>
          <DocParagraph>
            This includes:
          </DocParagraph>
          <DocList className="mt-2">
            <DocListItem>Speech recognition models</DocListItem>
            <DocListItem>Audio quality assessment models</DocListItem>
            <DocListItem>Safety and copyright detection models</DocListItem>
            <DocListItem>Model weights and training parameters</DocListItem>
            <DocListItem>Training datasets (where legally permissible)</DocListItem>
          </DocList>
          <DocParagraph className="mt-4 text-sm text-sonar-highlight-bright/80">
            We believe in open research and community-driven innovation. Your contributions power models that anyone can use, study, and improve.
          </DocParagraph>
        </DocCard>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Access Control</DocHeading>

        <DocParagraph>
          SONAR has three levels of data access:
        </DocParagraph>

        <div className="space-y-4 mt-6">
          <div className="border-l-2 border-green-500/40 pl-4">
            <h4 className="font-mono text-green-400 mb-2">Owner Access (You)</h4>
            <p className="text-sonar-highlight-bright/80 text-sm">
              As the dataset owner, you have full control. You can access, modify metadata, and manage your dataset at any time through your wallet.
            </p>
          </div>

          <div className="border-l-2 border-blue-500/40 pl-4">
            <h4 className="font-mono text-blue-400 mb-2">Purchaser Access</h4>
            <p className="text-sonar-highlight-bright/80 text-sm">
              Users who purchase your dataset can decrypt and access the audio according to the terms you set (e.g., streaming only, download allowed, commercial use).
            </p>
          </div>

          <div className="border-l-2 border-amber-500/40 pl-4">
            <h4 className="font-mono text-amber-400 mb-2">Admin Access (SONAR Team)</h4>
            <p className="text-sonar-highlight-bright/80 text-sm">
              The SONAR team can access your dataset for verification, AI training, and platform improvement. This access is explicitly acknowledged during upload and protected by threshold decryption.
            </p>
          </div>
        </div>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Your Rights</DocHeading>

        <DocList>
          <DocListItem>
            <strong>Data Ownership:</strong> You retain full ownership of your audio and metadata. Uploading to SONAR does not transfer copyright.
          </DocListItem>
          <DocListItem>
            <strong>Access Control:</strong> You control who can purchase and access your datasets through smart contract permissions.
          </DocListItem>
          <DocListItem>
            <strong>Transparency:</strong> All transactions, purchases, and access grants are recorded on the Sui blockchain for full auditability.
          </DocListItem>
          <DocListItem>
            <strong>Data Deletion:</strong> You can request deletion of your datasets, though data used in already-trained models cannot be retroactively removed.
          </DocListItem>
          <DocListItem>
            <strong>Opt-Out:</strong> While AI training access is required for platform participation, you can delete your account and data at any time.
          </DocListItem>
        </DocList>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Data Retention</DocHeading>

        <DocParagraph>
          We retain your data as long as your account is active and your datasets are published on the marketplace. If you delete a dataset:
        </DocParagraph>

        <DocList>
          <DocListItem>Encrypted audio is removed from Walrus storage</DocListItem>
          <DocListItem>Blockchain records remain (ownership history, transactions) but point to deleted data</DocListItem>
          <DocListItem>AI models trained on your data are not modified (training is not reversible)</DocListItem>
          <DocListItem>Aggregated analytics remain for platform improvement</DocListItem>
        </DocList>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Third-Party Services</DocHeading>

        <DocParagraph>
          SONAR integrates with the following third-party services:
        </DocParagraph>

        <DocList>
          <DocListItem><strong>Sui Blockchain:</strong> Stores ownership records, transactions, and smart contracts (public by design)</DocListItem>
          <DocListItem><strong>Walrus Storage:</strong> Decentralized storage for encrypted audio files</DocListItem>
          <DocListItem><strong>SEAL Key Servers:</strong> Distributed threshold decryption network (operated by SONAR and partners)</DocListItem>
          <DocListItem><strong>AI Processing Services:</strong> Third-party AI APIs for transcription, quality analysis, and safety checks (data sent encrypted when possible)</DocListItem>
        </DocList>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Changes to This Policy</DocHeading>

        <DocParagraph>
          We may update this privacy policy as SONAR evolves. Material changes will be announced on our platform and via email (if you've provided one). Continued use after changes constitutes acceptance of the updated policy.
        </DocParagraph>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Contact Us</DocHeading>

        <DocParagraph>
          If you have questions, concerns, or requests regarding your privacy or data:
        </DocParagraph>

        <DocList>
          <DocListItem>
            <strong>Email:</strong>{' '}
            <a href="mailto:privacy@projectsonar.xyz" className="text-sonar-signal hover:text-sonar-highlight transition-colors">
              privacy@projectsonar.xyz
            </a>
          </DocListItem>
          <DocListItem>
            <strong>Documentation:</strong>{' '}
            <Link href="/docs" className="text-sonar-signal hover:text-sonar-highlight transition-colors">
              SONAR Documentation
            </Link>
          </DocListItem>
          <DocListItem>
            <strong>GitHub:</strong> Report security issues at our{' '}
            <a href="https://github.com/sonar-audio" target="_blank" rel="noopener noreferrer" className="text-sonar-signal hover:text-sonar-highlight transition-colors">
              GitHub repository
            </a>
          </DocListItem>
        </DocList>
      </DocSection>

      <DocSection className="mt-12 pt-8 border-t border-sonar-signal/20">
        <DocCard variant="info">
          <h3 className="font-mono text-sonar-signal mb-3">Summary: Our Privacy Promise</h3>
          <DocParagraph>
            We encrypt your data with threshold cryptography, store it in decentralized Walrus storage, and use it to train open-source AI models that benefit everyone. You retain ownership, control access, and can delete your data at any time. We vow to keep your data safe and be transparent about how we use it.
          </DocParagraph>
        </DocCard>
      </DocSection>
    </DocContent>
  );
}
