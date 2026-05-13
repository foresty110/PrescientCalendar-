# Architecture Decision Records

설계 결정을 짧고 명확하게 남기는 곳. 새 ADR 추가 시 아래 표에 한 줄씩 직접 추가 (자동화 없음).

| 날짜 | 결정 | 상태 |
|---|---|---|
| 2026-05-13 | [다음 주 예측 캘린더(Feature 5)를 MVP 범위에서 제외](2026-05-13-exclude-next-week-prediction.md) | 채택 |
| 2026-05-13 | [모바일 반응형을 보류하고 데스크탑 웹 단일 타겟으로 우선 출시](2026-05-13-defer-mobile-responsive.md) | 채택 |

## 작성법
- 파일명: `YYYY-MM-DD-slug.md` (예: `2026-05-13-event-vs-scheduledrun-split.md`)
- 템플릿: [`_template.md`](_template.md)
- Claude가 작업 중 결정 후보를 감지하면 초안을 보여주고 승인 요청. 직접 작성하려면 `/log-decision` 스킬 사용.
