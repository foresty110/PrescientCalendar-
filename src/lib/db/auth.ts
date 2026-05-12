import { auth } from "@/auth";

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
    this.name = "ForbiddenError";
  }
}

/**
 * 현재 세션에서 userId 추출. 없으면 UnauthorizedError throw.
 * 모든 보호 라우트의 진입에서 호출.
 */
export async function getCurrentUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }
  return session.user.id;
}

/**
 * IDOR 방어: ID로 조회한 row가 현재 사용자 소유인지 확인.
 * scheduledRunId 같은 ID 입력을 받는 모든 도구·라우트에서 호출.
 */
export function assertOwnership<T extends { userId: string } | null | undefined>(
  row: T,
  userId: string,
): asserts row is NonNullable<T> {
  if (!row) throw new ForbiddenError();
  if (row.userId !== userId) throw new ForbiddenError();
}
