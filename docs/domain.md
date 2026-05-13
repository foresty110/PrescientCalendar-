# Domain Model

## 엔터티

| 엔터티 | 의미 | 핵심 필드 |
|---|---|---|
| `User` | Google 계정으로 로그인한 사용자 | id, email, name, image, emailVerified, createdAt |
| `Event` | 사용자가 정의한 일정 템플릿 (반복 규칙 포함) | id, **userId**, title, recurrence?, defaultDurationMin |
| `ScheduledRun` | Event의 특정 시점 인스턴스 (예: 6/3 화요일 7AM 조깅) | id, **userId**, eventId, scheduledStartAt, scheduledDurationMin, feasibilityScore?, feasibilityModelVersion?, feasibilityComputedAt? |
| `ActualRun` | ScheduledRun의 실제 실행 기록 (1:1) | id, **userId**, scheduledRunId (UNIQUE), actualStartAt, actualDurationMin, status |
| `Prediction` *(MVP 제외 — schema dormant)* | 다음 주 예측 캘린더용 제안. Feature 5 부활 시 재활성 | id, **userId**, suggestedStartAt, basisEventId?, feasibility, status |

### Auth.js 표준 테이블 (Prisma 어댑터 요구)
- `Account` — OAuth 제공자별 토큰 (Google access/refresh, expires)
- `Session` — 세션 토큰, expires, userId FK (DB session 전략)
- `VerificationToken` — 매직링크용 (당장 미사용, 어댑터 요구라 빈 테이블 유지)

### 격리 원칙
**모든 도메인 row는 `userId` FK 보유.** 모든 쿼리는 세션 userId로 필터. `@@index([userId])` 필수. 다른 사용자의 ID 입력 시 `assertOwnership()` 헬퍼로 IDOR 방어 (`docs/guardrails.md` 강제).

## 왜 Event와 ScheduledRun을 분리하나

반복 일정(예: 매주 화 7AM 조깅)을 한 row로 표현하면 각 인스턴스에 회고를 붙일 수 없다. `Event`는 "템플릿/규칙", `ScheduledRun`은 "특정 시점의 인스턴스"로 나누면:
- 회고는 ScheduledRun에 1:1로 붙음 (`ActualRun.scheduledRunId UNIQUE`)
- 반복 규칙 수정 시 미래 인스턴스만 영향 (과거 회고는 보존)
- feasibility 점수도 ScheduledRun 단위로 산출 가능

## 상태 enum

```
ActualRun.status: done | skipped | late
Prediction.status: pending | accepted | rejected
```

## 용어 사전

- **회고 (Retrospective)** — 예정된 일정의 실제 실행 결과 기록 (시작 시각, 소요, 상태)
- **실현 가능성 (Feasibility)** — 새 일정이 사용자의 과거 패턴상 달성 가능한 정도 (0~100)
- **지연 (Late)** — 예정 시각보다 X분 이상 늦게 시작한 상태 (cutoff는 도구 인자로 받음, 기본 10분)
- **스킵 (Skipped)** — 일정을 아예 실행하지 않은 상태
- **데이터 부족 (Cold start)** — 같은 시간대 ±1h ActualRun 5건 미만 또는 가입 2주 이내. feasibility는 회색 처리
- **예측 (Prediction)** *(MVP 제외)* — 사용자 패턴에서 발굴된 "다음 주 이렇게 해보세요" 제안. Feature 5가 MVP 범위 외라 현재 미사용 (`docs/decisions/2026-05-13-exclude-next-week-prediction.md`)

## 시간대 정책

- DB는 **UTC** (모든 datetime 컬럼)
- 표시·입력은 **KST (Asia/Seoul)**
- 변환은 `src/lib/time.ts`의 헬퍼 (`date-fns-tz`)
- LLM tool 인자는 ISO-8601 (KST offset 포함 권장: `2026-05-13T15:00:00+09:00`)
