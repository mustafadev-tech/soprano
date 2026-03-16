'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { RoleGate } from '@/components/auth/RoleGate';
import { useUser } from '@/hooks/auth/useUser';
import type { UserRole } from '@/types/contract';

interface RequireRoleProps {
  allowed: UserRole[];
  redirectTo?: string;
  children: React.ReactNode;
}

export function RequireRole({
  allowed,
  redirectTo = '/tables',
  children,
}: RequireRoleProps) {
  const router = useRouter();
  const { loading, role } = useUser();

  useEffect(() => {
    if (!loading && (!role || !allowed.includes(role))) {
      router.replace(redirectTo);
    }
  }, [allowed, loading, redirectTo, role, router]);

  return <RoleGate allowed={allowed}>{children}</RoleGate>;
}
