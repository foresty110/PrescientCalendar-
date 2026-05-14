# 배포 가이드 (Vercel + Neon + Google OAuth prod)

이 변경으로 데모 URL을 채용 담당·면접관에게 공유 가능해진다. 한 번만 거치면 이후 `main` 푸시마다 자동 재배포.

> **순서 원칙 — deploy first, register callback second.** Google OAuth redirect URI 는 Vercel prod URL 이 확정된 뒤 등록해야 한다. 미리 추정값을 넣으면 deployment hash URL 과 alias URL 의 차이 때문에 `400 redirect_uri_mismatch` 가 잘 발생함 (실제 사례: `docs/troubleshooting/2026-05-14-vercel-prod-oauth-redirect-uri-mismatch.md`).

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

## 2. Google OAuth 클라이언트 — ID/Secret 확보

prod 콜백 URL 은 Vercel 배포 이후에 등록한다 (5번 단계). 여기선 클라이언트 ID·secret 만 준비.

1. https://console.cloud.google.com/ → 기존 프로젝트 또는 새 프로젝트
2. **APIs & Services → Credentials → OAuth 2.0 Client IDs**
3. 기존 로컬용 클라이언트를 재사용해도 되고, 새 "Web application" 클라이언트 발급도 됨
4. **Client ID · Client secret 값을 메모** — 3번 단계의 Vercel env 입력에 사용

> Authorized redirect URIs 에 prod 콜백을 등록하는 건 **5번**. 지금 단계에서 추정 URL 을 넣으면 잘못된 도메인을 넣고 잊기 쉽다.

## 3. Vercel — 프로젝트 import + 환경 변수

1. https://vercel.com/new → "Import Git Repository" → 본 저장소 선택
2. **Framework Preset**: Next.js (자동 감지)
3. **Build Command**: 기본값 사용 — `package.json` 의 `vercel-build` 스크립트가 자동으로 감지됨
   (`prisma generate && prisma migrate deploy && next build`)
4. **Environment Variables** 추가:

   > ⚠️ **6개 키 × 3개 환경(Production·Preview·Development) = 18개 등록 필수.** 누락 시 첫 빌드부터 `Environment variable not found: DATABASE_URL` (Prisma P1012) 로 즉시 실패. Preview 환경 누락은 PR preview 빌드에서만 드러나 발견이 늦다 — 입력 직후 `vercel env ls` 또는 Vercel Dashboard → Settings → Environment Variables 에서 18개 모두 보이는지 확인.

   | 키 | 값 |
   |---|---|
   | `DATABASE_URL` | Neon connection string (1번에서 복사) |
   | `ANTHROPIC_API_KEY` | Anthropic 콘솔의 API key |
   | `AUTH_SECRET` | `openssl rand -base64 32` 결과 (로컬과 다른 값 권장) |
   | `AUTH_TRUST_HOST` | `true` |
   | `AUTH_GOOGLE_ID` | Google OAuth client ID (2번) |
   | `AUTH_GOOGLE_SECRET` | Google OAuth client secret |

   > **`AUTH_URL` 대신 `AUTH_TRUST_HOST=true`** — Vercel 의 preview 배포는 매번 다른 URL(`<branch>-<hash>.vercel.app`)이라 고정값이 안 맞음. trust host 모드로 요청 호스트를 자동 인식.

5. **Deploy** 클릭. 빌드 로그에서 `prisma migrate deploy` 가 마이그레이션을 Neon DB 에 적용하는지 확인.

## 4. prod URL 확정

1. 빌드 성공 후 Vercel Dashboard → Project → Domains 에서 **Production alias URL** 확인 (예: `https://prescient-calendar.vercel.app`)
2. 배포된 URL 접속 → 랜딩 페이지 표시 확인
3. `https://<prod>/api/docs` → Scalar API 명세 페이지 (공개, 로그인 불필요) — 동작하면 빌드는 정상

이 시점에서 로그인은 아직 안 됨 (콜백 미등록). 5번에서 해결.

## 5. Google Cloud Console — prod 콜백 등록

4번에서 확정한 prod URL 을 가지고 돌아온다.

