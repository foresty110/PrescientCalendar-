# API Conventions

짧게 컨벤션만. 자세한 사양은 `/api/docs` (Scalar)를 본다 — Zod 스키마에서 자동 생성된 `openapi.json` 렌더.

## 버저닝
- MVP는 단일 버전. 추후 breaking change 시 `/api/v2/...`.

## 시간
- 모든 datetime은 ISO-8601
- 응답은 UTC offset 명시 (`...Z`)
- 입력은 KST offset 권장 (`2026-05-13T15:00:00+09:00`)

## 에러 envelope
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {...} } }
```
표준 code: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`(IDOR), `NOT_FOUND`, `CONFLICT`(중복), `RATE_LIMITED`, `INTERNAL`.

## 페이지네이션
리스트 조회 필요 시 `?cursor=&limit=` (default 50, max 200).

## 인증
- Auth.js v5, DB session, 세션 쿠키 기반
- 모든 도메인 라우트는 미들웨어 + `getCurrentUserId()` 보호
- **공개 라우트**: `/`, `/signin`, `/api/auth/*`, `/api/docs` (포트폴리오 보러 온 사람도 명세를 볼 수 있게)

## 스트리밍
`POST /api/chat`은 SSE (`text/event-stream`):
- `event: token` — Claude 응답 토큰
- `event: tool_use` — 도구 호출 시작
- `event: tool_result` — 도구 결과
- `event: done` — 종료

## OpenAPI 생성
새 라우트나 스키마 추가 시:
```bash
pnpm openapi:gen
```
`openapi.json`을 커밋. CI 자동 검증 없음 (포트폴리오 규모라 수동 유지).
