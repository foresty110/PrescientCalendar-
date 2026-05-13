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

## 2. 커밋 메시지 — Conventional Commits (scope 미사용)

```
<type>: <subject>

<body, optional>

<footer, optional>
```

> **scope는 사용하지 않는다.** 제목이 충분히 구체적이면 어느 영역인지 자연스럽게 드러난다. scope를 강제하면 모호한 분류(`feat(common):` 등)가 늘어 가치가 떨어짐.

### Types

| Type | 의미 | 예시 |
|---|---|---|
| `feat` | 새 기능 | `feat: 대화형 회고 일괄 트리거 추가` |
| `fix` | 버그 수정 | `fix: 캘린더 무한 refetch 제거` |
| `docs` | 문서만 변경 | `docs: git 컨벤션에 §2 철학 추가` |
| `style` | 포매팅 (로직 변경 X) | `style: prettier 적용` |
| `refactor` | 동작 변경 없는 코드 정리 | `refactor: LLM 도구 등록 패턴 분리` |
| `test` | 테스트만 변경 | `test: KST 변환 케이스 추가` |
| `perf` | 성능 개선 | `perf: events.findMany N+1 제거` |
| `build` | 빌드 시스템·의존성 | `build: Next 15에서 16으로 업그레이드` |
| `ci` | CI 설정 | `ci: pnpm action 버전 충돌 해결` |
| `chore` | 그 외 잡일 (FEATURES 갱신 등) | `chore: FEATURES 2.1 체크` |

### Subject 규칙 — **What + Why를 담는다**

How(구현 방법·코드 변경 내역)는 diff에서 보인다. 제목엔 **어디서·무엇을·왜**를 압축해서 적는다.

#### 명령형 검증법

머릿속으로 *"이 커밋을 적용하면 [제목]이 된다"* 를 붙여보고 자연스러우면 통과:

- ✅ `fix: 캘린더 무한 refetch 제거`
  → "이 커밋을 적용하면 *캘린더 무한 refetch 제거*가 된다" — 자연스럽게 읽힘
- ✅ `feat: 대화형 회고 일괄 트리거 추가`
  → "이 커밋을 적용하면 *대화형 회고 일괄 트리거 추가*가 된다" — OK
- ❌ `fix: 캘린더를 수정했다`
  → 과거형 + 무엇·왜 부재
- ❌ `chore: 코드 정리`
  → 어디서·무엇이 빠짐

#### 자연어 우선 — 식별자 단독 사용 금지

코드 식별자(`update_event`, `record_actual_run`, `assertOwnership` 등)는 외부 독자가 모름. 단독 사용 금지. 두 가지 표현 패턴 중 하나를 택한다:

1. **자연어로 풀어쓴다** (선호)
   - ❌ `feat: update_event / delete_event 도구 실구현`
   - ✅ `feat: 채팅에서 일정 수정·삭제를 받는 도구 추가`
2. **자연어 + 식별자 부연** (식별자가 본문에서 자주 언급될 때)
   - ✅ `feat: 채팅 일정 수정 도구(update_event) 추가`

`stub`, `not yet implemented`, `IDOR` 같은 내부 구현 상태·약어도 동일 — 자연어로 풀거나 본문에서 한 번 부연 후 사용.

#### 외부 독자 자가 검증

작성 후 다음 페르소나 중 한 명을 떠올린다 — 이 사람에게 제목+본문이 통하는가?

- **6개월 뒤의 자신** — 프로젝트 어휘를 잊은 상태
- **신규 동료** — 처음 합류한 개발자
- **면접관** — 포트폴리오 GitHub을 본 채용 담당자

위 셋 중 누구라도 "이게 뭐 하는 커밋이지?" 라면 다시 쓴다. 식별자·약어·내부 상태 어휘에 부연 설명이 빠지지 않았는지 점검.

#### 그 외 규칙

- 한국어 / 영어 혼용 OK (이 프로젝트는 한국어 우선)
- **소문자**로 시작, **마침표 X**
- 길이 가이드: **한국어 30자 / 영어 50자** 이내 (한국어 정보 밀도가 높음)

### Body — **'왜 필요했는지'에 집중 + 숫자·근거**

본문은 trivial(타이포·포매팅) 변경엔 생략 OK. **비자명한 결정·트레이드오프·외부 의존성 도입** 시 필수.

