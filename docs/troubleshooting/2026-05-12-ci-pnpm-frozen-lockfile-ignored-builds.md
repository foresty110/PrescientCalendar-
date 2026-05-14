# CI 실패 3연속 — pnpm 11 + Node 22 환경 정합성 (로컬 통과 ≠ CI)

- 날짜: 2026-05-12
- 영향 범위: GitHub Actions CI (`.github/workflows/ci.yml`)
- 관련 기능: FEATURES.md I.1 (CI 초록 배지)

## 증상

PR #1 푸시 후 CI가 3회 연속 실패. 매번 다른 단계에서 멈춤:

1. `pnpm/action-setup@v4` 단계
   ```
   Error: Multiple versions of pnpm specified:
     - version 11 in the GitHub Action config with the key "version"
     - version pnpm@11.1.0 in the package.json with the key "packageManager"
   ```
2. `actions/setup-node@v4` 이후 첫 명령
   ```
   Error [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:sqlite
   warn: This version of pnpm requires at least Node.js v22.13
   ```
3. `pnpm install --frozen-lockfile`
   ```
   [ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @prisma/client@5.22.0, @prisma/engines@5.22.0,
   esbuild@0.21.5, esbuild@0.27.7, prisma@5.22.0, sharp@0.34.5, unrs-resolver@1.11.1
   ##[error]Process completed with exit code 1.
   ```

로컬에선 매번 `typecheck/lint/test/build` 통과. **표면 증상과 실제 원인이 갈라진 케이스.**

## 시도한 가설

- **H1 (#1)**: action `version: 11` 인자 + `package.json`의 `packageManager: pnpm@11.1.0` 충돌. action 인자 제거하고 packageManager를 단일 출처로 → **확정**, 해결 (커밋 `48ed601`)
- **H2 (#2)**: pnpm 11이 Node 22.13+ 요구. CI는 Node 20 사용 중 → `node-version: 22`로 bump → **확정**, 해결 (커밋 `1f83094`)
- **H3 (#3)**: `pnpm-workspace.yaml`의 `onlyBuiltDependencies`가 CI에서 무시됨? 검증 시도 → 같은 목록 매칭됨에도 ignored 됨. **거짓**
- **H4 (#3)**: pnpm 11의 `--frozen-lockfile`이 ignored builds를 warning이 아닌 **error로 격상**. 로컬 `pnpm install`은 warning만 → exit 0, CI `--frozen-lockfile`은 exit 1 → **확정**

## 원인

pnpm 11의 `--frozen-lockfile`은 빌드 스크립트 자동 승인 안 된 패키지(`@prisma/client`, `sharp`, `esbuild` 등)가 있으면 install을 **exit 1로 종료한다**. 로컬 `pnpm install`은 같은 경고가 떠도 exit 0이라 발견하기 어렵다 (의도된 차이 — CI에서 재현 가능한 빌드 보장 목적).

`pnpm-workspace.yaml`의 `onlyBuiltDependencies`는 명시된 패키지의 postinstall 실행을 허용하지만, `--frozen-lockfile`의 strict check를 끄지는 못한다.

## 해결

워크플로 install 단계에 `--ignore-scripts` 추가, 우리에게 필요한 `prisma generate`만 다음 step에서 명시 호출.

```yaml
# .github/workflows/ci.yml
- run: pnpm install --frozen-lockfile --ignore-scripts
- run: pnpm prisma generate
```

native 의존성(sharp, esbuild)은 prebuilt 바이너리로 작동하므로 빌드 스크립트 없이도 OK.

커밋: `5e76ae8`.

**대안 비교**:

| 옵션 | 결정 | 이유 |
|---|---|---|
| `dangerously-allow-all-builds=true` | 기각 | 임의 패키지 postinstall 허용 → 공급망 공격 위험 |
| `onlyBuiltDependencies` 명시 (pnpm-workspace.yaml) | 기각 | `--frozen-lockfile`의 strict check를 우회 못 함 |
| `--ignore-scripts` + 명시 generate | **채택** | 명시적·안전, 우리가 필요한 generate만 호출 |

## 재발 방지

- `docs/development.md` "테스트·CI" 섹션에 pnpm 11 + Node 22 정합성 메모 추가 (별도 PR)
- 다음 native 의존성 추가 시 prebuilt 바이너리 가용성 확인 (postinstall로 native build 강제하는 패키지 회피)
- 로컬·CI 환경 차이 점검을 PR self-review 체크리스트(docs/git.md §8)에 추가 (별도 PR)
- **트리거 누락 회고**: 이 3연속 fail은 CLAUDE.md 자동 기록 트리거에 해당했지만 "30분" 시간 기준만 의식해서 로깅 놓침. 같은 PR에서 트리거 표현을 "시간 → 신호" 중심으로 다듬음

## 후속 — Vercel 동일 증상 재발 (2026-05-14)

PR #13 머지 후 첫 Vercel 빌드도 `[ERR_PNPM_IGNORED_BUILDS]`로 exit 1. 본질은 동일 — pnpm 11이 frozen-lockfile 모드에서 ignored build scripts를 error로 격상. GitHub Actions에서 쓴 `--ignore-scripts` 패치를 Vercel에도 적용해야 했다.

해결: 저장소 루트에 `vercel.json` 추가
```json
{
  "installCommand": "pnpm install --frozen-lockfile --ignore-scripts"
}
```
프리스마 클라이언트 생성은 `package.json`의 `vercel-build` 스크립트(`prisma generate && prisma migrate deploy && next build`)가 명시적으로 처리하므로 install 스크립트 차단해도 안전.

교훈: pnpm 11 strict 정책은 frozen-lockfile 쓰는 모든 환경(CI·Vercel·Netlify 등)에서 동일하게 발현. 새 호스팅 환경 추가 시 같은 패치를 동시에 적용해야 함.
