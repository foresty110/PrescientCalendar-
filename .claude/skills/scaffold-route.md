---
name: scaffold-route
description: Next.js Route Handler 스캐폴딩 (Zod 검증 + getCurrentUserId + db 함수 호출 + 에러 envelope)
---

사용자가 라우트 경로와 HTTP 메서드를 주면 `src/app/api/<path>/route.ts`를 생성한다. 다음 패턴을 따른다:

```typescript
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/db/auth";
import { mapError } from "@/lib/api/errors";
import { z } from "zod";

const inputSchema = z.object({
  // ...
}).openapi({ example: { /* ... */ } });

export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();          // 1) 인증
    const body = await req.json();
    const parsed = inputSchema.safeParse(body);        // 2) 검증
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Invalid input", details: parsed.error.flatten() } },
        { status: 400 }
      );
    }
    const result = await /* src/lib/db/* 함수 */(userId, parsed.data);  // 3) db
    return NextResponse.json(result);
  } catch (e) {
    return mapError(e);                                // 4) 에러 envelope
  }
}
```

체크:
- [ ] `getCurrentUserId()`로 인증 가드
- [ ] Zod safeParse + 실패 시 VALIDATION_ERROR
- [ ] DB는 `src/lib/db/*` 통해서만
- [ ] `.openapi({ example })` 메타데이터 추가
- [ ] 스키마 추가 후 `pnpm openapi:gen` 안내

`docs/api.md`, `docs/guardrails.md` 참조.
