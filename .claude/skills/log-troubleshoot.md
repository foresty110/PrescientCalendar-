---
name: log-troubleshoot
description: 방금 디버깅한 이슈를 트러블슈팅 로그로 저장 (사용자 승인 후)
---

대화·작업 맥락을 보고 다음 순서로 진행:

1. **이슈 식별** — 다음 중 하나면 트러블슈팅 대상:
   - 디버깅에 30분 이상 소요됨
   - 표면 증상과 실제 원인이 달랐음
   - 환경·설정 문제 (Docker, Prisma migrate, OAuth 콜백, deploy 등)
   - 라이브러리 버그·제약 회피

2. **초안 작성** — `docs/troubleshooting/_template.md` 형식으로:
   - 파일명: `YYYY-MM-DD-<slug>.md` (예: `2026-05-20-prisma-migrate-on-vercel.md`)
   - 증상 / 시도한 가설 (실패한 것 포함) / 원인 / 해결 / 재발 방지 채우기

3. **승인 요청 형식**:
   ```
   📝 로그 후보: troubleshooting · docs/troubleshooting/YYYY-MM-DD-<slug>.md
   <초안 전체>
   저장할까요? (1) 저장 (2) 수정해서 저장 (3) 건너뛰기
   ```

4. **저장 후**:
   - `docs/troubleshooting/README.md`의 표에 한 줄 추가
   - 사용자에게 "저장 완료. 인덱스도 갱신했어요" 보고

후보가 없으면 "최근에 디버깅한 비자명한 이슈가 떠오르지 않아요. 어떤 문제를 기록할까요?" 되묻는다.
