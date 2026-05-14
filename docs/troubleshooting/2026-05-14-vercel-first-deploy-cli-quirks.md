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
- ~~Preview 환경 사일런트 스킵은 별도 후속 조사~~ → **명령줄 도구 대신 HTTP API 호출이 확실. `vercel env add ... preview` 는 신뢰하지 않는다** (아래 후속 섹션 참고)
- zsh `for ... \` 멀티라인 paste 가 일관되게 실패 — 가이드 문서엔 항상 `.sh` 파일 방식 제시

## 후속 — Preview 환경 변수 누락을 Vercel HTTP API 로 풀다 (2026-05-14)

### 무슨 일이 있었나

Vercel 의 배포는 사실 두 종류다.

- **production**: main 브랜치가 받는 정식 운영 배포. 우리 서비스 입장에선 `https://prescient-calendar.vercel.app` 이 여기에 해당
- **preview**: 그 외 모든 브랜치(특히 PR 로 올라온 브랜치)가 자동으로 받는 임시 배포. PR 마다 고유한 임시 URL 이 발급돼, 머지 전에 변경된 페이지를 실제로 클릭해 보고 리뷰할 수 있게 해준다 — Vercel 의 핵심 기능 중 하나

각 종류는 환경 변수도 별도 슬롯에 따로 저장한다. 즉 `DATABASE_URL` 같은 키를 한 번 등록하면 끝이 아니라 production 슬롯·preview 슬롯·로컬 개발(development) 슬롯 셋에 같은 키를 **각각** 넣어줘야 한다. 한 곳만 비어 있어도 그 종류의 배포는 빌드부터 실패한다.

위 #3 에서 첫 env 등록 시도는 production·development 두 슬롯만 채우고 preview 슬롯을 비운 채 끝났다. 그 시점엔 아직 PR 도 없고 모두 main 에 직접 작업하던 상황이라 운영 배포만 살아나면 됐고, preview 누락은 그때 빌드에 안 드러났기에 "PR 이 생기면 그때 처리할 일" 로 미뤄두었다.

그 "나중" 이 이번에 닥쳤다 — 트러블슈팅 로그를 묶은 PR(#15) 이 만들어지자 그 PR 의 preview 빌드가 다음과 같이 실패:

> `Environment variable not found: DATABASE_URL.`
> `[ELIFECYCLE] Command failed with exit code 1.`

main 빌드는 멀쩡한데 preview 빌드만 같은 이유로 줄줄이 실패하는 상태가 되어 더는 미룰 수 없게 됐다.

### 왜 풀기 까다로웠나

명령줄 도구 `vercel env add <키> preview` 가 값을 받고도 실제 등록은 하지 않은 채, 에러도 경고도 띄우지 않고 종료한다. `vercel env ls preview` 를 다시 찍어봐야 비어있는 게 보이는데, "한 번도 실패한 적이 없는 명령" 이라 의심하기 어렵다. 어떤 조건에서 이 동작이 나오는지(이미 같은 키가 다른 환경에 있을 때? 표준입력 파이프 방식 때문? CLI v53 의 회귀?) 결정적 재현은 못 잡았다.

가설을 더 추적할 수도 있었지만 "원인 규명" 보다 "preview 슬롯에 6개 키를 확실히 넣기" 가 더 급해서 우회 경로로 전환.

### 어떻게 풀었나

Vercel 은 명령줄 도구와 별개로 HTTP API(Dashboard 화면이 내부적으로 호출하는 그 API)를 같이 노출한다. 환경 변수 등록 경로가 문서화돼 있어 `curl` 한 번으로 한 건 등록이 된다:

- 주소: `POST https://api.vercel.com/v10/projects/<프로젝트명>/env`
- 인증: 발급받은 개인 토큰을 `Authorization: Bearer <토큰>` 헤더로
- 본문: `{ "key": ..., "value": ..., "type": "encrypted", "target": ["preview"] }` — `target` 배열이 "어느 슬롯에 넣을지" 를 명시

이 호출을 6개 키(`DATABASE_URL`, `ANTHROPIC_API_KEY`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`)에 반복하는 단발 스크립트를 `/tmp/setup-vercel-preview-env.sh` 로 만들고 사용자가 본인 터미널에서 실행. 등록 후 `vercel env ls preview` 가 6 줄을 보여주는지 눈으로 확인.

> 부수적으로 `AUTH_SECRET` 은 prod 와 다른 값으로 새로 발급했다. 미리보기 배포의 세션 쿠키가 prod 와 섞이지 않게 격리하려는 의도된 분리.

### 도중에 빠진 함정 — 옛 스크립트와 새 스크립트의 파일명이 너무 비슷

먼저 만들어 두었던 prod 용 `setup-vercel-env.sh` 가 `/tmp/` 에 그대로 남아 있었는데, 사용자가 새로 만든 preview 용 `setup-vercel-preview-env.sh` 와 헷갈려 옛 것을 다시 실행했다. 결과:

> `Error: A variable with the name DATABASE_URL already exists for the target production on branch undefined`

prod 슬롯엔 이미 6개가 다 들어가 있어 같은 키를 또 넣으려다 충돌. 메시지는 정확했지만 "어느 스크립트가 어느 환경을 건드리는지" 파일명만으로 한눈에 구분이 안 됐던 게 본질. 일회성 임시 파일 두 개가 비슷한 이름으로 동시에 살아있는 상황이 함정이었다.

### 검증

- `vercel env ls` 가 18 줄(6 키 × 3 환경)을 보여주는지 확인
- 같은 미리보기 빌드를 다시 트리거해 빌드 로그에 더 이상 `Environment variable not found` 가 안 뜨는지 확인 — 후속 PR(#16) 의 미리보기 빌드로 닫힘

### 본문 "재발 방지" 보강

저장소에 `.example` 자동화 스크립트를 둘 땐 환경 타겟을 파일명에 박는다 — 예: `setup-vercel-env-production.sh.example` / `setup-vercel-env-preview.sh.example`. 임시 파일도 같은 시점에 여러 개가 살아있을 땐 동일 명명 규칙. 별도 PR 로 처리.
