# 미리보기 배포에 고정 별칭을 붙이기 위해 deployment_status 이벤트 방식을 채택

- 날짜: 2026-05-20
- 상태: 채택
- 관련 기능: FEATURES.md I.2 (Vercel + Neon 배포)

## 문제

PR 마다 브랜치가 새로 생기는 GitHub Flow 흐름에서, Vercel 의 미리보기 URL
(`...-git-<branch-slug>-...vercel.app`)도 매번 달라진다. 브랜치 안에서는 URL
이 고정되지만, 리뷰어·평가자에게 "이 한 주소로 가면 늘 최신 미리보기" 라고
줄 단일 주소가 없다. 고정 주소가 하나 있으면 포트폴리오 공유·자체 검증이
훨씬 매끄럽다.

## 검토한 옵션

1. **현행 유지** — PR 마다 다른 URL 을 매번 알림.
   - 장점: 설정 0.
   - 단점: 공유 가능한 고정 주소 없음. 평가자가 새 PR 마다 새 URL 을 찾아야 함.

2. **staging 브랜치 + Vercel 브랜치 도메인** — 장수 staging 브랜치를 두고
   Vercel 대시보드에서 그 브랜치에 고정 도메인 연결.
   - 장점: 토큰·CI 불필요, 대시보드 설정만.
   - 단점: 현재 GitHub Flow(feature 브랜치 → main) 와 별도로 staging 브랜치를
     상시 관리해야 함. "지금 staging 에 뭐가 올라가 있나" 별도 추적 부담.
     1인 포트폴리오 프로젝트엔 과한 운영.

3. **CI 에서 미리보기 배포에 별칭 자동 부여** — Vercel 의 자동 미리보기 배포는
   그대로 두고, 배포가 끝난 시점에 GitHub Actions 가 별칭 하나
   (`prescient-calendar-preview.vercel.app`) 를 그 배포로 옮긴다.
   - 장점: GitHub Flow 그대로. 평가자에게 단일 고정 주소 제공.
   - 단점: Vercel 토큰을 GitHub Secrets 로 관리해야 함.

## 결정

옵션 3 채택. 옵션 3 안에서도 "언제 어떻게 별칭을 옮기나" 가 또 다른 선택지였다:

| 트리거 | 동작 | 결정 이유 |
|---|---|---|
| 브랜치 push 시 폴링 | `vercel ls` 또는 REST API 로 배포 완료까지 sleep + 재시도 | 기각 — 타이밍 불안정, 실패 처리 복잡 |
| `deployment_status` 이벤트 | Vercel 이 GitHub 에 배포 완료를 보고하는 순간 워크플로 발화 | 채택 — 폴링·sleep 없음, 정확한 시점, 코드 간결 |
| 별도 vercel deploy in CI | CI 가 직접 `vercel deploy` 하고 alias | 기각 — 자동 배포와 중복, LLM·DB 환경 변수 동기화 부담 |

`deployment_status` 트리거는 Vercel 의 GitHub Deployments API 통합에 기대므로
별도 의존성 추가 없이 동작한다.

## 결과·후속

- 새 워크플로 `.github/workflows/vercel-preview-alias.yml` 추가.
- 사용자가 일회성으로 GitHub Secrets 3개 등록 (`VERCEL_TOKEN`, `VERCEL_ORG_ID`,
  `VERCEL_PROJECT_ID`).
- 등록 후 다음 미리보기 배포부터 `prescient-calendar-preview.vercel.app` 이
  항상 최신 PR 미리보기를 가리킨다.
- 한 번에 한 PR 만 그 별칭에 보임 — 동시 PR 여러 개를 비교해야 한다면 그때는
  기존 PR 별 URL 을 쓰면 된다.
- 별칭이 전역에서 이미 점유되어 있다면 첫 실행에서 명령이 실패한다. 그 경우
  대체 이름(예: `prescient-calendar-staging.vercel.app`)으로 워크플로 한 줄만
  수정해 후속 커밋.
