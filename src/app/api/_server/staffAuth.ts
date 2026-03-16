import type { SupabaseClient } from '@supabase/supabase-js';

import type { Profile, UserRole } from '@/types/contract';
import { verifyPasswordHash } from '@/lib/passwordHash';

import { serverError } from '@/app/api/_server/http';

interface StaffAccountRow {
  id: string;
  username: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  password_hash?: string | null;
}

interface SupabaseLikeError {
  code?: string;
  message?: string;
}

interface AuthSourceSuccess {
  outcome: 'authenticated';
  profile: Profile;
}

interface AuthSourceFailure {
  outcome: 'invalid' | 'unavailable';
}

type AuthSourceResult = AuthSourceSuccess | AuthSourceFailure;

const BOOTSTRAP_CREATED_AT = '2026-03-16T00:00:00.000Z';
const BOOTSTRAP_ACCOUNTS: Array<StaffAccountRow & { password_hash: string }> = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    username: 'sopranoAdmin',
    full_name: 'Soprano Admin',
    role: 'soprano_admin',
    created_at: BOOTSTRAP_CREATED_AT,
    password_hash:
      'scrypt$xt0zCBepeLoeYh_JpInqfg$e989Q27WYZ8W3zooNSd6rwlkBX68jhnZznjH9Vznp5vRskBKHreApBSPi0oUTTh7qME8cOVSh9s0k2YlQXO7_A',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    username: 'sopranoGarson',
    full_name: 'Soprano Garson',
    role: 'soprano_garson',
    created_at: BOOTSTRAP_CREATED_AT,
    password_hash:
      'scrypt$q7ctP2R9hC0wuaaO09y41Q$5Ph-b54t-QqFu3uJBuhp5PzS4HbByaNCK__avJ9dfHn2FhtuHmrjbFvGv6-KfHbxTOGk4NOEBWeynoaghVY5Sg',
  },
];

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function mapStaffAccountToProfile(account: StaffAccountRow): Profile {
  return {
    id: account.id,
    username: account.username,
    email: null,
    full_name: account.full_name,
    role: account.role,
    created_at: account.created_at,
  };
}

function getFirstRow(data: unknown): StaffAccountRow | null {
  if (Array.isArray(data)) {
    return data.length > 0 ? (data[0] as StaffAccountRow) : null;
  }

  if (data && typeof data === 'object') {
    return data as StaffAccountRow;
  }

  return null;
}

function isUnavailableRpcError(error: SupabaseLikeError | null | undefined): boolean {
  const message = error?.message?.toLowerCase() ?? '';

  return (
    error?.code === 'PGRST202' ||
    error?.code === '42501' ||
    (message.includes('authenticate_staff_user') &&
      (message.includes('schema cache') ||
        message.includes('does not exist') ||
        message.includes('permission denied')))
  );
}

function isUnavailableTableError(error: SupabaseLikeError | null | undefined): boolean {
  const message = error?.message?.toLowerCase() ?? '';

  return (
    error?.code === 'PGRST205' ||
    error?.code === '42P01' ||
    error?.code === '42501' ||
    (message.includes('staff_accounts') &&
      (message.includes('schema cache') ||
        message.includes('does not exist') ||
        message.includes('permission denied')))
  );
}

async function authenticateWithRpc(
  supabase: SupabaseClient,
  username: string,
  password: string,
): Promise<AuthSourceResult> {
  const { data, error } = await supabase.rpc('authenticate_staff_user', {
    p_username: username,
    p_password: password,
  });

  if (error) {
    if (isUnavailableRpcError(error)) {
      return {
        outcome: 'unavailable',
      };
    }

    throw serverError('Failed to authenticate user.');
  }

  const account = getFirstRow(data);

  if (!account) {
    return {
      outcome: 'invalid',
    };
  }

  return {
    outcome: 'authenticated',
    profile: mapStaffAccountToProfile(account),
  };
}

async function authenticateWithTable(
  supabase: SupabaseClient,
  username: string,
  password: string,
): Promise<AuthSourceResult> {
  const { data, error } = await supabase
    .from('staff_accounts')
    .select('id, username, full_name, role, created_at, password_hash')
    .ilike('username', username)
    .maybeSingle();

  if (error) {
    if (isUnavailableTableError(error)) {
      return {
        outcome: 'unavailable',
      };
    }

    throw serverError('Failed to authenticate user.');
  }

  if (!data) {
    return {
      outcome: 'invalid',
    };
  }

  if (!data.password_hash || !verifyPasswordHash(password, data.password_hash)) {
    return {
      outcome: 'invalid',
    };
  }

  return {
    outcome: 'authenticated',
    profile: mapStaffAccountToProfile(data),
  };
}

function authenticateWithBootstrap(username: string, password: string): Profile | null {
  const matchingAccount = BOOTSTRAP_ACCOUNTS.find((account) => {
    return (
      normalizeUsername(account.username) === normalizeUsername(username) &&
      verifyPasswordHash(password, account.password_hash)
    );
  });

  return matchingAccount ? mapStaffAccountToProfile(matchingAccount) : null;
}

export async function authenticateStaffCredentials(
  supabase: SupabaseClient,
  username: string,
  password: string,
): Promise<Profile | null> {
  const normalizedUsername = username.trim();
  const normalizedPassword = password.trim();

  if (!normalizedUsername || !normalizedPassword) {
    return null;
  }

  const rpcResult = await authenticateWithRpc(supabase, normalizedUsername, normalizedPassword);

  if (rpcResult.outcome === 'authenticated') {
    return rpcResult.profile;
  }

  if (rpcResult.outcome === 'invalid') {
    return null;
  }

  const tableResult = await authenticateWithTable(
    supabase,
    normalizedUsername,
    normalizedPassword,
  );

  if (tableResult.outcome === 'authenticated') {
    return tableResult.profile;
  }

  if (tableResult.outcome === 'invalid') {
    return null;
  }

  return authenticateWithBootstrap(normalizedUsername, normalizedPassword);
}
