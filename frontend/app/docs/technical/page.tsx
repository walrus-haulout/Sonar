'use client';

import Link from 'next/link';
import { DocContent, DocHeading, DocSection, DocParagraph, DocList, DocListItem, DocCard } from '@/components/docs/DocContent';

export default function TechnicalPage() {
  return (
    <DocContent>
      <DocSection>
        <DocHeading level={1}>Technical Overview</DocHeading>
        <DocParagraph>
          This section explains the technical systems that make SONAR work: encryption, storage, verification, and blockchain integration.
        </DocParagraph>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Key Systems</DocHeading>
        
        <div className="space-y-4 mt-6">
          <DocCard variant="info">
            <h4 className="font-mono text-sonar-signal mb-2">SEAL Encryption</h4>
            <p className="text-sm text-sonar-highlight-bright/80">
              SEAL (Simple Encryption At Launch) is Mysten Labs' decentralized encryption system. It ensures your audio is encrypted client-side with threshold cryptography.
            </p>
          </DocCard>

          <DocCard>
            <h4 className="font-mono text-sonar-signal mb-2">Threshold Cryptography</h4>
            <p className="text-sm text-sonar-highlight-bright/80">
              Your encryption key uses Shamir Secret Sharing: key split into 3 shares, any 2 can reconstruct the original key, no single server can decrypt alone.
            </p>
          </DocCard>

          <DocCard variant="success">
            <h4 className="font-mono text-sonar-signal mb-2">Walrus Storage</h4>
            <p className="text-sm text-sonar-highlight-bright/80">
              Encrypted audio is stored on Walrus, a decentralized blob storage network. Multiple independent nodes store copies, no single company controls your data.
            </p>
          </DocCard>

          <DocCard variant="warning">
            <h4 className="font-mono text-sonar-signal mb-2">Verification Pipeline</h4>
            <p className="text-sm text-sonar-highlight-bright/80">
              Audio goes through 6 automated stages: quality check, copyright detection, transcription, AI analysis, aggregation, and finalization.
            </p>
          </DocCard>
        </div>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Security Properties</DocHeading>
        
        <div className="space-y-4 mt-6">
          <div className="border-l-2 border-sonar-signal/40 pl-4">
            <h4 className="font-mono text-sonar-highlight mb-2">Confidentiality</h4>
            <p className="text-sonar-highlight-bright/80 text-sm">
              Encryption key never transmitted in plaintext. SEAL servers cannot decrypt alone. Audio-verifier requires SessionKey authorization. Walrus stores only encrypted blobs.
            </p>
          </div>

          <div className="border-l-2 border-sonar-signal/40 pl-4">
            <h4 className="font-mono text-sonar-highlight mb-2">Integrity</h4>
            <p className="text-sonar-highlight-bright/80 text-sm">
              AES-GCM provides authentication. Blockchain immutably records ownership. Tampering detected automatically.
            </p>
          </div>

          <div className="border-l-2 border-sonar-signal/40 pl-4">
            <h4 className="font-mono text-sonar-highlight mb-2">Availability</h4>
            <p className="text-sonar-highlight-bright/80 text-sm">
              Multiple SEAL servers prevent single point of failure. Walrus replicates data across multiple nodes. Blockchain provides permanent record.
            </p>
          </div>

          <div className="border-l-2 border-sonar-signal/40 pl-4">
            <h4 className="font-mono text-sonar-highlight mb-2">Non-Repudiation</h4>
            <p className="text-sonar-highlight-bright/80 text-sm">
              Transactions signed with private key. Creator cannot deny publishing. Buyer cannot deny purchasing. Blockchain evidence is permanent.
            </p>
          </div>
        </div>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Technology Stack</DocHeading>
        
        <div className="overflow-x-auto mt-6">
          <table className="w-full text-sm">
            <thead className="bg-sonar-deep/40 border-b border-sonar-signal/20">
              <tr>
                <th className="px-4 py-2 text-left font-mono text-sonar-highlight">Layer</th>
                <th className="px-4 py-2 text-left font-mono text-sonar-highlight">Technology</th>
                <th className="px-4 py-2 text-left font-mono text-sonar-highlight">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sonar-signal/20">
              <tr>
                <td className="px-4 py-2 text-sonar-highlight-bright/80">Frontend</td>
                <td className="px-4 py-2 text-sonar-highlight-bright/80">Next.js 14, TypeScript</td>
                <td className="px-4 py-2 text-sonar-highlight-bright/80">UI and UX</td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-sonar-highlight-bright/80">Encryption</td>
                <td className="px-4 py-2 text-sonar-highlight-bright/80">SEAL, AES-256, Shamir</td>
                <td className="px-4 py-2 text-sonar-highlight-bright/80">Client-side encryption</td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-sonar-highlight-bright/80">Storage</td>
                <td className="px-4 py-2 text-sonar-highlight-bright/80">Walrus</td>
                <td className="px-4 py-2 text-sonar-highlight-bright/80">Decentralized blob storage</td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-sonar-highlight-bright/80">Verification</td>
                <td className="px-4 py-2 text-sonar-highlight-bright/80">Python FastAPI</td>
                <td className="px-4 py-2 text-sonar-highlight-bright/80">Audio analysis pipeline</td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-sonar-highlight-bright/80">Blockchain</td>
                <td className="px-4 py-2 text-sonar-highlight-bright/80">Sui Move</td>
                <td className="px-4 py-2 text-sonar-highlight-bright/80">Smart contracts and records</td>
              </tr>
              <tr>
                <td className="px-4 py-2 text-sonar-highlight-bright/80">Database</td>
                <td className="px-4 py-2 text-sonar-highlight-bright/80">PostgreSQL + pgvector</td>
                <td className="px-4 py-2 text-sonar-highlight-bright/80">Data persistence and search</td>
              </tr>
            </tbody>
          </table>
        </div>
      </DocSection>

      <DocSection>
        <DocHeading level={2}>Learn More</DocHeading>
        
        <DocList>
          <DocListItem>
            <strong><Link href="/docs/technical/architecture" className="text-sonar-signal hover:text-sonar-highlight transition-colors">Architecture</Link></strong> - System components and data flow
          </DocListItem>
        </DocList>
      </DocSection>
    </DocContent>
  );
}
