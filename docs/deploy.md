# 배포 가이드 (Vercel + Neon + Google OAuth prod)

이 변경으로 데모 URL을 채용 담당·면접관에게 공유 가능해진다. 한 번만 거치면 이후 `main` 푸시마다 자동 재배포.

## 0. 사전 준비물

- GitHub 계정 (저장소 owner)
- Google 계정 (Cloud Console + 본인 OAuth 테스트용)
- Vercel 계정 (GitHub 로그인 가능)
- Neon 계정 (GitHub 로그인 가능)
- 결제: 셋 다 무료 티어로 시작 가능

## 1. Neon — Postgres 데이터베이스 생성

1. https://neon.tech/ → "Sign up with GitHub"
2. "Create a project" → 이름·리전 선택 (Asia 리전 권장: `aws-ap-northeast-1` 등)
3. 프로젝트 생성 후 **Dashboard → Connection Details**:
   - "Connection string" 항목의 **Pooled connection** 복사
   - 형식: `postgresql://<user>:<password>@<host>/<db>?sslmode=require`
4. 이 값을 **`DATABASE_URL`** 로 사용

## 2. Google Cloud Console — OAuth 콜백 추가

기존 로컬용 OAuth 클라이언트를 그대로 쓰되 prod 콜백을 추가하면 됨 (별도 클라이언트 발급도 가능).

1. https://console.cloud.google.com/ → 기존 프로젝트 선택
2. **APIs & Services → Credentials → OAuth 2.0 Client IDs → 기존 클라이언트 클릭**
3. **Authorized redirect URIs** 에 추가:
   ```
   https://<your-app>.vercel.app/api/auth/callback/google
   ```
4. Save. (URL은 Vercel 배포 후 확정되므로 임시로 `https://prescient-calendar.vercel.app` 같은 추정 도메인으로 먼저 넣고 배포 후 정확한 URL로 교체)

## 3. Vercel — 프로젝트 import

1. https://vercel.com/new → "Import Git Repository" → 본 저장소 선택
2. **Framework Preset**: Next.js (자동 감지)
3. **Build Command**: 기본값 사용 — `package.json` 의 `vercel-build` 스크립트가 자동으로 감지됨
   (`prisma generate && prisma migrate deploy && next build`)
4. **Environment Variables** 추가 (모두 Production·Preview·Development 셋 다에):

   | 키 | 값 |
   |---|---|
   | `DATABASE_URL` | Neon connection string (1번에서 복사) |
   | `ANTHROPIC_API_KEY` | Anthropic 콘솔의 API key |
   | `AUTH_SECRET` | `openssl rand -base64 32` 결과 (로컬과 다른 값 권장) |
   | `AUTH_TRUST_HOST` | `true` |
   | `AUTH_GOOGLE_ID` | Google OAuth client ID (2번) |
   | `AUTH_GOOGLE_SECRET` | Google OAuth client secret |

   > **`AUTH_URL` 대신 `AUTH_TRUST_HOST=true`** — Vercel 의 preview 배포는 매번 다른 URL(`<branch>-<hash>.vercel.app`)이라 고정값이 안 맞음. trust host 모드로 요청 호스트를 자동 인식.

5. **Deploy** 클릭.

## 4. 첫 배포 후 확인

1. Vercel 빌드 로그에서 `prisma migrate deploy` 가 성공했는지 확인 (마이그레이션 파일이 Neon DB 에 적용됨)
2. 배포된 prod URL 접속 → 랜딩 페이지 표시
3. **prod URL 을 메모해두고** Google Cloud Console 의 redirect URI 가 정확히 매칭되는지 재확인 (2번에서 추정값으로 넣었다면 교체)
4. `https://<prod>/signin` → "Google로 로그인" → 콜백 → `/app` 진입 확인
5. `https://<prod>/api/docs` → Scalar API 명세 페이지 (공개, 로그인 불필요)

## 5. 문제 해결

### 빌드 실패 — `pnpm install` 단계, `ERR_PNPM_IGNORED_BUILDS`

- 증상: 로그 끝에 `[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @prisma/client, esbuild, sharp, ...` 후 `Command "pnpm install" exited with 1`
- 원인: pnpm 11이 `--frozen-lockfile` 모드에서 ignored build scripts를 error로 격상
- 해결: 본 저장소엔 이미 `vercel.json` 으로 install 커맨드 오버라이드 적용됨 (`pnpm install --frozen-lockfile --ignore-scripts`). 만약 fork·새 프로젝트라면 동일 파일 추가
- 자세히는 `docs/troubleshooting/2026-05-12-ci-pnpm-frozen-lockfile-ignored-builds.md`

### 빌드 실패 — `prisma migrate deploy` 단계

- 원인: `DATABASE_URL` 누락 또는 잘못된 connection string
- 확인: Vercel Project → Settings → Environment Variables 에서 `DATABASE_URL` 존재 + Neon URL이 `sslmode=require` 포함
- 재배포: Vercel Dashboard → Deployments → 재배포

### 로그인 시도 시 `Configuration` 에러

- 원인: `AUTH_SECRET` 누락 또는 호스트 mismatch
- 확인: `AUTH_TRUST_HOST=true` 설정 + `AUTH_GOOGLE_ID/SECRET` 정확히 입력

### 로그인 후 `OAuthCallback` 에러

- 원인: Google Cloud Console 의 redirect URI 가 실제 prod URL 과 다름
- 해결: `https://<exact-vercel-url>/api/auth/callback/google` 으로 교체

## 6. 이후 워크플로

- `main` 브랜치 푸시 → Vercel 자동 prod 재배포 (마이그레이션 포함)
- 기능 브랜치 푸시 → preview 배포 자동 생성 (PR 코멘트로 링크)
- 환경 변수 추가 시 Vercel Dashboard 에서 직접 수정 후 재배포

## 7. 관련 파일

- `package.json` 의 `vercel-build` 스크립트 — Vercel 이 자동 감지·실행
- `.env.example` — 필요한 env 키 목록
- `prisma/migrations/` — `migrate deploy` 가 적용할 마이그레이션
