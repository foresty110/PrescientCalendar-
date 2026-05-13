# 다음 주 예측 캘린더(Feature 5)를 MVP 범위에서 제외

- 날짜: 2026-05-13
- 상태: 채택
- 관련 기능: FEATURES.md (이전 §5, 본 결정으로 제거)

## 맥락

원래 plan의 5개 핵심 기능 중 마지막. 다음 주 예측은 다음을 요구한다:

- 사용자 회고 데이터 **4주 이상 누적** (cold start 회피)
- **결정론 단계** — recurrence 있는 Event는 다음 주 인스턴스 복사
- **LLM 단계** — 회고 패턴에서 새 제안 발굴 (`prompts/next-week.md`)
- **별도 뷰** — `/next-week` 페이지 + 수락·거절 UI + `Prediction` 도메인 모델

총 구현 비용이 다른 Feature 1개 수준. 포트폴리오 마감과 우선순위 재평가 결과 핵심 4개에 집중하기로 결정.

## 고려한 대안

- **A) 그대로 진행 — 5개 기능 전부**
  - 장점: 원래 plan대로 완성. 사용자 가치 최대
  - 단점: 일정 ~2일 추가. 회고 데이터 부족 상태로 출시 가능성 ↑. 완성도 낮은 채로 5번째 기능 노출 위험
- **B) MVP에서 제외, 코드·스키마 완전 삭제**
  - 장점: 코드베이스 깔끔. unused Prisma 모델 없음
  - 단점: 추후 부활 시 마이그레이션 부담 (`Prediction` 테이블 재생성, prompts/next-week.md 재작성). 결정 비가역성 ↑
- **C) MVP에서 제외, 코드·스키마 dormant 유지** *(채택)*
  - 장점: 문서만 정리 → 변경 최소. `Prediction` 모델·`prompts/next-week.md`는 schema에 남아 추후 부활 시 즉시 재활성 가능
  - 단점: 코드베이스에 unused 자산 존재 (PR 검토 시 약간의 노이즈)

## 결정

C 채택. 문서만 정리하고 코드·스키마는 dormant 유지.

## 결과

**좋은 점**:
- 일정 단축 ~2일
- 핵심 4개 기능(로그인 / 대화형 일정 / 회고 / 실현 가능성)의 완성도 ↑
- README·포트폴리오에서 "scope 의식적 결정" 흔적 — 트레이드오프 인지·기록한 ADR

**트레이드오프 / 향후 위험**:
- 사용자 가치 1개 누락 — 다음 주 예측을 기대한 잠재 사용자 X
- `Prediction` 테이블이 schema에 존재하지만 unused → 신규 개발자 onboarding 시 혼란 가능 (이 ADR 링크로 완화)
- `prompts/next-week.md` 파일도 dormant — 동일 이유로 혼란 가능

**재활성 절차** (추후 부활 시):
1. `FEATURES.md`에 §5 다시 추가
2. `docs/requirements.md`에서 "MVP 범위 외" 항목 제거 + §5 본문 복구
3. `docs/domain.md` Prediction 행에서 dormant 표기 제거
4. 새 API route `/api/next-week`, 새 컴포넌트 `NextWeekPanel`, 새 뷰 `/next-week` 구현
5. `compute_feasibility`와 비슷하게 결정론 + LLM 도구 추가
