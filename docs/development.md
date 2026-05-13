# Development Guide

FE/BE/DB/LLM/UI/시간대/테스트를 한 파일에 통합. 코드량이 신입 프로젝트 규모라 분산보다 통합이 가독성에 유리.

## 1. 디렉터리 컨벤션

```
src/
├── app/
│   ├── (app)/            # 인증된 라우트 그룹 (미들웨어 보호)
│   │   └── page.tsx      # 메인 (채팅 + 캘린더)
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── chat/route.ts     # POST, streaming
│   │   ├── events/route.ts   # GET (캘린더 폴링)
│   │   └── docs/route.ts     # Scalar UI (공개)
│   ├── signin/page.tsx
│   └── layout.tsx
├── auth.ts               # Auth.js 설정
├── middleware.ts         # 보호 라우트 가드
├── lib/
│   ├── db/
│   │   ├── client.ts     # Prisma 싱글톤
│   │   ├── auth.ts       # getCurrentUserId(), assertOwnership()
│   │   ├── events.ts
│   │   ├── runs.ts
│   │   └── patterns.ts   # 회고 통계 쿼리
│   ├── llm/
│   │   ├── client.ts     # Anthropic 클라이언트 (싱글톤)
│   │   ├── tools.ts      # Zod → Anthropic tool 변환
│   │   ├── agent.ts      # 멀티턴 tool_use 루프
│   │   └── prompts/{scheduler,retrospect,feasibility,next-week}.md
│   └── time.ts           # KST↔UTC 변환
└── components/
    ├── Chat.tsx
    ├── Calendar.tsx
    ├── RetrospectModal.tsx
    └── UserMenu.tsx
```

**원칙**: route handler는 `src/lib/db/*` 함수를 통해서만 DB에 접근 (Prisma 직접 import 금지). DB 함수는 항상 `userId`를 인자로 받는다.

## 2. Next.js App Router

- **서버 컴포넌트 우선**, `'use client'`는 인터랙션·hook 필요한 곳만
- Route Handler 패턴:
  ```typescript
  export async function POST(req: Request) {
    const userId = await getCurrentUserId();           // 1) 인증 확인
    const body = await req.json();
    const input = createEventSchema.safeParse(body);    // 2) Zod 검증
    if (!input.success) return error("VALIDATION_ERROR", input.error);
    try {
      const result = await events.create(userId, input.data);  // 3) db 함수
      return Response.json(result);
    } catch (e) {
      return mapError(e);                              // 4) 사용자 노출 vs 내부 로그 분리
    }
  }
  ```
- 에러 envelope: `{ error: { code, message, details? } }` (`docs/api.md`)

## 3. Prisma

- **클라이언트 싱글톤** (`src/lib/db/client.ts`) — Next.js 핫 리로드 시 인스턴스 폭증 방지
  ```typescript
  const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
  export const prisma = globalForPrisma.prisma ?? new PrismaClient();
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
  ```
- 마이그레이션: `pnpm db:migrate` (`prisma migrate dev`). 스키마 변경 후 반드시 실행
- 모든 도메인 쿼리에 `where: { userId, ... }`. `assertOwnership(table, id, userId)`로 IDOR 방어
- N+1 방지: `include` / `select` 명시적으로

## 4. Anthropic SDK

- 모델: `claude-opus-4-7` (복잡한 추론) 또는 `claude-sonnet-4-6` (속도 우선)
- **프롬프트 캐싱 필수**:
  ```typescript
  await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    tools: [...tools.map(t => ({ ...t, cache_control: { type: "ephemeral" } }))],
    messages,
  });
  ```
- Tool 정의 패턴: Zod 스키마 → `zod-to-json-schema` → Anthropic tool format
- 에이전트 루프: tool_use → tool_result → messages.create 반복 (max 10턴 등 안전장치)
- **userId는 LLM에 노출 안 함** — 서버가 핸들러 인자로 주입

## 5. UI (Tailwind, 데스크탑 우선)

- **MVP 타겟**: 데스크탑 웹 (1024px+). 모바일 반응형은 보류 (`docs/decisions/2026-05-13-defer-mobile-responsive.md`)
- Tailwind 반응형 클래스(`sm:`/`md:`/`lg:`)는 dormant로 두되 새로 작성하는 컴포넌트는 데스크탑 레이아웃 우선으로 설계
- 캘린더: `react-big-calendar` 월간 뷰
- 채팅 사이드바: 데스크탑 좌측 분할 고정
- 폼: HTML `<form>` + Server Action 우선, 복잡하면 react-hook-form
- 다크모드: Tailwind `dark:` (system 설정 따름)
- 접근성: 인터랙티브 요소는 `aria-label`, 키보드 탭 순서, 포커스 표시

## 5b. Auth.js v5 (Google OAuth, DB session) — 미들웨어 패턴

**중요**: DB session 전략에서는 미들웨어가 세션을 직접 검증할 수 없다 (Edge runtime은 Prisma 어댑터 사용 불가). 따라서:

- **`src/middleware.ts`** — 세션 쿠키(`authjs.session-token` 또는 `__Secure-authjs.session-token`)의 **존재 여부만** 검사하고 미인증 시 `/signin`으로 리다이렉트. `NextAuth(authConfig)` 호출 금지 (JWT 디코딩 실패로 무한 루프 발생).
- **서버 컴포넌트 / Route Handler** — `await auth()` 또는 `await getCurrentUserId()`로 **실제 세션 검증** (full Node runtime, Prisma 어댑터 포함).

이 이중 가드 패턴은 `docs/guardrails.md` 보안 체크리스트로도 강제. 사례는 `docs/troubleshooting/2026-05-12-edge-middleware-db-session-jwe-error.md` 참조.

## 6. 시간대

- DB: **UTC** (Prisma `DateTime` 기본 UTC 저장)
- 표시·입력: **KST (Asia/Seoul)**
- `src/lib/time.ts` 헬퍼만 사용 (직접 `new Date()` 금지):
  ```typescript
  toKstDisplay(date: Date): string         // "2026-05-13 15:00 KST"
  fromKstInput(input: string): Date        // "2026-05-13T15:00" → UTC Date
  startOfKstDay(date: Date): Date          // KST 자정 기준
  ```
- LLM tool 인자: ISO-8601 + KST offset 권장 (`2026-05-13T15:00:00+09:00`)

## 7. 테스트

- **Vitest 유닛** — 비즈니스 로직 (시간대 변환, feasibility 계산, recurrence 펼치기 등). UI는 거의 안 함
- **Playwright e2e** — `tests/e2e/main-flow.spec.ts` 한 줄기만 (로그인→일정 생성→캘린더). 데스크탑 뷰포트 (모바일 보류)
- **Sanity check** — `scripts/sanity.ts`로 LLM 동작 시나리오 3~5개 직접 호출. `pnpm sanity`. JSON 케이스·CI 통합 X
- 테스트 DB: 별도 `DATABASE_URL` (CI 환경변수). 로컬은 도커 컴포즈 Postgres 그대로

## 8. Lint·Typecheck

- TS strict + `noUncheckedIndexedAccess`
- ESLint: `eslint-plugin-security`, `@typescript-eslint/no-floating-promises`, `no-misused-promises`, `no-explicit-any`
- Stop hook이 매 세션 끝에 `pnpm typecheck && pnpm lint` 자동 실행
