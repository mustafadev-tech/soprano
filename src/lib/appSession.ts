import type { Profile, UserRole } from '@/types/contract';

const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;

export const APP_SESSION_COOKIE_NAME = 'soprano_session';

interface SessionTokenPayload {
  sub: string;
  username: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
  iat: number;
  exp: number;
}

export interface SessionProfileData {
  id: string;
  username: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
}

function normalizeRole(value: unknown): UserRole {
  return value === 'soprano_admin' ? 'soprano_admin' : 'soprano_garson';
}

function encodeBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = '';

    for (const value of bytes) {
      binary += String.fromCharCode(value);
    }

    return btoa(binary);
  }

  return Buffer.from(bytes).toString('base64');
}

function decodeBase64(value: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  }

  return new Uint8Array(Buffer.from(value, 'base64'));
}

function toBase64Url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;

  return encodeBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input: string): Uint8Array {
  const normalizedInput = input.replace(/-/g, '+').replace(/_/g, '/');
  const paddedInput = normalizedInput.padEnd(
    normalizedInput.length + ((4 - (normalizedInput.length % 4)) % 4),
    '=',
  );

  return decodeBase64(paddedInput);
}

function getSessionSecret(): string {
  return (
    process.env.APP_AUTH_SECRET ??
    `${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'soprano-dev-session-secret'}:session`
  );
}

async function importSessionKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSessionSecret()),
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  );
}

async function signValue(value: string): Promise<string> {
  const sessionKey = await importSessionKey();
  const signature = await crypto.subtle.sign(
    'HMAC',
    sessionKey,
    new TextEncoder().encode(value),
  );

  return toBase64Url(new Uint8Array(signature));
}

function isEqualString(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return difference === 0;
}

export function buildProfileFromSessionData(data: SessionProfileData): Profile {
  return {
    id: data.id,
    username: data.username,
    email: null,
    full_name: data.full_name,
    role: data.role,
    created_at: data.created_at,
  };
}

export async function createSessionToken(data: SessionProfileData): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: SessionTokenPayload = {
    sub: data.id,
    username: data.username,
    full_name: data.full_name,
    role: data.role,
    created_at: data.created_at,
    iat: issuedAt,
    exp: issuedAt + SESSION_DURATION_SECONDS,
  };
  const encodedHeader = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = await signValue(`${encodedHeader}.${encodedPayload}`);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export async function readSessionProfile(token: string | undefined): Promise<Profile | null> {
  if (!token) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = token.split('.');

  if (!encodedHeader || !encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = await signValue(`${encodedHeader}.${encodedPayload}`);

  if (!isEqualString(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(encodedPayload)),
    ) as Partial<SessionTokenPayload>;
    const currentTime = Math.floor(Date.now() / 1000);

    if (
      typeof payload.sub !== 'string' ||
      typeof payload.username !== 'string' ||
      typeof payload.created_at !== 'string' ||
      typeof payload.exp !== 'number' ||
      payload.exp <= currentTime
    ) {
      return null;
    }

    return buildProfileFromSessionData({
      id: payload.sub,
      username: payload.username,
      full_name: typeof payload.full_name === 'string' ? payload.full_name : null,
      role: normalizeRole(payload.role),
      created_at: payload.created_at,
    });
  } catch {
    return null;
  }
}

export function getSessionCookieOptions(): {
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DURATION_SECONDS,
  };
}
