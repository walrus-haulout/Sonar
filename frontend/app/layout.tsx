import type { Metadata } from 'next';
import { IBM_Plex_Mono, Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

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
    'High-quality conversational audio data marketplace with privacy-first design and adaptive token economics. Built on Sui with Walrus storage and Mysten Seal encryption.',
  keywords: ['blockchain', 'audio data', 'sui', 'walrus', 'data marketplace', 'AI training data'],
  authors: [{ name: 'SONAR Protocol' }],
  openGraph: {
    title: 'SONAR Protocol',
    description: 'Decentralized marketplace for high-quality conversational audio data',
    type: 'website',
    siteName: 'SONAR Protocol',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SONAR Protocol',
    description: 'Decentralized marketplace for high-quality conversational audio data',
  },
  viewport: 'width=device-width, initial-scale=1',
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