#### 0) 사용자 영향 한 줄 (첫 단락 또는 첫 문장)

본문이 있다면 **반드시 첫 단락에 "이 변경으로 사용자가 무엇을 새로 할 수 있는가" 또는 "무엇이 바뀌었는가" 한 문장**을 둔다. 그 뒤로 Why·트레이드오프·기술 디테일.

- ❌ "도구 stub 상태에서 LLM이 ... not yet implemented로 던졌음."
- ✅ "이 변경으로 사용자가 채팅에 '그 회의 매주 목으로 바꿔줘' 같은 명령을 보내면 일정이 실제로 수정·삭제된다."

내부 인프라 변경(테스트·CI·문서)은 사용자 영향이 없을 수 있음. 그때는 **개발자 영향**으로 대체: "이 변경으로 PR 본문에 Conventional Commits 위반이 자동 표시된다." 등.

#### 1) Why에 집중

무엇을 했는지는 제목 + diff로 충분. 본문 첫 문장은 **이 변경이 왜 필요했는지**:

> 회고를 채팅으로 자연스럽게 기록할 통로 부재가 문제. 캘린더 셀 모달은 한 번에 한 건만 가능 + 일정에 안 잡힌 즉흥 회고를 받지 못함.

#### 2) 숫자·근거 포함 (정량적 표현이 신뢰감을 만든다)

| ❌ 모호 | ✅ 정량 |
|---|---|
| "성능 개선" | "쿼리 시간 200ms → 30ms (n=1000)" |
| "코드 많이 줄였다" | "코드 줄 수 −40% (450 → 270)" |
| "테스트 추가" | "테스트 +5 케이스 (KST 변환 엣지)" |
| "버그 발생률 감소" | "프로덕션 에러율 2.3% → 0.1%" |
| "메모리 절약" | "RSS 380MB → 190MB" |

벤치마크 없는 변경은 측정 안 했음을 솔직히 적기 ("정성 평가만 — 사용자 인식 속도 체감 개선") 가 모호한 자랑보다 낫다.

#### 3) 트레이드오프·대안 거부 이유

받아들인 단점·기각한 옵션이 있으면 명시:

> JWT 대신 DB session 선택. 즉시 취소(로그아웃·관리자 강제) 가능이 성능 차이(평균 +8ms)보다 중요.

#### 4) 형식

- 72자 줄바꿈
- 단락별로 한 줄 띄우기

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
feat: 채팅에서 회고를 단건 기록하는 도구 추가

이 변경으로 사용자가 채팅창에 "아까 운동 30분 늦게 시작했어" 같은 한
줄을 보내면 회고(실제 시작 시각·소요·상태)가 DB에 자동 저장된다.

기존에는 캘린더 셀 모달로만 회고가 가능해 한 번에 한 건 + 일정에 안
잡힌 즉흥 회고를 못 받음. 도구(record_actual_run)를 LLM 에이전트에
노출해서 자연어 한 줄로 처리.

권한 검증: 입력으로 받은 일정 ID(scheduledRunId)가 현재 사용자 소유인지
핸들러가 매번 확인 (다른 사용자 데이터 무단 변조 방어 — 흔히 'IDOR'로
부르는 공격 패턴). 도구 호출 1회 평균 320ms (n=20).

테스트 +3 케이스 (단건 기록 / 같은 일정 재기록 / 다른 사용자 권한 시도).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

피해야 할 커밋:
```
Update files                                       # 어디·무엇·왜 다 없음
WIP                                                # 임시 커밋 (PR squash 전엔 OK, main에는 X)
Fix bug                                            # 어느 버그인지 불명
docs(git): 갱신                                    # scope 사용 — 새 규칙에 어긋남
fix: 버그 수정                                     # 어디·무엇·왜 모두 부재
refactor: 함수 정리                                # 명령형이지만 What·Why 모두 모호
perf: 빠르게 만듦                                  # 숫자 없음 — 본문에 측정치 필수
chore: 코드 정리                                   # "이 커밋을 적용하면 …이 된다" 통과 X
feat: update_event / delete_event 도구 실구현      # 식별자 단독 — 처음 보는 사람 모름
chore: stub → 실구현                               # 'stub' 내부 어휘, 무엇·왜 모호
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
