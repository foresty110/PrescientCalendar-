---
name: check
description: typecheck + lint + test 한 번에 실행하고 실패 요약. 가장 자주 쓰는 검증 명령
---

다음을 순서대로 실행하고, 각 단계의 결과를 요약해서 보고하세요.

```
pnpm typecheck
pnpm lint
pnpm test
```

- 모두 통과하면 "✅ typecheck / lint / test 모두 통과" 한 줄
- 실패한 단계가 있으면 어느 파일·어느 줄에서 어떤 에러가 발생했는지 핵심만 (3~5줄)
- 실패 원인 추정이 가능하면 함께 적되 자체 수정은 하지 말고 사용자에게 의견을 구함
