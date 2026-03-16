import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { serverError } from '@/app/api/_server/http';

let supabaseAdmin: SupabaseClient | null = null;

const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    cache: 'no-store',
  });

export function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const accessKey = serviceRoleKey || anonKey;

  if (!supabaseUrl || !accessKey) {
    throw serverError('Missing Supabase server environment variables.');
  }

  if (!supabaseAdmin) {
    supabaseAdmin = createClient(supabaseUrl, accessKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: noStoreFetch,
      },
    });
  }

  return supabaseAdmin;
}
