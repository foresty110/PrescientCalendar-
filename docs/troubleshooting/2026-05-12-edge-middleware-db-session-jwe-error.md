# Edge 미들웨어가 DB 세션 쿠키를 JWT로 디코딩하려다 무한 루프

- 날짜: 2026-05-12
- 영향 범위: 인증 흐름 (Auth.js v5 + DB session + Next.js middleware)
- 관련 기능: FEATURES.md 1.4 (미로그인 시 보호 라우트 차단)

## 증상

Google OAuth 로그인을 끝까지 마쳐도 `/app`으로 진입하지 못하고 즉시 `/signin`으로 튕겨나오는 무한 루프.

서버 로그:
```
POST /signin 303 ... ── Google OAuth로 이동
GET /api/auth/callback/google?... 302 ... ── 콜백 성공, 302로 리다이렉트
[auth][error] JWTSessionError: Read more at https://errors.authjs.dev#jwtsessionerror
[auth][cause]: JWEInvalid: Invalid Compact JWE
    at compactDecrypt ...
    at jwtDecrypt ...
    at Module.session ...
GET /signin 200 ── /app 진입을 못 하고 다시 signin으로
```

확인된 사실:
- DB의 `User`, `Account`, `Session` 테이블에 row가 **정상 생성**됨 (재시도마다 Session 행이 늘어남)
- 즉, OAuth 콜백·DB 저장까지는 성공
- 그러나 후속 페이지 요청에서 매번 JWE 에러

## 시도한 가설

- **H1**: `signIn({ redirectTo: "/app" })` 인자가 무시되거나 잘못 전달
  - 검증: signin 페이지의 action 코드 점검, `redirectTo` 그대로 전달됨. 콜백 후 302의 Location 헤더는 정상이었음 → **거짓**
- **H2**: `AUTH_URL` / `AUTH_SECRET` 환경변수 누락
  - 검증: `.env` 점검, AUTH_SECRET은 `openssl rand -base64 32`로 정상 발급 → **거짓**
- **H3**: 라우트 그룹 `(app)/app/page.tsx`가 라우트 충돌 발생
  - 검증: `next build` 출력에 `/app`이 ƒ (dynamic)로 정상 등록 → **거짓**
- **H4** (확정): 미들웨어가 Edge runtime에서 **DB session 쿠키를 JWT로 디코딩**하려다 실패. 디코딩 실패 → 에러 캐치 후 "미인증"으로 분기 → `/signin` 리다이렉트 → 무한 루프

## 원인

Auth.js v5의 권장 미들웨어 패턴인
```ts
const { auth } = NextAuth(authConfig);
export default auth((req) => { ... });
```
은 **암묵적으로 JWT 세션 전략을 가정**한다. `authConfig`는 edge-safe라서 Prisma 어댑터를 포함할 수 없는데, DB session 쿠키 값은 단순 세션 토큰 ID(랜덤 문자열)이지 JWT(JWE)가 아니다. 그래서 미들웨어가 `Module.session`에서 `jwtDecrypt(cookie)`를 호출하면 `JWEInvalid`가 던져진다.

Auth.js v5 공식 문서가 미들웨어 예시를 JWT 세션 기준으로만 보여줘서 놓치기 쉬운 함정.

## 해결

미들웨어에서 `NextAuth(authConfig)` 호출을 제거하고 **세션 쿠키 존재 여부만** 검사. 실제 세션 검증은 서버 컴포넌트·Route Handler의 `await auth()` (full Node runtime, Prisma 어댑터 포함)에서 수행 — 즉 미들웨어는 1차 게이트, 서버는 2차 게이트.

`src/middleware.ts`:
```ts
const SESSION_COOKIE_NAMES = [
  "authjs.session-token",          // dev
  "__Secure-authjs.session-token", // prod
];

function hasSessionCookie(req: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => req.cookies.has(name));
}

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();
  if (!hasSessionCookie(req)) {
    return NextResponse.redirect(new URL("/signin", req.nextUrl));
  }
  return NextResponse.next();
}
```

수정 직후 동일한 OAuth 로그인 흐름에서 `/app` 진입 성공, 환영 메시지·이메일 표시 확인. DB 세션은 그대로 유지됨.

## 재발 방지

- **`docs/development.md` §"Auth.js v5"** 섹션에 미들웨어 패턴 명시 (DB session 사용 시 미들웨어는 쿠키 존재만 검사, 검증은 서버에서)
- **`docs/guardrails.md` 보안 카테고리**에 "보호 라우트는 미들웨어 쿠키 체크 + 서버 `auth()` 이중 가드" 항목 추가
- 향후 세션 전략을 JWT로 바꾸기로 결정할 일이 생기면 ADR로 별도 기록
