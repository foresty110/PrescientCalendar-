---
name: clean
description: 사용 안 하는 import 제거 + import 정렬 + console.log 잔재 경고
---

현재 변경분(또는 사용자가 지정한 파일들)에 대해:

1. `pnpm exec eslint --fix <file>` 으로 사용 안 하는 import 자동 제거 + 정렬
2. `console.log`, `console.debug` 잔재 검색 — 발견 시 어디에 있는지 보고만 (자동 제거 X, 의도적 로그일 수도 있음)
3. TODO·FIXME 코멘트는 손대지 않음
4. 빈 catch 블록 발견 시 경고 (에러 무시 패턴은 위험)

결과 보고 형식:
```
✅ X 파일에서 import 정리 완료
⚠️  console.log Y개 발견:
   - src/foo.ts:42  console.log("debug")
   - ...
```
