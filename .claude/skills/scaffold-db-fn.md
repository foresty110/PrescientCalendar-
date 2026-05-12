---
name: scaffold-db-fn
description: src/lib/db/ 쿼리 함수 스캐폴딩 (Prisma 싱글톤 + userId 필터 + IDOR 방어 + 명시적 타입)
---

사용자가 함수 이름과 목적을 주면 `src/lib/db/<area>.ts`에 함수를 추가한다 (파일이 없으면 생성).

패턴:

```typescript
import { prisma } from "./client";
import { assertOwnership } from "./auth";

export async function getEventById(userId: string, eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  assertOwnership(event, userId);   // IDOR 방어
  return event;
}

export async function listEvents(
  userId: string,
  params: { from: Date; to: Date }
) {
  return prisma.scheduledRun.findMany({
    where: {
      userId,                       // 항상 userId 필터
      scheduledStartAt: { gte: params.from, lte: params.to },
    },
    include: { event: true },       // N+1 방지
    orderBy: { scheduledStartAt: "asc" },
  });
}
```

체크:
- [ ] 첫 인자는 `userId: string`
- [ ] `where`에 `userId` 포함
- [ ] ID로 단건 조회 시 `assertOwnership` 호출
- [ ] `include` / `select`로 N+1 방지
- [ ] 인자·반환 타입 명시 (any 금지)

`docs/development.md` §3 Prisma 섹션, `docs/guardrails.md` 보안·성능 참조.
