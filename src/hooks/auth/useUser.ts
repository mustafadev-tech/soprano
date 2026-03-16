'use client';

import { useContext } from 'react';

import { AuthContext } from '@/components/auth/AuthProvider';

export function useUser() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useUser must be used within AuthProvider.');
  }

  return value;
}
