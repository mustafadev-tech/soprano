import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

import { forbidden, unauthorized } from '@/app/api/_server/http';
import { getSupabaseRouteClient } from '@/app/api/_server/supabase';
import { APP_SESSION_COOKIE_NAME, readSessionProfile } from '@/lib/appSession';
import type { Profile, UserRole } from '@/types/contract';

export interface AuthenticatedRequestContext {
  supabase: SupabaseClient;
  user: Profile;
  profile: Profile;
}

export async function requireAuthenticatedUser(): Promise<AuthenticatedRequestContext> {
  const [supabase, cookieStore] = await Promise.all([getSupabaseRouteClient(), cookies()]);
  const sessionCookie = cookieStore.get(APP_SESSION_COOKIE_NAME)?.value;
  const profile = await readSessionProfile(sessionCookie);

  if (!profile) {
    throw unauthorized('Unauthorized.');
  }

  return {
    supabase,
    user: profile,
    profile,
  };
}

export async function requireProfile(): Promise<AuthenticatedRequestContext> {
  return requireAuthenticatedUser();
}

export async function requireRole(allowed: UserRole[]): Promise<AuthenticatedRequestContext> {
  const context = await requireProfile();

  if (!allowed.includes(context.profile.role)) {
    throw forbidden('Forbidden.');
  }

  return context;
}
