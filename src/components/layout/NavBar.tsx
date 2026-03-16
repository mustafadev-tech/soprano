'use client';

import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

import { RoleGate } from '@/components/auth/RoleGate';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { useUser } from '@/hooks/auth/useUser';

const navLinks = [
  { href: '/tables', label: 'Masalar' },
  { href: '/menu', label: 'Menü' },
  { href: '/todos', label: 'Yapılacaklar' },
];

function getRoleBadge(role: 'soprano_admin' | 'soprano_garson'): {
  label: string;
  className: string;
} {
  if (role === 'soprano_admin') {
    return {
      label: 'Admin',
      className:
        'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black',
    };
  }

  return {
    label: 'Garson',
      className:
      'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black',
  };
}

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useUser();

  if (pathname === '/login') {
    return null;
  }

  async function handleSignOut(): Promise<void> {
    await signOut();
    router.replace('/login');
    router.refresh();
  }

  const roleBadge = profile ? getRoleBadge(profile.role) : null;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm sm:h-12">
      <div className="flex min-h-12 flex-col gap-2 px-4 py-2 sm:h-full sm:min-h-0 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-0">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="shrink-0 text-sm font-semibold tracking-tight">Soprano</span>
          {roleBadge ? (
            <span
              className={cn(
                'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none tracking-[0.02em] sm:px-2.5 sm:py-1 sm:text-[11px]',
                roleBadge.className,
              )}
            >
              {roleBadge.label}
            </span>
          ) : null}
        </div>

        <div className="flex w-full items-center gap-3 overflow-x-auto pb-0.5 no-scrollbar sm:w-auto sm:justify-end sm:gap-6 sm:pb-0">
          {navLinks.map(({ href, label }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'shrink-0 text-xs transition-colors duration-150 sm:text-sm',
                  isActive
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </Link>
            );
          })}

          <RoleGate allowed={['soprano_admin']}>
            <Link
              href="/reports"
              className={cn(
                'shrink-0 text-xs transition-colors duration-150 sm:text-sm',
                pathname.startsWith('/reports')
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Z Raporu
            </Link>
          </RoleGate>

          <ThemeToggle />
          <button
            onClick={() => void handleSignOut()}
            className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground sm:text-sm"
            aria-label="Çıkış yap"
          >
            <LogOut className="h-4 w-4" />
            <span className="sm:inline">Çıkış</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
