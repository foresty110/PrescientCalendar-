# Git 컨벤션 & 브랜치 전략

이 프로젝트의 git 운영 규칙. **Claude는 커밋·푸시·PR 생성 전 항상 이 문서를 참고**.

## 1. 브랜치 전략 — GitHub Flow

```
main  ────●────●────●────●────●────  (배포 가능 상태 유지)
              ╲    ╱   ╲        ╱
            feat/auth  fix/calendar-loop
            (PR → squash merge → 브랜치 삭제)
```

- **`main`**: 배포 가능 상태. 직접 커밋 금지 (squash merge로만 변경)
- **기능 브랜치**: `<type>/<short-slug>` (소문자 + 하이픈)
  - `feat/retrospect-tool`
  - `fix/middleware-jwe-error`
  - `docs/api-conventions`
  - `chore/upgrade-next-16`
- 작업 1단위 = 1 브랜치 = 1 PR (가능한 작게 유지)
- 브랜치는 머지 후 삭제

## 2. 커밋 메시지 — Conventional Commits

```
<type>(<scope>?): <subject>

<body, optional>

<footer, optional>
```

### Types

| Type | 의미 | 예시 |
|---|---|---|
| `feat` | 새 기능 | `feat(retrospect): list_pending_retros 도구 구현` |
| `fix` | 버그 수정 | `fix(calendar): 무한 refetch 제거` |
| `docs` | 문서만 변경 | `docs(git): 컨벤션 추가` |
| `style` | 포매팅·세미콜론 등 (로직 변경 X) | `style: prettier 적용` |
| `refactor` | 동작 변경 없는 코드 정리 | `refactor(llm): 도구 등록 패턴 분리` |
| `test` | 테스트만 변경 | `test(time): KST 변환 케이스 추가` |
| `perf` | 성능 개선 | `perf(events): @@index 추가로 N+1 제거` |
| `build` | 빌드 시스템·의존성 | `build: Next 15→16 업그레이드` |
| `ci` | CI 설정 | `ci: pnpm cache 추가` |
| `chore` | 그 외 잡일 (FEATURES 갱신 등) | `chore: FEATURES 2.1 체크` |

### Scope (선택)

도메인 또는 영역. 예: `auth`, `calendar`, `chat`, `llm`, `db`, `prisma`, `middleware`, `api`, `tools`, `prompts`, `time`, `ui`.

### Subject 규칙

- 한국어 / 영어 혼용 OK (이 프로젝트는 한국어 우선)
- **소문자**로 시작, **마침표 X**
- **명령형**: "추가한다" 보다 "추가" / "add"
- 50자 이내 권장

### Body

- 본문 줄바꿈 권장 (72자)
- **What보다 Why** — 무엇을 했는지는 diff에서 보임. 왜 했는지가 가치
- 트레이드오프·대안·제약 명시

### Footer

```
BREAKING CHANGE: <설명>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## 3. PR 흐름

1. **브랜치 생성**: `git checkout -b feat/<slug>` (main에서 분기)
2. **작업 + 커밋**: Conventional Commits 형식. 작은 단위로 자주 커밋 OK (squash merge라서 PR 단위로 정리됨)
3. **푸시**: `git push -u origin <branch>` — 기능 브랜치는 자유롭게 푸시
4. **PR 생성**: `gh pr create` (제목·본문 형식은 아래)
5. **CI 통과 확인**: GitHub Actions 초록색
6. **머지**: **사용자가** GitHub UI에서 "Squash and merge" 클릭, 또는 명시 승인 시 Claude가 `gh pr merge --squash --delete-branch`
7. **로컬 정리**: `git checkout main && git pull && git branch -d <branch>`

### PR 제목·본문

제목: 커밋 메시지처럼 Conventional Commits 형식 사용 (PR이 머지될 때 squash 커밋 메시지가 됨)

본문 템플릿:
```markdown
## Summary
- 1~3줄 변경 요약

## Why
- 왜 이 변경이 필요한가

## Test plan
- [ ] 어떻게 검증했나 (typecheck/lint/test/build/수동 시나리오)

## Related
- FEATURES.md X.Y
- docs/troubleshooting/...md (있다면)
```

## 4. Claude가 지킬 규칙 (요약)

- **main 직접 커밋 금지** — 항상 기능 브랜치
- **커밋 메시지는 Conventional Commits**
- **PR 생성까지** Claude가 (`gh pr create`), **머지는 사용자가** (또는 명시 승인)
- **푸시 권한**:
  - 기능 브랜치 (`feat/`, `fix/`, ...): **자유롭게 푸시** OK
  - `main`: **항상 사용자 명시 승인 후** (현재는 PR 흐름이라 직접 push 안 함)
- 작업 시작 시 적절한 브랜치에 있는지 먼저 확인 (`git branch --show-current`)

## 5. 예시

좋은 커밋:
```
feat(retrospect): record_actual_run 도구 구현

list_pending_retros로 미회고 ScheduledRun을 가져온 뒤 순차 record_actual_run
호출 가능. UPSERT 패턴으로 같은 ScheduledRun에 재기록 허용.

assertOwnership으로 IDOR 방어. 도구 입력에 scheduledRunId 받지만 핸들러가
항상 currentUserId 검증.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

피해야 할 커밋:
```
Update files               # 어디·무엇·왜 다 없음
WIP                        # 임시 커밋 (PR squash 전엔 OK, main에는 X)
Fix bug                    # 어느 버그인지 불명
```
