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
- Claude가 자동 감지하면 초안을 보여주고 승인 요청. 직접 작성하려면 `/log-troubleshoot` 스킬 사용.
