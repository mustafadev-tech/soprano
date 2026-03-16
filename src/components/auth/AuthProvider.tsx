'use client';

import axios from 'axios';
import { createContext, useEffect, useMemo, useState } from 'react';

import {
  apiGet,
  apiPost,
  clearCache,
  getApiErrorMessage,
  unwrapApiResponse,
} from '@/lib/apiClient';
import type { GetCurrentUserResponse, UserRole } from '@/types/contract';
import { mapProfileToUi, type UiProfile } from '@/types/api';

interface AuthContextValue {
  profile: UiProfile | null;
  role: UserRole | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UiProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadProfile(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const nextProfile = await unwrapApiResponse(
        apiGet<GetCurrentUserResponse>('/api/auth/me', {
          cacheTTL: 0,
        }),
      );

      setProfile(mapProfileToUi(nextProfile));
    } catch (loadError) {
      if (axios.isAxiosError(loadError) && loadError.response?.status === 401) {
        setProfile(null);
        setError(null);
        return;
      }

      setProfile(null);
      setError(getApiErrorMessage(loadError, 'Kullanıcı bilgisi yüklenemedi'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProfile();
  }, []);

  async function signOut(): Promise<void> {
    await apiPost('/api/auth/logout');
    clearCache();
    setProfile(null);
    setError(null);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      profile,
      role: profile?.role ?? null,
      loading,
      error,
      isAuthenticated: Boolean(profile),
      refresh: () => loadProfile(),
      signOut,
    }),
    [error, loading, profile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
