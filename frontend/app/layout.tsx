import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Navbar } from '@/components/layout/Navbar';
import { LazyMotion, domAnimation } from 'framer-motion';

import { DeploymentGuard } from '@/components/layout/DeploymentGuard';

const ibmPlexMono = IBM_Plex_Mono({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SONAR Protocol - Decentralized Audio Data Marketplace',
  description:
    'High-quality audio data marketplace for speech, music, environmental sounds, vocals, sound effects, and more. Privacy-first design with adaptive token economics. Built on Sui with Walrus storage and Mysten Seal encryption.',
  keywords: ['blockchain', 'audio data', 'music', 'sound', 'sui', 'walrus', 'data marketplace', 'AI training data', 'audio spectrum'],
  authors: [{ name: 'SONAR Protocol' }],
  openGraph: {
    title: 'SONAR Protocol',
    description: 'Decentralized marketplace for high-quality audio data: speech, music, environmental sounds, vocals, sound effects, and more',
    type: 'website',
    siteName: 'SONAR Protocol',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SONAR Protocol',
    description: 'Decentralized marketplace for high-quality audio data: speech, music, environmental sounds, vocals, sound effects, and more',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0A172A',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${ibmPlexMono.variable} ${inter.variable}`}>
      <body>
        <DeploymentGuard />
        <LazyMotion features={domAnimation}>
          <Providers>
            <Navbar />
            <div className="pt-18">{children}</div>
          </Providers>
        </LazyMotion>
      </body>
    </html>
  );
}
