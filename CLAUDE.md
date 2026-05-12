# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 가장 먼저 — 매 요청마다 지킬 규칙

1. **기능 추적**: 사용자 요청을 받으면 먼저 `FEATURES.md`에서 해당 항목을 찾아 "X.Y 항목 진행할게요"라고 명시한 뒤 시작한다. 항목이 없으면 만들지 말지 사용자에게 먼저 묻는다. 작업 완료 후 해당 줄을 `[ ]` → `[x]`로 갱신한다.

2. **가드레일 셀프체크**: 작업을 완료 보고하기 전 `docs/guardrails.md` 체크리스트를 셀프 점검하고, 적용 결과를 응답에 명시한다.

3. **자동 기록 (ADR / 트러블슈팅)**: 작업 중 (a) 두 가지 이상 접근 중 하나를 선택했거나 새 의존성을 도입했거나 (b) 30분 이상 디버깅한 이슈가 있으면, 템플릿으로 초안을 작성해 사용자에게 보여주고 승인 후에만 `docs/decisions/` 또는 `docs/troubleshooting/`에 저장한다. 형식:
   ```
   📝 로그 후보: <decisions|troubleshooting> · docs/.../YYYY-MM-DD-<slug>.md
   <초안>
   저장할까요? (1) 저장 (2) 수정해서 저장 (3) 건너뛰기
   ```

4. **Git 컨벤션**: 모든 커밋·푸시·PR은 `docs/git.md`의 규칙을 따른다. 핵심:
   - **main 직접 커밋 금지**. 작업 시작 전 `git branch --show-current`로 확인하고, main이면 먼저 `git pull --ff-only origin main` 후 `git checkout -b <type>/<slug>` (feat/fix/docs/chore/refactor/test/perf/build/ci)
   - 커밋 메시지는 **Conventional Commits**: `<type>(<scope>?): <subject>`. 본문에 Why 적기 (What은 diff에서 보임)
   - **PR 생성 전 자가 검증 필수**: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` 모두 통과 후에만 PR 생성
   - **PR 크기**: 추가+삭제 300줄 또는 파일 10개 초과면 분할 권유
   - **PR self-review**: 생성 후 GitHub UI에서 diff 한 번 읽기 (console.log·시크릿·디버그 잔재 점검). 발견 시 같은 브랜치에 후속 커밋
   - **시크릿 사고**: `.env` 등 실수 푸시 시 **즉시 키 회전·폐기**가 history 청소보다 우선
   - 푸시: 기능 브랜치는 자유롭게 push, **main으로의 직접 push는 사용자 명시 승인 후에만**
   - PR은 `gh pr create`로 생성, **머지는 사용자가** GitHub UI에서 (또는 명시 승인 시 `gh pr merge --squash --delete-branch`)
   - **PR 생성 후 보고 형식**: `docs/git.md §12`의 표준 포맷 (링크 + 변경 요약 3줄 + CI 상태 + 다음 단계)

## 프로젝트

**Prescient Calendar** — 자연어로 일정을 만들고, 회고하고, 다음 주를 예측하는 AI 캘린더.

기능 5개: 로그인 / 대화형 일정 / 대화형 회고 / 실현 가능성 / 다음 주 예측. 세부는 `FEATURES.md`.

## Stack
- Next.js 15 App Router, TypeScript strict, Tailwind
- Postgres + Prisma
- Auth.js v5 (Google OAuth, DB session)
- Anthropic Claude API (prompt caching, tool use)
- Vitest, Playwright

## 명령어
- `pnpm dev` — 개발 서버
- `pnpm build` / `pnpm start`
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm lint`
- `pnpm test` — Vitest 유닛
- `pnpm test:e2e` — Playwright
- `pnpm sanity` — LLM 동작 sanity check
- `pnpm db:migrate` / `pnpm db:seed`
- `pnpm openapi:gen` — Zod → openapi.json

## 디렉터리

```
src/app/                # App Router (page, route handlers)
src/lib/db/             # Prisma 함수 — route handler는 여기로만 접근
src/lib/llm/            # Anthropic SDK, tools, prompts/, agent
src/lib/time.ts         # KST↔UTC 변환 헬퍼
src/components/         # React 컴포넌트
prisma/schema.prisma    # DB 스키마 (도메인 + Auth.js)
docs/                   # 모든 문서 (아래 라우팅 표 참조)
scripts/                # sanity.ts, gen-openapi.ts
tests/e2e/              # Playwright
.claude/                # Claude Code 하네스
```

## 참고 문서 라우팅

| 작업 영역 | 먼저 읽을 문서 |
|---|---|
| 코드 작업 전반 (FE/BE/DB/LLM/테스트/시간대) | `docs/development.md` |
| API 컨벤션 (에러·페이지네이션·인증) | `docs/api.md` |
| 보안·성능·예외처리 셀프체크 | `docs/guardrails.md` |
| 도메인 모델·용어 | `docs/domain.md` |
| 요구사항 / 시나리오 | `docs/requirements.md`, `docs/scenarios.md` |
| LLM 도구 계약 | `docs/llm-tools.md` |
| 알려진 리스크 | `docs/risks.md` |
| Git 컨벤션 · 브랜치 · PR | `docs/git.md` |

## 권한 / 위험 작업

- DB 재설정·force-reset 류는 사용자 확인 후에만 (`.claude/settings.json`의 PreToolUse hook이 confirm 요구)
- `.env`·secret 커밋 금지
- 의존성 추가 시 ADR 후보로 등록
