
# Prescient Calendar — Features

> 사용자 요청을 받으면 Claude는 작업 시작 전에 항상 이 파일에서 해당 항목을 찾아 "X.Y 항목 진행할게요"라고 명시한다. 완료 후 `[ ]` → `[x]`로 갱신한다.

## 1. 사용자 계정 (로그인)
- [x] 1.1 Google OAuth 로그인 화면 (`/signin`)
- [x] 1.2 세션 발급 + 쿠키 저장 (Auth.js v5, DB session)
- [x] 1.3 로그아웃 (`/app` 우상단 버튼)
- [x] 1.4 미로그인 시 보호 라우트 접근 차단 (`src/middleware.ts`, 이중 가드)
- [x] 1.5 모든 도메인 쿼리에 userId 필터 (createEvent · listScheduledRuns 적용), IDOR 방어 헬퍼 `assertOwnership` 준비됨 (ID 입력 받는 도구 추가될 때마다 적용 필요)

## 2. 대화형 일정 잡기
- [x] 2.1 단발 일정 생성 ("내일 3시에 운동 1시간") — DB 검증 완료
- [x] 2.2 반복 일정 생성 ("매주 화 9시 회의") — `expandRecurrence`가 DAILY/WEEKLY/MONTHLY를 4주 horizon 내 펼침, transaction으로 다중 ScheduledRun 일괄 생성 (`createEvent` `occurrencesPlanned` 반환)
- [x] 2.3 일정 수정 — `update_event` 도구 실구현. recurrence 변경 시 회고 없는 미래 ScheduledRun 재생성, 회고된 미래·과거 인스턴스 보존. (시각 자체 이동은 `delete + create` 조합)
- [x] 2.4 일정 삭제 — `delete_event` 도구 실구현. scope=`all` 전체 cascade, `future_only`는 회고 없는 미래만
- [ ] 2.5 모호한 입력 시 재질문 ("나중에 운동" → 시각 확정 질문) — 프롬프트로 유도, 실측 필요
- [ ] 2.6 시간 충돌 경고 — `conflictWarning` 반환은 구현, LLM 흐름 검증 필요

## 3. 회고 (대화형 우선)
- [x] 3.1 채팅으로 단건 회고 기록 — `record_actual_run` 도구 + IDOR 방어 UPSERT
- [x] 3.2 채팅으로 일괄 회고 — `list_pending_retros` 도구 + retrospect 프롬프트 시스템 결합
- [x] 3.3 상태(완료/스킵/지연) 자동 추론 + 사용자 확인 — 프롬프트 절대 규칙으로 강제
- [x] 3.4 캘린더 이벤트 chip 클릭 → 빠른 입력 모달 (보조 UI). 과거 일정만 클릭 가능, 회고된 항목은 emerald, 회고 필요는 amber 색
- [x] 3.5 회고 통계 채팅 질의 — `query_user_pattern` 도구 (실행률·평균 지연, 키워드/eventId 매칭)

## 4. 실현 가능성 예측
- [x] 4.1 일정 생성 시 점수 자동 산출 (`createEvent` → `computeFeasibility` → `persistFeasibilityScore`)
- [x] 4.2 점수와 근거 캘린더에 표시 — chip 좌측 색 점 (green ≥70 / amber ≥50 / red < 50) + tooltip 근거
- [x] 4.3 "이거 가능할까?" 대화 질의 — `compute_feasibility` 도구 + feasibility.md 프롬프트 결합
- [x] 4.4 데이터 부족 시 회색 처리 — 표본 < 5건 또는 가입 < 14일이면 score=null, slate-300 점

## 인프라·포트폴리오
- [ ] I.1 GitHub Actions CI (typecheck/lint/test/build) 초록 배지
- [ ] I.2 Vercel + Neon 배포 + Google OAuth prod 콜백
- [x] I.3 `/api/docs` Scalar 페이지 (공개 라우트) — Zod 스키마에서 OpenAPI 3.1 자동 생성, 미들웨어 공개 경로
- [ ] I.4 Playwright e2e (로그인→일정 생성, 데스크탑 뷰포트)
- [ ] I.6 README 데모 GIF + 스크린샷 + 결정·트러블슈팅 링크
- [ ] I.7 `docs/decisions/` 3개 이상, `docs/troubleshooting/` 2개 이상
