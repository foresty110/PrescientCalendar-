# 일정 충돌은 거부 + 대안 카드 UI 로 빠르게 재선택

- 결정일: 2026-05-15
- 상태: accepted
- 맥락: 대화형 일정 잡기 — `create_event` 충돌 처리 동작

## 맥락

기존 `createEvent` 는 같은 시간대에 다른 일정이 있어도 **일정을 무조건 생성**하고 `conflictWarning` 만 함께 반환하는 동작이었다. 시스템 프롬프트(`scheduler.md §4`)는 "충돌 시 사용자 확인 후 진행" 이라고 모호하게 표현돼, LLM 이 어느 turn 에서 어떻게 처리할지 일관되지 않았다.

실제 사고: 사용자가 회고 흐름을 끝낸 직후 LLM 이 이전 turn 의 `conflictWarning` 을 그제서야 사용자에게 들먹이는 비논리 동작이 발견됨 (회고와 무관한 자리에서 "드라마보기 충돌"이 뒤늦게 surface).

## 선택지

1. **시스템 프롬프트만 명확화** — "충돌 있어도 이미 만들어졌으니 알리기만, 두 번째 호출 X" 룰로 정정.
   - 장점: 코드 무변경. 10분.
   - 단점: 일정은 충돌 상태로 이미 만들어진 채. "충돌이라 못 만들었으니 다른 시각 골라주세요" 라는 자연스러운 UX 가 안 됨.

2. **도메인 동작 변경 — 충돌 시 거부 + 대안 제시**
   - `createEvent` 가 충돌 시 일정 생성 안 함, `ok: false, suggestedAlternatives` 결과 반환.
   - 클라이언트가 인라인 충돌 카드 + 대안 버튼 UI 자동 렌더.
   - 사용자가 명시적으로 "그래도 만들어줘" 요청 시 `force: true` 로 재호출.
   - 장점: UX 가 자연스럽고 명확. 사용자가 충돌을 의식하면서 빠르게 다른 시각으로 점프.
   - 단점: 시그니처·도구·프롬프트·UI 모두 영향. 300+ 줄.

## 결정

**선택지 2 (도메인 동작 변경)**.

`createEvent` 의 결과를 union 으로 분기: `{ ok: true, ... }` 또는 `{ ok: false, reason: "conflict", conflicts, suggestedAlternatives, originalInput }`. force 인자 추가. `suggestAlternatives()` 헬퍼가 ±30분/±1시간/±2시간/내일 같은 시각 후보 중 충돌 안 나는 4개를 반환.

클라이언트는 `extractConflictCards()` 로 도구 결과를 Zod 검증 후 `ConflictAlternativesCard` 인라인 카드 렌더. 대안 버튼 클릭 → 자연어 메시지 자동 전송 → LLM 이 새 시각으로 `create_event` 재호출. '그래도 만들기' 버튼 → `force: true` 로 강제 생성.

## 근거

- 사용자 직접 피드백: "충돌 시 만들지 않는다. 실패 원인 알리고 대안 UI 버튼으로 빠르게 선택" — 옵션 2 와 정확히 일치.
- 이전 사고(회고 흐름에서 충돌이 늦게 surface) 의 근본 원인은 "이미 만들어진 일정에 대한 사후 warning" 이 LLM 한테는 처리 시점이 모호한 신호였다는 것. 동작 자체를 명확히 만들면 모호성이 사라진다.
- 5.3-e (FeasibilityCard 인라인 카드) 와 동일한 패턴 — 도구 결과를 Zod 통과시켜 UI 카드로 렌더. 일관.

## 트레이드오프

- `create_event` 도구 결과 형태가 union 으로 바뀜 — LLM 프롬프트와 클라이언트가 동시에 대응해야. scheduler.md / Chat.tsx / ConflictAlternativesCard.tsx 까지 한 PR 안에 묶음.
- 대안 버튼 클릭 시 LLM 한 turn 이 추가됨 (자연어 메시지 → create_event 재호출). 직접 API 호출이 더 빠를 수 있지만 LLM 의 도구 호출 패턴을 그대로 활용하는 게 코드 응집도가 높음.
- `update_event` 는 같은 패턴 미적용 — 다음 PR 로 미룸 (작업 범위 제한).

## 후속

- `update_event` 의 충돌 처리에도 같은 패턴 적용 검토.
- 사용자가 '그래도 만들기' 자주 누르면 carousel 형태로 옵션을 늘리거나 직접 입력 옵션 추가 검토.