1. https://console.cloud.google.com/ → APIs & Services → Credentials → 2번의 OAuth 클라이언트 클릭
2. **Authorized redirect URIs** 에 추가:
   ```
   https://<exact-prod-url>/api/auth/callback/google
   ```
   예: `https://prescient-calendar.vercel.app/api/auth/callback/google`
3. Save. (반영 5초~5분)

> Custom domain 을 나중에 추가하면 그 도메인의 callback 도 동일 절차로 추가 등록. preview 배포에서도 로그인 흐름을 테스트하고 싶다면 `https://prescient-calendar-*.vercel.app` 같은 wildcard 가 안 되므로, 자주 쓰는 preview URL 을 개별 등록하거나 prod URL 만 테스트하는 방식 선택.

## 6. 로그인 검증

1. `https://<prod>/signin` → "Google로 로그인" 클릭
2. Google 동의 화면 → 콜백 → `/app` 진입 성공
3. 새로고침 후에도 세션 유지 (DB session 쿠키)
4. 로그아웃 버튼 → `/signin` 리다이렉트

## 7. 문제 해결

### 빌드 실패 — `pnpm install` 단계, `ERR_PNPM_IGNORED_BUILDS`

- 증상: 로그 끝에 `[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @prisma/client, esbuild, sharp, ...` 후 `Command "pnpm install" exited with 1`
- 원인: pnpm 11이 `--frozen-lockfile` 모드에서 ignored build scripts를 error로 격상
- 해결: 본 저장소엔 이미 `vercel.json` 으로 install 커맨드 오버라이드 적용됨 (`pnpm install --frozen-lockfile --ignore-scripts`). 만약 fork·새 프로젝트라면 동일 파일 추가
- 자세히는 `docs/troubleshooting/2026-05-12-ci-pnpm-frozen-lockfile-ignored-builds.md`

### 빌드 실패 — `Environment variable not found: DATABASE_URL` (P1012)

- 원인: 3번의 env 입력이 누락되었거나, Production 만 채우고 Preview·Development 를 빠뜨림. main 빌드는 Production env 를 쓰므로 통과하지만 PR preview 빌드는 실패
- 확인: `vercel env ls` 출력에 18개(6×3) 모두 보이는지. Preview 만 빠졌다면 `vercel env ls preview` 가 비어있음
- 해결: 누락된 환경에 추가. CLI 의 `vercel env add` 가 Preview 에서 사일런트 스킵되는 케이스가 있으므로(자세히는 `docs/troubleshooting/2026-05-14-vercel-first-deploy-cli-quirks.md`) Dashboard UI 또는 REST API 직접 호출이 안전

### 로그인 시도 시 `400 redirect_uri_mismatch`

- 증상: Google 에러 페이지에 `요청 세부정보: redirect_uri=https://<...>/api/auth/callback/google`
- 원인: 5번 콜백 등록이 안 됐거나 등록한 URL 이 실제 prod alias 와 다름 (deployment hash URL 과 production alias 혼동)
- 해결: 에러 페이지가 보여주는 정확한 `redirect_uri` 를 그대로 복사해서 Authorized redirect URIs 에 추가. 자세히는 `docs/troubleshooting/2026-05-14-vercel-prod-oauth-redirect-uri-mismatch.md`

### 로그인 시도 시 `Configuration` 에러

- 원인: `AUTH_SECRET` 누락 또는 호스트 mismatch
- 확인: `AUTH_TRUST_HOST=true` 설정 + `AUTH_GOOGLE_ID/SECRET` 정확히 입력

## 8. 이후 워크플로

- `main` 브랜치 푸시 → Vercel 자동 prod 재배포 (마이그레이션 포함)
- 기능 브랜치 푸시 → preview 배포 자동 생성 (PR 코멘트로 링크). Preview env 가 누락되어 있으면 여기서 P1012 발현
- 환경 변수 추가 시 Vercel Dashboard 에서 직접 수정 후 재배포

## 9. 관련 파일

- `package.json` 의 `vercel-build` 스크립트 — Vercel 이 자동 감지·실행
- `vercel.json` — install 커맨드 오버라이드 (`pnpm install --frozen-lockfile --ignore-scripts`)
- `.env.example` — 필요한 env 키 목록
- `prisma/migrations/` — `migrate deploy` 가 적용할 마이그레이션
