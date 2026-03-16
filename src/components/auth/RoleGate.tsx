'use client';

import type { UserRole } from '@/types/contract';
import { useUser } from '@/hooks/auth/useUser';

interface RoleGateProps {
  allowed: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGate({
  allowed,
  children,
  fallback = null,
}: RoleGateProps) {
  const { loading, role } = useUser();

  if (loading) {
    return null;
  }

  if (!role || !allowed.includes(role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
