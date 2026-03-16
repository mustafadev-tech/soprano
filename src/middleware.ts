import { NextResponse, type NextRequest } from 'next/server';

import { APP_SESSION_COOKIE_NAME, readSessionProfile } from '@/lib/appSession';

const PUBLIC_PATHS = new Set(['/login']);

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/images') ||
    pathname.startsWith('/icons') ||
    pathname.match(/\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$/) !== null
  );
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith('/api') || isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  const isPublicPath = PUBLIC_PATHS.has(pathname);
  const sessionCookie = request.cookies.get(APP_SESSION_COOKIE_NAME)?.value;
  const sessionProfile = await readSessionProfile(sessionCookie);

  if (!sessionProfile && !isPublicPath) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (sessionProfile && pathname === '/login') {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/tables';
    redirectUrl.searchParams.delete('next');
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
