# Prescient Calendar

자연어로 일정을 만들고, 회고하고, "이거 실제로 할 수 있을까?" 를 과거 패턴으로 답하는 AI 캘린더.

[![CI](https://github.com/foresty110/PrescientCalendar-/actions/workflows/ci.yml/badge.svg)](https://github.com/foresty110/PrescientCalendar-/actions/workflows/ci.yml) [![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)](https://nextjs.org/) [![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/) [![Anthropic](https://img.shields.io/badge/Anthropic-Claude-D4A27F)](https://www.anthropic.com/)

**라이브 데모**: <https://prescient-calendar.vercel.app> (Google 계정으로 로그인)

![데모 — 자연어로 일정 생성·회고·실현 가능성 확인까지](assets/demo.gif)

> 데모 GIF·스크린샷 캡처 가이드는 [`assets/README.md`](assets/README.md). 캡처 후 같은 경로에 넣으면 자동으로 표시됨.

---

## 무엇을 하는 서비스인가

기존 캘린더 앱이 "잡힌 일정을 보여주는 표" 라면, 이 서비스는 그 위에 **세 가지 대화 기반 레이어**를 얹는다.

1. **잡기** — "내일 3시에 운동 1시간", "매주 화 9시 회의" 처럼 한 줄로 말하면 시각·길이·반복 규칙까지 해석해 캘린더에 자동으로 들어간다
2. **회고** — 지나간 일정을 채팅으로 짧게 돌아본다. "어제 운동 갔어, 25분 했어" → 완료/스킵/지연 상태와 실제 소요가 기록됨
3. **실현 가능성** — 새 일정 옆에 색 점이 뜬다. 초록=잘 지키던 시간대, 노랑=애매, 빨강=평소 못 지키던 패턴. 과거 회고 기록을 합산한 점수 (0~100) 가 근거

데모 시나리오 한 호흡: "내일 3시에 30분 책 읽기" 입력 → 캘린더에 chip 등장, 옆에 회색 점 (데이터 부족) → 이틀 뒤 "어제 책 읽었어" 회고 → 점차 점수가 색을 갖기 시작.

---

## 핵심 기능 (4가지)

### 1. Google 로그인

Auth.js v5(Next.js 진영의 표준 인증 라이브러리) + Google OAuth + DB 세션. 미인증 시 보호 라우트는 미들웨어와 페이지 양쪽에서 두 번 차단된다 (이중 가드).

![로그인 화면](assets/signin.png)

### 2. 대화형 일정 잡기

채팅 한 줄이 들어오면 Anthropic 의 Claude 모델이 "이건 일정 생성 의도다" 를 인식하고, 도구 호출(tool use — LLM 이 정해진 함수를 직접 부르는 방식)로 시각·반복·길이를 추출해 DB 에 저장. 반복 규칙(매주/매일/매월)은 4주 앞까지 자동으로 펼친다.

![일정 생성 대화](assets/chat-create-event.png)

### 3. 대화형 회고

지나간 일정을 LLM 이 한 번에 몰아 보여주고, 자연어 응답("운동만 다 했고 책 읽기는 못 했어")을 상태(완료/스킵/지연)·시간 정보로 풀어 일괄 기록한다. 확정 전 사용자에게 한 번 확인을 받는 규칙은 시스템 프롬프트로 강제.

![회고 대화](assets/chat-retrospect.png)

### 4. 실현 가능성 예측

새 일정을 만들 때 자동으로 점수가 계산돼 캘린더에 색 점으로 표시. 시간대·요일·키워드 기준으로 과거 실행률을 가중 평균. 표본이 5건 미만이거나 가입 14일 미만이면 회색 처리 (성급한 추정 회피).

![실현 가능성 점수](assets/feasibility.png)

자세한 기능 명세는 [`FEATURES.md`](FEATURES.md).

---

## 기술 스택

| 영역 | 선택 |
|---|---|
| 프레임워크 | Next.js 16 (App Router), React 19, TypeScript strict |
| 스타일 | Tailwind CSS 4 |
| DB | Postgres + Prisma 5 |
| 인증 | Auth.js v5 (Google OAuth, DB session) |
| LLM | Anthropic Claude API (tool use, prompt caching) |
| 테스트 | Vitest (단위), Playwright (e2e) |
| 배포 | Vercel + Neon (Serverless Postgres) |
| API 문서 | OpenAPI 3.1 자동 생성 + Scalar 뷰어 (`/api/docs`, 공개) |

---

## 아키텍처 한눈에

```
사용자 채팅
  ↓
src/app/api/chat/route.ts        (Next.js 라우트 핸들러)
  ↓
src/lib/llm/agent.ts             (Claude 호출 + 도구 실행 루프)
  ↓ tool_use
src/lib/llm/tools/*.ts           (create_event / record_actual_run / ...)
  ↓
src/lib/db/*.ts                  (Prisma 함수 — 라우트는 여기로만 접근)
  ↓
Postgres
```

도메인 모델은 **`Event` (반복 규칙 포함한 일정 템플릿)** 과 **`ScheduledRun` (특정 시점 인스턴스)** 의 분리가 핵심. 인스턴스 단위로 회고와 실현 가능성 점수가 1:1 매핑된다. 자세히는 [`docs/domain.md`](docs/domain.md).

모든 도메인 row 는 `userId` 외래키를 갖고, 모든 쿼리는 세션 userId 로 필터. 다른 사용자의 ID 가 입력될 수 있는 도구는 `assertOwnership()` 헬퍼로 한 번 더 차단 (IDOR — 다른 사용자 자원을 ID 만 바꿔서 접근하는 부류의 공격 — 방어).

---

## 의사 결정 & 트러블슈팅

설계 의사 결정과 디버깅 과정을 따로 기록한다. 포트폴리오 관점에선 "왜 그렇게 만들었나" 와 "어디서 막혔고 어떻게 풀었나" 가 코드 자체만큼 신호가 된다고 보기 때문.

- **[`docs/decisions/`](docs/decisions/README.md)** — Architecture Decision Records. 두 가지 이상 접근을 비교하고 트레이드오프를 명시한 결정
- **[`docs/troubleshooting/`](docs/troubleshooting/README.md)** — 30분 이상 걸린 디버깅, 또는 표면 증상과 실제 원인이 다른 케이스 (예: 로컬 통과 ≠ CI 실패)

---

## 로컬 실행

사전 준비: Node.js 22.13+, pnpm 11, Docker (Postgres 컨테이너용).

```bash
pnpm install --ignore-scripts        # pnpm 11 의 strict 정책 우회 (docs/decisions/2026-05-14-pnpm-frozen-lockfile-ignore-scripts.md 참고)
pnpm prisma generate                 # 클라이언트 코드 생성
docker compose up -d                 # Postgres 컨테이너
cp .env.example .env                 # 환경 변수 채우기 (DATABASE_URL, ANTHROPIC_API_KEY, AUTH_GOOGLE_ID/SECRET 등)
pnpm db:migrate                      # 스키마 적용
pnpm dev                             # http://localhost:3000
```

자주 쓰는 명령:

```bash
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm test         # vitest 단위 테스트
pnpm test:e2e     # playwright e2e (인증 주입 방식)
pnpm sanity       # LLM 도구 호출 sanity check (Anthropic API 비용 발생)
pnpm openapi:gen  # Zod 스키마에서 openapi.json 재생성
```

---

## 배포

Vercel + Neon (Serverless Postgres) + Google OAuth prod 콜백.

`main` 브랜치 푸시 시 자동으로 prod 배포, 그 외 브랜치는 PR 마다 임시 URL 의 preview 배포가 자동 생성된다. 환경 변수는 Production · Preview · Development 세 슬롯에 같은 키를 각각 등록해야 한다 (한 곳만 비어도 그 환경의 빌드가 실패).

전체 절차: [`docs/deploy.md`](docs/deploy.md). "deploy first → callback 등록 second" 순서로 정렬해 첫 OAuth 로그인까지 한 번에 통과하도록 다듬어 둠.

---

## 라이선스

본 저장소는 포트폴리오 목적으로 공개. 별도 라이선스 명시 전까지 코드 재사용 시 저자에게 문의 바랍니다.
