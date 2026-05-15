# 실현 가능성 점수 v2 — 가중 합 공식 + 5단계 신뢰도 + 영향 요인 + 대안 시나리오

- 결정일: 2026-05-15
- 상태: accepted
- 맥락: feasibility 카드 UX 개선 — "왜 N%인가요?" + "어떻게 올릴 수 있을까요?"

## 맥락

v1 공식은 베이스(같은 시간대 실행률) - 평균 지연 페널티 만으로 단순했다. 사용자에게 점수 하나와 짧은 rationale 만 노출돼 "이 점수가 어디서 왔는지 / 어떻게 올릴 수 있는지" 가 보이지 않았다.

## 결정

공식을 가중 합으로 확장하고, 결과 데이터에 신뢰도·영향 요인 breakdown·대안 시나리오를 함께 담아 LLM·UI 모두 풍부한 카드로 렌더한다.

### 공식 (v2)

```
score = clamp(0, 100, 50 + sumDeltas)

sumDeltas =
    (베이스 점수 − 50)              // 같은 시간대·요일 실행률 × 100, 최근성 가중
  − delayPenalty                    // min(15, 평균 지연 분)
  − densityPenalty                  // 그 날 다른 ScheduledRun 개수 × 1.5 (최대 15)
  − lengthPenalty                   // 90분 초과 부분 30분당 -2 (최대 10)
  + eventBonus                      // 같은 eventId 전체 실행률 (±5)
  + streakBonus                     // 직전 3건 연속 실행/스킵 (±5)
```

### 최근성 가중치

`weight = 1 − ageRatio × (1 − 0.4)` (선형). 가장 최근 표본의 weight=1.0, 8주 전 = 0.4.

### 신뢰도 (5단계, sampleSize 기준)

| 카테고리 | 표본 수 |
|---|---|
| 매우높음 | ≥ 30 |
| 높음 | ≥ 20 |
| 보통 | ≥ 10 |
| 낮음 | ≥ 5 |
| 없음 | < 5 (data insufficient → score=null) |

### 대안 시나리오

같은 공식을 ±60분, ±90분, 절반 길이 후보에 다시 적용해 점수가 올라가는 것만 골라 반환. 클라이언트가 "어떻게 올릴 수 있을까요?" 섹션으로 노출. 무한 루프 방지를 위해 대안 자체는 alternatives 를 빈 배열로 둠.

## 영향 파일

- `src/lib/db/feasibility.ts` — 새 공식·신뢰도·factors·alternatives. ~500 줄.
- `src/lib/llm/tools.ts` — `compute_feasibility` tool 출력에 confidence/factors/alternatives 추가.
- `src/components/FeasibilityCard.tsx` — Zod 스키마 확장, 5칸 신뢰도 그래프, 50% 이하 자동 펼침, "왜 N%인가요?" + "어떻게 올릴 수 있을까요?" 섹션.
- `docs/llm-tools.md` — 출력 명세 갱신.
- `tests/unit/feasibility.test.ts` — v2 결과 검증으로 재작성 (점수 정확값 대신 범위 + factors 존재성).

## 근거

- 사용자 명시 요청: "왜 n프로인가요?" 영향 요인 표시, 50% 이하 자동 펼침, 대안 제시.
- 영향 요인 후보(실행률·지연·표본수·근접 밀도·요일 패턴·이벤트 패턴·streak·recency·길이) 사용자 합의 후 6가지로 정리.
- 50% 이하 자동 펼침 — 점수가 낮을 때 사용자가 왜·어떻게 를 즉시 보게.

## 트레이드오프

- 공식이 단순했던 v1 대비 복잡 — 디버깅·테스트 부담 ↑. 가중치 튜닝 필요할 수 있음.
- 대안 시나리오는 같은 공식을 N번 재호출 → 메모리에서 필터링하지만 비용 ↑. 한 카드당 3 후보로 제한.
- recency 가중치는 단순 선형 — 향후 exponential decay 또는 ML 모델로 대체 가능.
- streak·event 보너스는 시간대 무관 신호라 같은 시간대 표본과 의미가 다소 겹칠 수 있음. 가중치를 작게(±5) 유지.

## 후속

- prompt cache 효율을 위해 같은 scheduledRunId 결과 캐싱 검토 (현재는 호출마다 계산).
- 신뢰도가 "없음" 일 때 LLM 이 "데이터 모으는 중" 안내를 사용자에게 더 친근하게 풀도록 prompt 보강.
