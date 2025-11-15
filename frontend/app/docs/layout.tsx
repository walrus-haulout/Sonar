import { DocSidebar, DocItem } from '@/components/docs/DocSidebar';
import { SonarBackground } from '@/components/animations/SonarBackground';

const docItems: DocItem[] = [
  {
    title: 'Getting Started',
    items: [
      { title: 'Overview', href: '/docs/getting-started' },
      { title: 'Quick Start', href: '/docs/getting-started/quick-start' },
      { title: 'Key Concepts', href: '/docs/getting-started/concepts' },
    ],
  },
  {
    title: 'Uploading Audio',
    items: [
      { title: 'Overview', href: '/docs/uploading-audio' },
      { title: 'File Selection', href: '/docs/uploading-audio/file-selection' },
      { title: 'Metadata', href: '/docs/uploading-audio/metadata' },
      { title: 'Encryption', href: '/docs/uploading-audio/encryption' },
      { title: 'Verification', href: '/docs/uploading-audio/verification' },
      { title: 'Publishing', href: '/docs/uploading-audio/publishing' },
    ],
  },
  {
    title: 'Rarity System',
    items: [
      { title: 'Overview', href: '/docs/rarity-system' },
      { title: 'Rarity Scoring', href: '/docs/rarity-system/rarity-scoring' },
      { title: 'Points System', href: '/docs/rarity-system/points-system' },
      { title: 'Tiers', href: '/docs/rarity-system/tiers' },
      { title: 'Leaderboard', href: '/docs/rarity-system/leaderboard' },
    ],
  },
  {
    title: 'Purchasing',
    items: [
      { title: 'Overview', href: '/docs/purchasing' },
    ],
  },
  {
    title: 'Technical',
    items: [
      { title: 'Overview', href: '/docs/technical' },
      { title: 'Architecture', href: '/docs/technical/architecture' },
    ],
  },
  {
    title: 'Tokenomics',
    items: [
      { title: 'Overview', href: '/docs/tokenomics' },
      { title: 'Adaptive Burns', href: '/docs/tokenomics/adaptive-burns' },
    ],
  },
];

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="relative min-h-screen">
      {/* Background Animation */}
      <SonarBackground opacity={0.15} intensity={0.4} />

      <div className="relative z-10 flex h-screen">
        {/* Sidebar */}
        <DocSidebar items={docItems} />

        {/* Content */}
        {children}
      </div>
    </main>
  );
}
