import { NextResponse } from 'next/server';

import { getSupabaseRouteClient } from '@/app/api/_server/supabase';
import { runRoute, unauthorized } from '@/app/api/_server/http';
import { authenticateStaffCredentials } from '@/app/api/_server/staffAuth';
import { parseNonEmptyString, readJsonObject } from '@/app/api/_server/validation';
import {
  APP_SESSION_COOKIE_NAME,
  createSessionToken,
  getSessionCookieOptions,
} from '@/lib/appSession';

export async function POST(request: Request): Promise<Response> {
  return runRoute(request, { params: Promise.resolve({}) }, async (incomingRequest) => {
    const supabase = await getSupabaseRouteClient();
    const body = await readJsonObject(incomingRequest);
    const username = parseNonEmptyString(body.username, 'username');
    const password = parseNonEmptyString(body.password, 'password');
    const profile = await authenticateStaffCredentials(supabase, username, password);

    if (!profile) {
      throw unauthorized('Invalid credentials.');
    }

    const sessionToken = await createSessionToken({
      id: profile.id,
      username: profile.username,
      full_name: profile.full_name,
      role: profile.role,
      created_at: profile.created_at,
    });
    const response = NextResponse.json(
      {
        data: profile,
        error: null,
        status: 200,
      },
      { status: 200 },
    );

    response.cookies.set({
      name: APP_SESSION_COOKIE_NAME,
      value: sessionToken,
      ...getSessionCookieOptions(),
    });

    return response;
  });
}
