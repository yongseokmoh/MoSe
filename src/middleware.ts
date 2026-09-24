import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const authCookie = request.cookies.get('mose_auth');
  const { pathname } = request.nextUrl;

  // 로그인 페이지, API, 정적 파일 등은 통과
  if (pathname === '/login' || pathname.startsWith('/api/') || pathname.startsWith('/_next/') || pathname.startsWith('/data/')) {
    return NextResponse.next();
  }

  // 쿠키가 없으면 로그인 페이지로 리다이렉트
  if (!authCookie || authCookie.value !== 'authenticated') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/((?!api|_next/static|_next/image|favicon.ico).*)',
};
