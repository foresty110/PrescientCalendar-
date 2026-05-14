# Vercel 첫 배포 자동화 — 함정 3가지 (env 누락·preview 사일런트 스킵·zsh paste)

- 날짜: 2026-05-14
- 영향 범위: Vercel 배포 셋업, Vercel CLI v53
- 관련 기능: FEATURES.md I.2 (Vercel + Neon 배포)

## 증상

PR #13 머지 후 첫 Vercel 빌드부터 prod URL 살리기까지 3가지 다른 실패를 차례로 만남.

1. (이전 트러블슈팅 후속) `pnpm install` 단계에서 `ERR_PNPM_IGNORED_BUILDS` → 별도 PR #14 (`vercel.json`)로 해결. 이 문서엔 요약만, 자세히는 `2026-05-12-ci-pnpm-frozen-lockfile-ignored-builds.md`
2. `pnpm run vercel-build` 단계에서 `Prisma schema validation` → `Environment variable not found: DATABASE_URL`. **표면**: 빌드 실패. **원인**: Vercel 프로젝트 환경 변수 미설정 (Neon URL·OAuth secrets 등 6개 모두)
3. CLI로 env 일괄 입력 시 **18개(6×3)** 가 등록되어야 하는데 `vercel env ls` 결과에 **12개(6×2)** — Preview 환경만 사일런트 스킵

## 시도한 가설

- **H1 (#2)**: `prisma generate`가 schema 파싱 시점에 env 조회. DATABASE_URL이 비어 있어 P1012 — **확정**. 해결: Vercel Dashboard 또는 CLI로 env 입력
- **H2 (#3)**: `set -e` 가 있어 silent skip은 아닐 것 — pipe된 stdin 때문에 pipefail 미설정, 중간 실패가 묻혔을 가능성. 또는 `vercel env add NAME preview` 가 git-branch 인자 없을 때 다른 동작. **현재까지 가설 단계, 후속 조사 필요**
- (보너스) 자동 시도: 분류기가 `vercel projects ls` 와 18개 env 일괄 set 을 차단. 대응: 사용자가 직접 토큰 발급·`/tmp/setup-vercel-env.sh` 로컬 실행

## 원인

### #2 — env vars 미설정
1차 배포 시점에 Neon DB 발급·Vercel env 입력이 사전 단계로 누락. `docs/deploy.md` 에 안내는 있었지만 실제 onboarding 시 명시적 alert 없었음.

### #3 — Preview 환경 사일런트 스킵 (가설)
`vercel env add NAME preview` 가 stdin pipe 와 함께 호출됐을 때 어떤 조건에서 confirm 프롬프트가 발생해 stdin이 이미 value로 채워졌으면 무시될 수 있다고 추정. 또는 CLI v53 에서 preview 환경은 git-branch 인자를 기본 필요로 함. 결정적 확인 못 함.

## 해결

### #2
사용자 본인 터미널에서 `bash /tmp/setup-vercel-env.sh` 실행 → Production·Development 등록 완료 (Preview는 #3로 별도 이슈).

### #3 (임시)
Production 만 있어도 main 빌드 정상 동작 — 우선 prod 안정화 후 Preview 별도 fix 예정.

## 재발 방지

- `docs/deploy.md` 3.4 단계 위에 **"Neon 발급·env 입력이 사전 완료 안 되면 첫 빌드는 반드시 P1012 에러"** 굵은 경고 추가
- Vercel CLI 자동화 스크립트(`scripts/setup-vercel-env.sh.example`)를 저장소에 .example 형태로 두기 — 첫 셋업 시 복사·값 채워서 실행
- Preview 환경 사일런트 스킵은 별도 후속 조사 (`vercel env add NAME preview --git-branch=...` 시도, CLI 디버그 모드 출력 검사)
- zsh `for ... \` 멀티라인 paste 가 일관되게 실패 — 가이드 문서엔 항상 `.sh` 파일 방식 제시
