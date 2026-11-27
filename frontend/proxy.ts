import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/login', '/signup'];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasToken = req.cookies.has('wa_token');
  const isPublic = PUBLIC.some((p) => pathname === p);
  if (!hasToken && !isPublic) return NextResponse.redirect(new URL('/login', req.url));
  if (hasToken && isPublic) return NextResponse.redirect(new URL('/inbox', req.url));
  if (pathname === '/') return NextResponse.redirect(new URL(hasToken ? '/inbox' : '/login', req.url));
  return NextResponse.next();
}

export const config = { matcher: ['/((?!api|_next|brand/|favicon.ico|icon.svg|apple-icon.png).*)'] };
