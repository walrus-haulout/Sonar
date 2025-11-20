'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit';
import { SignalBadge } from '@/components/ui/SignalBadge';
import { cn } from '@/lib/utils';
import { truncateAddress } from '@/lib/utils';

/**
 * Navbar Component
 * Global navigation bar with Sui wallet connection
 * Displays tier badge and current network status
 */
export function Navbar() {
  const pathname = usePathname();
  const currentAccount = useCurrentAccount();

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/docs', label: 'Docs' },
    { href: '/marketplace', label: 'Marketplace' },
    ...(currentAccount ? [{ href: '/dashboard', label: 'Dashboard' }] : []),
    { href: '/leaderboard', label: 'Leaderboard' },
    { href: '/roadmap', label: 'Roadmap' },
    { href: '/tokenomics', label: 'Tokenomics' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-panel border-b border-white/5">
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-18">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="relative w-12 h-8">
              {/* Subtle background glow */}
              <div className="absolute inset-0 bg-sonar-signal/10 blur-sm group-hover:bg-sonar-signal/20 transition-all" />
              <Image
                src="/images/walrus-icon.png"
                alt="SONAR Protocol"
                width={48}
                height={32}
                className="relative z-10 opacity-90 group-hover:opacity-100 transition-all drop-shadow-lg"
                priority
              />
            </div>
            <div>
              <h1 className="text-xl font-mono font-bold text-sonar-highlight group-hover:text-sonar-highlight-bright transition-colors">
                SONAR
              </h1>
              <p className="text-xs text-sonar-highlight-bright/60 -mt-1">
                Audio Data Market
              </p>
            </div>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'px-4 py-2 rounded-sonar font-mono text-sm tracking-wide transition-all',
                    isActive
                      ? 'bg-sonar-signal/20 text-sonar-highlight-bright border border-sonar-signal/40'
                      : 'text-sonar-highlight-bright/70 hover:text-sonar-highlight-bright hover:bg-sonar-signal/10'
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Right Section: Network Badge + Wallet */}
          <div className="flex items-center space-x-4">
            {/* Network Status */}
            <SignalBadge variant="success" className="hidden sm:flex">
              Mainnet
            </SignalBadge>

            {/* Wallet Connection Info (when connected) */}
            {currentAccount && (
              <div className="hidden lg:flex items-center space-x-2 px-3 py-2 bg-sonar-signal/10 rounded-sonar border border-sonar-signal/30">
                <div className="w-2 h-2 bg-sonar-signal rounded-full animate-pulse" />
                <span className="text-xs font-mono text-sonar-highlight">
                  {truncateAddress(currentAccount.address)}
                </span>
              </div>
            )}

            {/* Sui Wallet Connect Button */}
            <div className="sui-wallet-button">
              <ConnectButton />
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
