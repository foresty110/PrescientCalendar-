# Guardrails — 보안·성능·예외처리 셀프체크

작업 완료 보고 전 매번 점검. 적용 결과를 응답에 명시 (적용한 항목 + 적용 안 한 항목과 이유). `code-reviewer` 서브에이전트도 이 체크리스트로 변경분 검토.

## 보안
- [ ] 외부 입력은 Zod 검증 (route handler 진입점)
- [ ] DB는 Prisma 클라이언트만 사용 (raw query 금지, 필요 시 매개변수 바인딩)
- [ ] 인증된 경로는 `getCurrentUserId()` + **IDOR 방어** (`scheduledRunId` 등 ID 입력 시 항상 `assertOwnership(row, userId)` 또는 `where: { id, userId }`)
- [ ] 보호 라우트는 **이중 가드**: 미들웨어는 쿠키 존재만 체크, 서버 컴포넌트·route handler는 `await auth()` 또는 `getCurrentUserId()`로 실제 검증 (DB session + Edge runtime 호환)
- [ ] 시크릿·PII는 로그·에러 응답에 노출 금지 (스택트레이스 사용자 노출 X)
- [ ] LLM tool_use 인자는 Zod safeParse 통과 후 DB 반영
- [ ] `dangerouslySetInnerHTML` 금지 (필요 시 DOMPurify)
- [ ] 대량 삭제 도구는 hard limit + 사용자 확인 패턴

## 성능
- [ ] N+1 없음 (Prisma `include` / `select` 명시)
- [ ] 리스트는 페이지네이션 (default 50, max 200)
- [ ] 서버 컴포넌트 우선, `'use client'`는 최소
- [ ] LLM 호출 시 system + tools에 `cache_control: { type: "ephemeral" }`
- [ ] 큰 객체는 stream / iterate, 메모리 전부 로드 X
- [ ] DB index 적용 — 모든 도메인 테이블에 `@@index([userId])`

## 예외처리
- [ ] 외부 호출 (LLM, DB, fetch)은 try/catch 또는 `.catch`
- [ ] 사용자 노출 에러 vs 내부 로그 에러 분리 — `mapError(e)` 패턴
- [ ] async unhandled rejection 없음 (ESLint가 자동 검증)
- [ ] DB transaction 실패 시 롤백
- [ ] LLM 응답이 예상 스키마 아닐 때 Zod safeParse fallback
- [ ] 빈 결과 / undefined 케이스 명시적 처리

## 도메인 엣지 케이스
- [ ] 과거 시각 일정 생성은 허용 — 단 사후 기록 시 LLM 이 저장 전 사용자에게 한 번 더 확인 (scheduler.md §3)
- [ ] 시간대: DB UTC, 입출력 KST (`src/lib/time.ts` 헬퍼 사용, `new Date()` 직접 호출 X)
- [ ] 회고 데이터 부족 시 (같은 시간대 ±1h ActualRun 5건 미만 또는 가입 2주 이내) feasibility는 "데이터 부족" 회색 처리, score=null
- [ ] 일정 중복 시 사용자 확인 후 진행
- [ ] LLM 시각 파싱 결과는 항상 확정 메시지로 사용자에게 보여주고 응답받은 뒤 저장

## API
- [ ] 새 라우트는 `src/lib/schemas/`에 Zod 스키마 정의 + `.openapi({ description, example })`
- [ ] 에러 envelope `{ error: { code, message, details? } }` 준수
- [ ] 새 라우트·스키마 추가 후 `pnpm openapi:gen` 실행 (수동 OK)
