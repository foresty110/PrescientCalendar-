# LLM Tools Contract

Anthropic tool_use 정의의 단일 출처. 이 문서가 `src/lib/llm/tools.ts`의 Zod 스키마로 그대로 변환된다.

**규칙**:
- `userId`는 도구 인자에 노출하지 않는다 — LLM은 userId를 모르고, 서버가 세션에서 주입
- 모든 ID 입력(`scheduledRunId` 등)은 핸들러에서 `assertOwnership` 통과 후 사용
- 시각은 ISO-8601 (KST offset 권장: `2026-05-13T15:00:00+09:00`)

---

## create_event

사용자가 일정을 새로 만들 때.

**입력**:
```json
{
  "title": "string (required, 1..100자)",
  "startAt": "ISO-8601 datetime (required, 미래)",
  "durationMin": "integer 5..480 (required)",
  "recurrence": {
    "freq": "DAILY|WEEKLY|MONTHLY",
    "byDay": ["MO","TU","WE","TH","FR","SA","SU"]?,
    "until": "ISO-8601 date?"
  } | null
}
```

**출력** (union):

성공:
```json
{ "ok": true, "eventId": "string", "firstScheduledRunId": "string", "occurrencesPlanned": "integer" }
```

충돌 거부:
```json
{
  "ok": false,
  "reason": "conflict",
  "conflicts": [{ "scheduledRunId": "string", "title": "string", "startAt": "ISO" }],
  "suggestedAlternatives": [{ "startAt": "ISO", "label": "30분 뒤" }, ...],
  "originalInput": { /* 입력 그대로 — '그래도 만들기' 재호출에 사용 */ }
}
```

**주의**:
- 과거 시각은 거부 → assistant가 재질문
- 충돌이 있으면 일정은 생성되지 않고 `ok: false` 결과 반환. 클라이언트가 자동으로 대안 카드 UI 를 렌더하므로 assistant 는 응답 텍스트를 비우거나 매우 짧은 한 마디만 (카드와 중복 회피).
- **충돌 우회 옵션 없음.** force 같은 인자는 없다. 사용자가 "그래도 만들어줘" 라고 해도 다시 호출하지 말 것 — 항상 대안에서 선택해야 한다.

---

## list_events

`from`~`to` 범위의 ScheduledRun 조회. 캘린더 표시·예측 컨텍스트용.

**입력**:
```json
{
  "from": "ISO-8601 datetime",
  "to": "ISO-8601 datetime",
  "withActualRun": "boolean = false"
}
```

**출력**: `ScheduledRun[]` (각 항목에 event title, feasibilityScore?, actualRun? 포함)

---

## update_event

**입력**:
```json
{
  "eventId": "string",
  "patch": {
    "title"?: "string",
    "recurrence"?: { ... } | null,
    "defaultDurationMin"?: "integer"
  }
}
```

**주의**: 미래 ScheduledRun만 재생성. 과거 인스턴스는 보존.

---

## delete_event

**입력**: `{ "eventId": "string", "scope": "all" | "future_only" }`

**출력**: `{ "deletedScheduledRuns": "integer" }`

---

## record_actual_run

회고 단건 기록.

**입력**:
```json
{
  "scheduledRunId": "string",
  "actualStartAt": "ISO-8601 datetime",
  "actualDurationMin": "integer",
  "status": "done | skipped | late"
}
```

**출력**: `{ "actualRunId": "string" }`

**주의**:
- `scheduledRunId`는 `assertOwnership` 통과 필수 (IDOR 방어)
- 이미 ActualRun 있으면 갱신 (UPSERT)

---

## list_pending_retros

회고가 안 된 ScheduledRun 목록. 일괄 회고 시작용.

**입력**: `{ "from": "ISO-8601", "to": "ISO-8601" }`

**출력**: `Array<{ scheduledRunId, eventTitle, scheduledStartAt, scheduledDurationMin }>`

---

## query_user_pattern

회고 통계 조회 — 채팅에서 "이번 주 운동 실행률 어때?" 같은 질의에 대응.

**입력**:
```json
{
  "eventIdOrKeyword": "string",
  "since": "ISO-8601 date",
  "until": "ISO-8601 date?"
}
```

**출력**:
```json
{
  "totalScheduled": "integer",
  "executed": "integer",
  "skipped": "integer",
  "late": "integer",
  "avgDelayMin": "number",
  "executionRate": "number 0..1"
}
```

---

## compute_feasibility

새 ScheduledRun에 대해 0~100 실현 가능성 점수 산출. Feasibility 단계에서 LLM이 호출하거나, 사용자가 "이거 가능할까?" 물을 때 호출.

**입력**: `{ "scheduledRunId": "string" }`

**출력**:
```json
{
  "score": "integer 0..100 | null",
  "rationale": "string",
  "dataInsufficient": "boolean",
  "sampleSize": "integer ≥ 0"
}
```

`dataInsufficient=true`이면 score=null, UI는 회색 처리. 임계값: 같은 시간대 ±1h ActualRun 5건 미만 또는 가입 2주 이내. `sampleSize`는 클라이언트 카드 UI가 신뢰도 라벨(높음 ≥20 / 보통 ≥10 / 낮음 ≥5)로 매핑한다.
