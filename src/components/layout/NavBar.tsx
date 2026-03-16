'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

const navLinks = [
  { href: '/tables', label: 'Masalar' },
  { href: '/menu', label: 'Menü' },
  { href: '/reports', label: 'Z Raporu' },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-12 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="flex h-full items-center justify-between px-4 sm:px-6">
        <span className="text-sm font-semibold tracking-tight shrink-0">Soprano</span>
        <div className="flex items-center gap-3 sm:gap-6 overflow-x-auto no-scrollbar">
          {navLinks.map(({ href, label }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'text-sm transition-colors duration-150 shrink-0',
                  isActive
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </Link>
            );
          })}
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
