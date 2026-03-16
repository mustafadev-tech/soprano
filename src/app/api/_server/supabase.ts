import { cookies } from 'next/headers';

import { createServerClient } from '@supabase/ssr/dist/module/createServerClient';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { serverError } from '@/app/api/_server/http';

type CookieStore = Awaited<ReturnType<typeof cookies>>;

let serviceRoleClient: SupabaseClient | null = null;

const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    cache: 'no-store',
  });

function getSupabaseEnv(): { supabaseUrl: string; supabaseAnonKey: string } {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw serverError('Missing Supabase environment variables.');
  }

  return { supabaseUrl, supabaseAnonKey };
}

function buildCookieAdapter(cookieStore: CookieStore): {
  getAll: () => ReturnType<CookieStore['getAll']>;
  setAll: (cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => void;
} {
  return {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet) {
      try {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set({
            name,
            value,
            ...(options ?? {}),
          } as never);
        }
      } catch {
        // Server components and some route contexts may expose a read-only cookie store.
      }
    },
  };
}

export async function getSupabaseRouteClient(): Promise<SupabaseClient> {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: buildCookieAdapter(cookieStore),
    global: {
      fetch: noStoreFetch,
    },
  });
}

export function getSupabaseServiceRole(): SupabaseClient {
  const { supabaseUrl } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw serverError('Missing Supabase service role key.');
  }

  if (!serviceRoleClient) {
    serviceRoleClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: noStoreFetch,
      },
    });
  }

  return serviceRoleClient;
}
