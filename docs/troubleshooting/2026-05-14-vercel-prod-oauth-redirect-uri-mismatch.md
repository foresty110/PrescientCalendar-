# Vercel prod 첫 로그인 — Google `redirect_uri_mismatch` (deploy → callback 등록 순서 문제)

- 날짜: 2026-05-14
- 영향 범위: 첫 prod 배포 직후 OAuth 흐름, Google Cloud Console 설정
- 관련 기능: FEATURES.md 1.1·1.2 (Google OAuth 로그인), I.2 (Vercel 배포)

## 증상

Vercel 빌드 성공·prod URL 살아남 → `https://prescient-calendar.vercel.app/signin` 에서 "Google로 로그인" 클릭 → Google 측 에러 페이지:

> 앱이 Google의 OAuth 2.0 정책을 준수하지 않기 때문에 앱에 로그인할 수 없습니다.
> 요청 세부정보: redirect_uri=https://prescient-calendar.vercel.app/api/auth/callback/google flowName=GeneralOAuthFlow

## 시도한 가설

- **H1**: 환경 변수 누락? → `vercel env ls` 로 6개 변수(`AUTH_GOOGLE_ID/SECRET` 포함) Production 환경 등록 확인 — **거짓**
- **H2**: Google이 시도한 redirect_uri 가 Console 등록값과 다름 → 에러 페이지의 "요청 세부정보" 가 정확한 URL 노출 → **확정**

가설 단계가 짧음 (에러 메시지 자체가 root cause 직접 지목). 그러나 **왜 발생했는가** 는 onboarding 순서 문제.

## 원인

**chicken-and-egg 순서 문제**: prod 콜백 URL을 Google Cloud Console에 등록하려면 Vercel deployment 의 정확한 URL을 먼저 알아야 함. 그런데 `docs/deploy.md` 의 기존 순서는:

1. Neon 발급
2. **Google Cloud Console에 prod 콜백 등록 (URL 미정인 채로 추정 입력)**
3. Vercel import + 배포
4. 첫 배포 확인

2단계에서 "임시로 `https://prescient-calendar.vercel.app` 으로 먼저 넣고 나중에 교체" 라고 안내했지만, 실사용 시 그 단계가 잘 안 지켜지거나 deployment 별 hash URL (`prescient-calendar-<hash>.vercel.app`) 과 production alias URL (`prescient-calendar.vercel.app`) 의 차이를 인지 못 함.

## 해결

`docs/deploy.md` step 2 시점에 등록한 추정 URL이 다행히 production alias와 일치했지만 (사용자가 default 도메인을 사용) prod 빌드 직전 OAuth client 검토를 안 해서 등록이 누락된 상태로 첫 로그인 시도.

수정 절차:
1. Google Cloud Console → APIs & Services → Credentials → 기존 OAuth 2.0 Client 편집
2. Authorized redirect URIs 에 `https://prescient-calendar.vercel.app/api/auth/callback/google` 추가
3. SAVE (반영 5초~5분 propagation)
4. prod `/signin` 재시도 → Google 동의 → `/app` 진입 성공

## 재발 방지

- `docs/deploy.md` 순서 재정렬 — Vercel 첫 배포 후 prod URL 확정 → 그 URL을 Google Cloud Console에 등록 → 그 다음 로그인 검증. "deploy first, register callback second" 가 자연스러운 순서
- 등록 누락 시 보이는 에러 메시지 패턴 (`400 redirect_uri_mismatch` + `요청 세부정보: redirect_uri=...`) 을 deploy 트러블슈팅 섹션에 명시
- 추후 custom domain 추가 시 동일 패턴 — 새 도메인의 콜백을 Google에 추가 등록해야 함
- production alias URL 과 deployment-specific hash URL **둘 다** 콜백에 등록해 두면 preview 배포에서도 로그인 동작 (선택)
