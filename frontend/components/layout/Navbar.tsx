'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignalBadge } from '@/components/ui/SignalBadge';
import { SonarButton } from '@/components/ui/SonarButton';
import { cn } from '@/lib/utils';

/**
 * Navbar Component
 * Global navigation bar with wallet connection
 * Displays tier badge and current network status
 */
export function Navbar() {
  const pathname = usePathname();

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/marketplace', label: 'Marketplace' },
    { href: '/stats', label: 'Economics' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-panel border-b border-white/5">
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-18">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="relative">
              {/* Sonar ping effect on logo */}
              <div className="absolute inset-0 bg-sonar-signal/20 rounded-full animate-ping" />
              <div className="relative w-10 h-10 bg-gradient-to-br from-sonar-signal to-sonar-highlight rounded-full flex items-center justify-center">
                <span className="text-xl font-mono font-bold text-sonar-abyss">
                  S
                </span>
              </div>
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
            <SignalBadge variant="info" className="hidden sm:flex">
              Testnet
            </SignalBadge>

            {/* Wallet Connect Button - Placeholder for now */}
            <SonarButton variant="primary" className="font-mono text-sm">
              Connect Wallet
            </SonarButton>
          </div>
        </div>
      </div>
    </nav>
  );
}
