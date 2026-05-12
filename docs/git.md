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

## 6. `.gitignore` 정책 + 시크릿 사고 대응

### 절대 커밋 금지 목록

- `.env`, `.env.local`, `.env.*` (예외: `.env.example`만 커밋, 값 비움)
- `node_modules/`, `.next/`, `out/`, `dist/`, `build/`
- `*.log`, `coverage/`, `playwright-report/`, `test-results/`
- `.DS_Store` 등 OS 파일
- `prisma/*.db` (SQLite 사용 시), `tsconfig.tsbuildinfo`
- OAuth/Anthropic/Stripe 등 외부 서비스 시크릿
- 인증서·키 파일 (`*.pem`, `*.key`, `*.p12`)

### 시크릿 푸시 실수 시 대응 절차 (순서가 중요)

1. **즉시 키를 회전·폐기** — Google Cloud Console / Anthropic Console / 해당 서비스에서 노출된 키 무효화. **이게 가장 중요. history 청소보다 우선.**
2. `.gitignore`에 해당 파일 추가 (이미 있으면 skip)
3. tracked 상태면 `git rm --cached <file> && git commit -m "chore: untrack <file>"`
4. 원격에 이미 푸시된 경우 — 단순 untrack은 git history 안 지움. history 청소가 필요하면 `git filter-repo` 또는 `bfg-repo-cleaner` 사용 후 `--force-with-lease`로 푸시 (main 대상이면 **사용자 명시 승인 필수**)
5. **주의**: GitHub은 force push 후에도 일정 기간 캐시 보유 + 검색 봇이 이미 긁어갔을 가능성. 키 폐기가 진짜 안전망

## 7. PR 생성 전 자가 검증 (필수)

PR 생성 직전 아래 명령이 **모두 통과**해야 함:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

- 실패 시: 같은 브랜치에 수정 커밋 → 재검증
- CI에 떠넘기지 않음 — 실패 PR은 리뷰 노이즈 + Actions 분 낭비
- LLM/DB 관련 변경 시 추가 (Anthropic 크레딧 소모하므로 의심될 때만):
  ```bash
  pnpm sanity
  ```

## 8. PR self-review 체크리스트

PR 생성 직후 본인이 reviewer가 되어 GitHub UI에서 **diff를 처음부터 끝까지 한 번 읽는다**. 코드 리뷰어 시점에서 보면 자기 변경의 잔재가 잘 보인다.

자주 발견되는 잔재:
- [ ] `console.log` / `console.debug` 디버그 출력
- [ ] 주석 처리한 코드 블록 (의도된 게 아니면 삭제)
- [ ] TODO·FIXME 잔재 (의도된 것만 남김, 나머지는 해결 또는 이슈로)
- [ ] 시크릿·API 키·토큰 노출
- [ ] 사용 안 하는 import (ESLint가 보통 잡지만 한 번 더 확인)
- [ ] 한국어/영어 혼용 일관성 (메시지·주석)
- [ ] 변수명·함수명·파일명 오타
- [ ] 테스트 픽스처에 실제 사용자 데이터·이메일 섞여 있지 않은지

발견 시 같은 브랜치에 후속 커밋(`fix: PR self-review feedback` 또는 더 구체적으로) 또는 직전 커밋에 amend.

## 9. 로컬 main 동기화 워크플로

### 새 작업 시작 (브랜치 분기 전)

```bash
git checkout main
git pull --ff-only origin main
git checkout -b <type>/<slug>
```

### PR 머지 후 정리

```bash
git checkout main
git pull --ff-only origin main
git branch -d <merged-branch>     # 로컬 브랜치 삭제
git remote prune origin           # 원격에서 지워진 브랜치 참조 정리
```

- `--ff-only`로 의도치 않은 merge commit 방지
- 이 시퀀스를 매번 지키면 stale 브랜치·divergent 히스토리 문제가 거의 안 생김

## 10. 머지 충돌 해결 (rebase from main 우선)

feature 브랜치 작업 중 main이 앞서 나간 경우:

```bash
git checkout main && git pull --ff-only
git checkout <feature-branch>
git rebase main
# 충돌 발생 시: 수정 → git add ... → git rebase --continue
# (포기 시: git rebase --abort)
git push --force-with-lease origin <feature-branch>
```

- **`--force-with-lease`** 사용 (단순 `--force` X). 다른 사람이 같은 브랜치에 푸시했으면 실패해서 덮어쓰기 방지
- `merge main into feature` 대신 rebase 권장 이유: feature 브랜치 히스토리가 선형으로 정리되어 PR 리뷰가 깔끔하고 squash merge 결과도 깨끗
- 단, 다른 협업자가 같은 브랜치를 작업 중이면 rebase 위험 — 그땐 merge 사용

## 11. PR 크기 가이드

한 PR 권장 한도:

- **코드 줄 수**: 추가 + 삭제 **300줄 이하**
- **파일 수**: **10개 이하**
- **단일 의도**: PR 제목 한 줄로 설명 가능

초과 사례 분할 방법:

1. **기반 PR** — 의존성·인프라·타입·헬퍼만 (예: "feat: add retrospect tool scaffolding")
2. **핵심 PR** — 기반이 머지된 main을 베이스로 (예: "feat: implement retrospect UI flow")

리뷰어가 한 번에 머릿속에 담을 수 있는 크기가 한도의 기준. Claude는 한 작업 끝에 위 한도 초과를 감지하면 사용자에게 분할 권유.

## 12. Claude PR 생성 후 사용자 보고 형식

`gh pr create` 성공 직후 다음 형식으로 일관되게 보고:

```
## PR 생성 완료

**링크**: https://github.com/<owner>/<repo>/pull/N

**변경 요약** (3줄 이내):
- ...
- ...

**CI 상태**: 확인 중 / 통과 / 실패
**다음 단계**: GitHub에서 리뷰 + Squash and merge, 또는 명시 승인 시 Claude가 `gh pr merge --squash --delete-branch`
```

- CI 상태 폴링(`gh pr checks --watch`)은 사용자가 명시 요청 시에만. 기본은 사용자가 GitHub 알림으로 확인
- 변경 요약은 PR 본문과 별개로 채팅에 짧게 (사용자가 채팅에서 바로 컨텍스트 파악 가능)
