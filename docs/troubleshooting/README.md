# Troubleshooting Log

마주친 비자명한 문제와 해결 과정. 신입 포트폴리오에서 "어떻게 디버깅하는 사람인가"를 보여주는 핵심 자료.

| 날짜 | 이슈 | 영역 |
|---|---|---|
| 2026-05-12 | [Edge 미들웨어가 DB 세션 쿠키를 JWT로 디코딩하려다 무한 루프](2026-05-12-edge-middleware-db-session-jwe-error.md) | Auth.js v5 + middleware |
| 2026-05-12 | [CI 실패 3연속 — pnpm 11 + Node 22 환경 정합성](2026-05-12-ci-pnpm-frozen-lockfile-ignored-builds.md) | GitHub Actions / pnpm |
| 2026-05-14 | [Vercel 첫 배포 자동화 — 함정 3가지 (env 누락·preview 사일런트 스킵·zsh paste)](2026-05-14-vercel-first-deploy-cli-quirks.md) | Vercel CLI / 배포 셋업 |
| 2026-05-14 | [Vercel prod 첫 로그인 — Google redirect_uri_mismatch (deploy → callback 등록 순서 문제)](2026-05-14-vercel-prod-oauth-redirect-uri-mismatch.md) | Google OAuth / 배포 onboarding |

## 작성법

- 파일명: `YYYY-MM-DD-slug.md` (예: `2026-05-20-prisma-migrate-on-vercel.md`)
- 템플릿: [`_template.md`](_template.md)
- 30분 이상 걸린 디버깅이나 표면 증상과 실제 원인이 다른 케이스를 우선 기록
- Claude 가 자동 감지하면 초안을 보여주고 승인 요청. 직접 작성하려면 `/log-troubleshoot` 스킬 사용

### 처음 보는 사람도 읽히게 — 맥락이 반드시 들어간다

이 디렉터리의 문서는 **"내가 디버깅하다 뭘 했나" 가 아니라 "이 시스템에서 무슨 일이 있었고 그게 왜 풀기 까다로웠나"** 가 중심이다. 6개월 뒤 자신·신규 동료·면접관 중 한 명이 처음 펼쳐도 흐름이 잡혀야 한다.

- **첫 섹션("무슨 일이 있었나")엔 배경부터 적는다.** 평소 정상 동작이 무엇인지 → 이번엔 그게 어떻게 어긋났는지 → 실제 본 에러/화면. 도메인 용어(예: "Vercel 의 preview 배포", "Auth.js DB session", "Prisma migrate deploy")가 등장하면 한 줄로 풀어 적거나 괄호 부연
- **약어·고유명사 단독 사용 금지.** `P1012`, `IDOR`, `JWE`, `alias URL`, `silent skip` 같은 어휘는 처음 등장 시 풀어 설명. 코드 식별자(`update_event` 같은)도 자연어로 풀거나(`채팅 일정 수정 도구`) 괄호 부연
- **표면 증상과 실제 원인이 다른 경우엔 "왜 풀기 까다로웠나" 섹션을 따로** 둬서 단서가 어떻게 갈렸는지 보여준다. "원인 → 해결" 만으론 어디서 헷갈렸는지 안 남는다
- **가설 단계는 결과까지.** "H1: ... → 거짓 (근거)" 처럼. 기각된 가설도 후속 디버거에게 단서가 됨
- **자가 점검**: 작성 후 본문에서 약어·내부 용어를 하나하나 짚어보고 "이 단어를 처음 보는 사람에게 한 문장으로 설명할 수 있나?" 자문. 못 하면 풀어 적기

좋은 예: `2026-05-14-vercel-first-deploy-cli-quirks.md` 의 "후속 — Preview 환경 변수 누락…" 섹션 — Vercel preview 환경이 무엇인지부터 풀고, 왜 그때 채우지 않고 미뤘는지, 왜 명령줄 도구가 못 쓰겠는지까지 단계로 설명.
