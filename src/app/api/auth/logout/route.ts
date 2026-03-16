import { NextResponse } from 'next/server';

import {
  APP_SESSION_COOKIE_NAME,
  getSessionCookieOptions,
} from '@/lib/appSession';

export async function POST(): Promise<Response> {
  const response = NextResponse.json(
    {
      data: null,
      error: null,
      status: 200,
    },
    { status: 200 },
  );

  response.cookies.set({
    name: APP_SESSION_COOKIE_NAME,
    value: '',
    ...getSessionCookieOptions(),
    maxAge: 0,
  });

  return response;
}
