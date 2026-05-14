# pnpm 11 의 install 시 자동 빌드 스크립트 실행을 차단하고 필요한 generate 만 명시 호출

- 날짜: 2026-05-14
- 상태: 채택
- 관련 기능: FEATURES.md I.1 (CI), I.2 (Vercel 배포)

## 맥락

이 저장소는 패키지 매니저로 `pnpm` (Node.js 진영에서 npm·yarn 과 같은 역할의 도구) 11 버전을 쓴다. 그 버전부터 `pnpm install --frozen-lockfile` (의존성 잠금 파일에 기록된 그대로만 깐다 = 재현 가능한 빌드 보장 모드) 에 새 안전장치가 들어갔다 — install 도중 패키지가 자체적으로 실행하려는 "빌드 스크립트" (예: 네이티브 코드 컴파일, Prisma 가 DB 스키마로부터 클라이언트 코드를 생성하는 단계) 가 사전 승인 목록에 없으면, **이전 버전에선 경고만 띄우던 것을 이젠 에러로 격상해 install 을 즉시 실패시킨다**.

> 빌드 스크립트(`postinstall` 등으로 알려진 hook)는 임의 코드 실행 통로라 공급망 공격(외부 의존성을 통해 악성 코드가 install 시점에 실행되는 부류) 에 자주 악용된다. pnpm 11 이 이 동작을 엄격화한 배경.

문제는 우리 의존성 중 빌드 스크립트가 정상 동작해야 하는 것이 여럿이라는 점:

- `@prisma/client` — DB 스키마에서 타입 안전한 클라이언트 코드를 만드는 `prisma generate` 가 install 시 자동 실행되도록 설계됨
- `esbuild`, `sharp`, `unrs-resolver` — 운영체제·CPU 에 맞는 네이티브 바이너리를 install 시 다운로드/컴파일

이 패키지들이 `--frozen-lockfile` 모드에서 install 을 실패시키는 게 CI(GitHub Actions) 와 Vercel 양쪽에서 차례로 터졌다 (각각 `docs/troubleshooting/2026-05-12-ci-pnpm-frozen-lockfile-ignored-builds.md`, `docs/troubleshooting/2026-05-14-vercel-first-deploy-cli-quirks.md`).

## 고려한 대안

- **A) `dangerously-allow-all-builds=true`** — pnpm 설정값으로 모든 빌드 스크립트를 묻지 않고 허용. 한 줄로 install 이 통과한다. 단점: 이름 그대로 "위험하게 다 허용" — 어떤 의존성도 install 시점에 임의 코드를 실행할 수 있어 공급망 공격 노출 면이 커진다. pnpm 11 이 strict 해진 취지를 정면으로 무효화
- **B) `pnpm-workspace.yaml` 의 `onlyBuiltDependencies` 화이트리스트** — 빌드 스크립트를 허용할 패키지 이름을 따로 적어둔다. 안전성은 A 보다 낫지만, 실제로 시도하면 `--frozen-lockfile` 의 strict 검사를 못 우회한다 (해당 패키지가 목록에 있어도 ignored 로 분류돼 install 실패) — pnpm 11 회귀 또는 설계상의 분리로 추정
- **C) `--ignore-scripts` 로 install 단계에선 빌드 스크립트 자체를 차단하고, 우리가 필요한 `prisma generate` 만 다음 단계에서 명시 호출** — 네이티브 바이너리는 prebuilt(미리 컴파일된 바이너리) 가 패키지에 동봉돼 함께 배포되므로 빌드 스크립트 없이도 정상 동작

## 결정

**C 채택.**

CI(`.github/workflows/ci.yml`):

```yaml
- run: pnpm install --frozen-lockfile --ignore-scripts
- run: pnpm prisma generate
```

Vercel 도 같은 정책을 저장소 루트 `vercel.json` 으로:

```json
{
  "installCommand": "pnpm install --frozen-lockfile --ignore-scripts"
}
```

Vercel 의 `vercel-build` 스크립트(`package.json`) 가 `prisma generate && prisma migrate deploy && next build` 를 빌드 직전에 명시 호출하므로 install 단계에서 generate 가 빠져도 결과는 같다.

## 결과

**좋은 점**

- 공급망 위험 노출 면이 줄어듦 — install 시 어떤 패키지도 임의 코드를 실행하지 않는다
- pnpm 11 의 frozen-lockfile 정책을 그대로 활용해 재현 가능 빌드 보장
- CI 와 Vercel 양쪽에 같은 패턴 적용 — 환경 차이로 인한 디버그 비용 ↓ (실제로 GitHub Actions 에서 풀린 동일 문제가 Vercel 에서 그대로 재발했고, 같은 패치를 옮겨 붙이는 식으로 해결됨)
- 의존성을 새로 추가할 때 prebuilt 바이너리 가용성만 점검하면 됨

**트레이드오프 / 향후 위험**

- 빌드 스크립트가 필수인 패키지를 새로 도입할 땐 별도 검토 필요. 현재 패턴은 "install 자동 실행이 아닌, 명시 단계에서 한 번 호출" 형태로 매번 옮겨 적용
- prebuilt 바이너리 없는 네이티브 의존성은 회피 대상 — 라이브러리 선택 시 사전 확인 단계 필요
- pnpm 12+ 에서 정책이 또 바뀔 가능성 — 그 시점에 본 결정 재평가
