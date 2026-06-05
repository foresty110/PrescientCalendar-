# 캘린더 월간 조회만 500 — 로컬 DB에 마이그레이션이 안 내려간 채로 실행

- 날짜: 2026-06-05
- 영향 범위: 로컬 개발 서버 (`pnpm dev`) — prod·CI 무관
- 관련 기능: FEATURES.md 2.7 (일정 사전 메모 description)

> **작성 원칙** — "내가 뭘 했나" 가 아니라 "무슨 일이 있었나 → 왜 헷갈렸나 → 어떻게 풀었나" 흐름.

## 무슨 일이 있었나

이 프로젝트는 DB 스키마를 Prisma 마이그레이션으로 관리한다. 스키마 변경(`prisma/schema.prisma`)을 하면 `prisma/migrations/` 아래에 SQL 파일이 한 벌 생기고, 그 SQL을 실제 데이터베이스에 "적용(apply)"해야 비로소 DB의 실제 테이블 구조가 코드와 일치한다. 즉 **코드(스키마) 변경과 DB 반영은 별개의 두 단계**다.

2.7 작업에서 `Event` 모델에 `description` 컬럼을 추가했고, 그 마이그레이션 파일(`20260514081423_add_event_description`)은 리포지토리에 커밋돼 있었다. 그런데 이 로컬 환경의 Postgres에는 그 마이그레이션이 한 번도 적용되지 않은 상태였다. 코드는 `description`을 읽으려 하는데 실제 DB 테이블엔 그 컬럼이 없는, 코드와 DB가 어긋난 상태.

증상은 캘린더 **월간** 조회에서만 500이었다:

> ```
> [api] unhandled error: PrismaClientKnownRequestError
> The column `Event.description` does not exist in the current database.
>   at listScheduledRuns (src/lib/db/events.ts:301)
>   code: 'P2022'  (P2022 = 쿼리가 참조한 컬럼이 DB에 없음)
> GET /api/events?from=...05-31...&to=...06-30... 500
> ```

흥미롭게도 **하루** 단위 조회(`from=06-04 & to=06-05`)는 200으로 멀쩡했다.

## 왜 풀기 까다로웠나

두 가지가 "코드 버그"라는 오해를 부른다.

1. **코드·스키마는 멀쩡하다.** `schema.prisma`에도, `events.ts`에도 `description`이 정상적으로 있다. 뒤처져 있는 건 눈에 안 보이는 로컬 DB 하나뿐이라, 코드를 아무리 들여다봐도 원인이 안 보인다.
2. **같은 함수인데 어떤 호출은 통과한다.** 하루 조회가 200으로 나오니 "특정 조건의 조회만 깨지는 코드 분기 문제"로 의심이 흘러가기 쉽다. 실제 이유는 단순하다 — 하루 범위엔 해당 일자 데이터가 0건이라 Prisma가 컬럼을 실제로 읽기 전에 빈 결과로 빠졌고, 데이터가 있는 월간 범위에서만 `description`을 실제로 SELECT하다 터진 것. 즉 **데이터 유무가 에러 노출 여부를 갈랐을 뿐**, 코드 분기와는 무관했다.

## 시도한 가설

- **H1**: 코드/스키마에 description 누락 → **거짓**. 둘 다 정상 존재.
- **H2**: 로컬 DB에 마이그레이션 미적용 → **확정**. `prisma migrate status`가 `20260514081423_add_event_description`을 "not yet been applied"로 표시.

## 원인

코드(스키마)와 DB는 별개로 갱신되는데, 이 환경에서는 마이그레이션 적용 단계가 한 번도 실행되지 않았다. prod·CI는 `vercel-build` 스크립트(`prisma generate && prisma migrate deploy && next build`)가 빌드 때마다 자동으로 마이그레이션을 적용하지만, **로컬 `pnpm dev`(`next dev`)에는 그런 자동 적용 단계가 없다.** 그래서 스키마를 바꾸거나 변경된 브랜치를 pull한 뒤 `prisma migrate dev`/`deploy`를 직접 돌리지 않으면 DB가 조용히 뒤처진다.

## 해결

누락된 마이그레이션을 적용:

```
npx prisma migrate deploy
# → Applying migration `20260514081423_add_event_description` ... 성공
```

`description`은 컬럼 추가(additive)라 기존 데이터 손실 없이 적용된다. 적용 후 같은 월간 엔드포인트 재호출에서 P2022가 사라짐.

| 옵션 | 결정 | 이유 |
|---|---|---|
| `prisma migrate reset` | 기각 | DB를 통째로 비움 — 컬럼 하나 추가하는 데 과함, 데모 데이터 손실 |
| `prisma migrate deploy` | 채택 | 미적용 마이그레이션만 순서대로 적용, 데이터 보존 |

## 재발 방지

- **현재 상태: 아직 "습관"에 의존 — 자동 방어 장치 없음.** pull/스키마 변경 후 `pnpm db:migrate`를 사람이 기억해서 돌려야 한다. 같은 함정에 또 빠질 수 있는 구조.
- **후속(별도 PR 후보)**: `predev` 스크립트로 `prisma migrate deploy`를 `pnpm dev` 앞에 자동 실행해, 로컬에서도 서버 시작 시 DB가 자동으로 최신이 되게 한다. (`vercel-build`가 prod에서 하는 일의 로컬판.) 적용 여부·트레이드오프는 사용자 확인 후 진행.