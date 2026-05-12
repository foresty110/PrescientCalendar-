/**
 * Edge runtime 가드.
 *
 * Auth.js v5 DB session은 Edge에서 직접 검증할 수 없음 (Prisma 어댑터 사용 불가).
 * 미들웨어는 세션 쿠키 존재만 확인하고, 실제 검증은 서버 컴포넌트·route handler의
 * `auth()` (full runtime, adapter 포함)에서 수행한다.
 *
 * 쿠키 이름은 Auth.js v5 기본: dev는 `authjs.session-token`,
 * prod는 `__Secure-authjs.session-token`.
 */
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/", "/signin", "/api/auth", "/api/docs"];

const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function hasSessionCookie(req: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => req.cookies.has(name));
}

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!hasSessionCookie(req)) {
    const signinUrl = new URL("/signin", req.nextUrl);
    return NextResponse.redirect(signinUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
