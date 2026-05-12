---
name: log-decision
description: 방금/오늘 한 설계 결정을 ADR로 정리해서 docs/decisions/ 에 저장 (사용자 승인 후)
---

대화 맥락을 보고 결정 후보를 식별한 뒤 다음 순서로 진행:

1. **결정 식별** — 다음 중 하나에 해당하면 ADR 대상:
   - 두 가지 이상 접근 중 하나를 선택
   - 새 의존성 도입 (라이브러리, 외부 서비스)
   - 데이터 모델 분기 (예: Event vs ScheduledRun 분리)
   - 명시적 트레이드오프 (성능 vs 단순함 등)

2. **초안 작성** — `docs/decisions/_template.md` 형식으로:
   - 파일명: `YYYY-MM-DD-<slug>.md` (예: `2026-05-13-auth-js-vs-clerk.md`)
   - 맥락 / 고려한 대안 / 결정 / 결과 채우기

3. **승인 요청 형식**:
   ```
   📝 로그 후보: decisions · docs/decisions/YYYY-MM-DD-<slug>.md
   <초안 전체>
   저장할까요? (1) 저장 (2) 수정해서 저장 (3) 건너뛰기
   ```

4. **저장 후**:
   - `docs/decisions/README.md`의 표에 한 줄 추가 (날짜·제목·상태)
   - 사용자에게 "저장 완료. 인덱스도 갱신했어요" 보고

후보가 없으면 "최근 대화에서 명확한 결정 후보를 찾지 못했어요. 어떤 결정을 기록하고 싶으신가요?" 라고 되묻는다.
