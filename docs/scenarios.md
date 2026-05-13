# Scenarios

요구사항을 강제로 구체화하기 위한 시나리오 모음. **실제 채팅 transcript + 기대되는 DB 상태**를 같이 적는다. 이 시나리오들이 그대로 `scripts/sanity.ts`의 검증 케이스로 변환된다.

---

## 시나리오 1: 단발 일정 생성 (happy path)

**컨텍스트**: 사용자 로그인 상태, 일정 없음. 현재 시각: 2026-05-12 14:00 KST.

**대화**:
> user: 내일 오후 3시에 1시간 운동
> assistant: 5월 13일(수) 15:00–16:00에 "운동" 일정 만들었어요.

**DB 기대 상태**:
- `Event` 1건 (title="운동", defaultDurationMin=60, recurrence=null)
- `ScheduledRun` 1건 (scheduledStartAt=2026-05-13T06:00:00Z, scheduledDurationMin=60)

**Edge case (1a)**: 같은 시간에 이미 일정이 있다.
> assistant: 5월 13일 15:00에 "팀 회의"가 이미 있어요. 그래도 운동 추가할까요?

---

## 시나리오 2: 반복 일정 생성

**대화**:
> user: 매주 화요일 9시에 회의 한 시간씩
> assistant: 매주 화요일 09:00–10:00 "회의" 만들었어요. 다음 4주치 일정 추가했어요.

**DB**:
- `Event` (recurrence={freq:"WEEKLY", byDay:["TU"]})
- `ScheduledRun` 4건 (가까운 4주 화요일)

---

## 시나리오 3: 대화형 단건 회고 (happy path)

**컨텍스트**: 오늘 07:00 KST에 "조깅 30분" ScheduledRun 존재, ActualRun 없음. 현재 08:00 KST.

**대화**:
> user: 아까 조깅 7시 15분에 시작해서 25분만 하고 들어왔어
> assistant: 오늘 7AM 조깅 회고를 다음과 같이 기록할게요 — 시작 07:15 (15분 지연), 25분 진행, 상태: 완료. 맞나요?
> user: 응
> assistant: 기록했어요. 이번 주 조깅은 3/4 실행이네요.

**DB**: ActualRun 1건 (scheduledRunId=오늘 7AM, actualStartAt=07:15 KST, durationMin=25, status=done)

**Edge case (3a)**: 사용자가 시간을 안 알려줌.
> user: 아까 조깅 했어
> assistant: 시작 시각이랑 소요 시간 알려주실 수 있어요?

---

## 시나리오 4: 대화형 일괄 회고

**컨텍스트**: 어제 ScheduledRun 3건, ActualRun 없음.

**대화**:
> user: 어제 회고 좀 같이 하자
> assistant: 어제 3건 있어요. 1) 오전 9시 회의 — 어땠어요?
> user: 그건 했어, 정시에 시작했고 1시간
> assistant: 기록 완료. 2) 오후 2시 집중 작업?
> user: 그건 스킵
> assistant: 기록 완료. 3) 저녁 7시 운동?
> user: 30분 늦게 시작했고 1시간 했어
> assistant: 기록 완료. 어제 3건 중 2건 실행, 1건 스킵이에요.

**DB**: ActualRun 3건 생성 (done/skipped/late)

---

## 시나리오 5: 실현 가능성 예측

**컨텍스트**: 사용자가 최근 3주간 매주 화요일 7AM 조깅 80% 실행, 평균 15분 지연.

**대화**:
> user: 다음 주 화요일 7시에도 조깅 잡아줘
> assistant: 잡았어요. 과거 패턴상 실현 가능성 75% — 평균 15분 지각하는 경향이 있어 참고하세요.

**DB**: 새 ScheduledRun (feasibilityScore=75)

**Edge case (5a)**: 데이터 부족 (가입 1주차).
> assistant: 잡았어요. 아직 데이터가 부족해서 실현 가능성은 회색 처리됩니다.

---

## 시나리오 7: 보안 — IDOR 방어

**컨텍스트**: 사용자 A 로그인, 사용자 B의 scheduledRun ID를 알아냄.

**대화**:
> user A가 record_actual_run 도구를 사용자 B의 scheduledRunId로 호출하려 시도

**기대 동작**: `assertOwnership(scheduledRun, currentUserId)`이 throw → 403. assistant는 "그 일정은 찾을 수 없어요"로 응답.
