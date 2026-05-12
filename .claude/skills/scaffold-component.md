---
name: scaffold-component
description: React 컴포넌트 파일 스캐폴딩 (Tailwind + 'use client' 결정 가이드 + props 타입 stub)
---

사용자가 컴포넌트 이름을 주면 `src/components/<Name>.tsx`를 만든다. 다음 결정을 명시적으로:

1. **서버 vs 클라이언트**:
   - 인터랙션(`onClick`, form, state) 또는 hook 필요? → `'use client'` 추가
   - 단순 렌더링만? → 서버 컴포넌트로 (`'use client'` 없음)
   - 사용자에게 어느 쪽인지 물어보거나 의도가 분명하면 그대로 진행

2. **Props 타입**: interface로 정의, 모두 명시 (`any` 금지)

3. **Tailwind 컨벤션** (모바일 우선):
   - 기본 클래스는 모바일 기준
   - 큰 화면은 `sm:`, `md:`, `lg:` 접두사
   - 다크모드는 `dark:` 변형

4. **파일 구조**:
```tsx
'use client';  // 필요 시
import { ... } from "...";

interface NameProps {
  // ...
}

export function Name({ ... }: NameProps) {
  return (
    <div className="...">
      ...
    </div>
  );
}
```

5. 작업 후 `pnpm typecheck` 통과 확인.
