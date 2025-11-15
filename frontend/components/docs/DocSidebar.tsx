'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface DocItem {
  title: string;
  href?: string;
  items?: DocItem[];
}

interface DocSidebarProps {
  items: DocItem[];
}

export function DocSidebar({ items }: DocSidebarProps) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (href: string) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(href)) {
      newExpanded.delete(href);
    } else {
      newExpanded.add(href);
    }
    setExpanded(newExpanded);
  };

  const isActive = (href?: string) => {
    if (!href) return false;
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <nav className="w-64 flex-shrink-0 border-r border-sonar-signal/20 bg-sonar-abyss/40 backdrop-blur-sm">
      <div className="sticky top-0 h-screen overflow-y-auto p-6 space-y-2">
        <DocNavItems items={items} pathname={pathname} expanded={expanded} onToggle={toggleExpanded} />
      </div>
    </nav>
  );
}

interface DocNavItemsProps {
  items: DocItem[];
  pathname: string;
  expanded: Set<string>;
  onToggle: (href: string) => void;
}

function DocNavItems({ items, pathname, expanded, onToggle }: DocNavItemsProps) {
  return (
    <>
      {items.map((item, idx) => (
        <div key={idx}>
          {item.href ? (
            <Link href={item.href}>
              <div
                className={cn(
                  'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  pathname === item.href
                    ? 'bg-sonar-signal/20 text-sonar-signal font-mono'
                    : 'text-sonar-highlight-bright/70 hover:text-sonar-highlight hover:bg-sonar-deep/30'
                )}
              >
                {item.title}
              </div>
            </Link>
          ) : (
            <>
              <button
                onClick={() => item.items && onToggle(item.title)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  'text-sonar-highlight hover:bg-sonar-deep/30'
                )}
              >
                <span>{item.title}</span>
                {item.items && (
                  <ChevronDown
                    className={cn(
                      'w-4 h-4 transition-transform',
                      expanded.has(item.title) && 'rotate-180'
                    )}
                  />
                )}
              </button>
              {item.items && expanded.has(item.title) && (
                <div className="ml-2 border-l border-sonar-signal/20 space-y-1 py-2">
                  <DocNavItems
                    items={item.items}
                    pathname={pathname}
                    expanded={expanded}
                    onToggle={onToggle}
                  />
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </>
  );
}
