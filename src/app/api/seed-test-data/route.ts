import { NextResponse } from "next/server";

import { getCurrentUserId } from "@/lib/db/auth";
import { mapError } from "@/lib/api/errors";
import { seedTestData } from "@/lib/db/seed-test-data";

export const runtime = "nodejs"; // Prisma 는 Node runtime 필요

/**
 * POST /api/seed-test-data
 *
 * 현재 로그인 사용자에게 데모용 일정 + 회고 데이터 일괄 생성. 본인 데이터만 만들기
 * 때문에 prod 에서도 인증만 통과하면 호출 가능 (포트폴리오 평가자가 가입 직후 바로
 * 실현 가능성 점수 카드를 보기 위한 용도).
 *
 * 입력 없음 — 모든 시드 구성은 seedTestData 안에 박혀 있다.
 */
export async function POST(): Promise<NextResponse> {
  try {
    const userId = await getCurrentUserId();
    const now = new Date();
    const summary = await seedTestData(userId, now);
    return NextResponse.json(summary);
  } catch (e) {
    return mapError(e);
  }
}
