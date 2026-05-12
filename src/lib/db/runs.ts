import { prisma } from "@/lib/db/client";
import { assertOwnership } from "@/lib/db/auth";

export type ActualRunStatus = "done" | "skipped" | "late";

export interface RecordActualRunInput {
  scheduledRunId: string;
  actualStartAt: Date;
  actualDurationMin: number;
  status: ActualRunStatus;
}

export interface ActualRunSnapshot {
  actualRunId: string;
  scheduledRunId: string;
  actualStartAt: Date;
  actualDurationMin: number;
  status: ActualRunStatus;
}

/**
 * 회고 단건 기록. ScheduledRun에 1:1로 ActualRun. 이미 있으면 갱신(UPSERT).
 *
 * IDOR 방어: scheduledRunId로 row를 먼저 조회해 owner를 검증.
 */
export async function recordActualRun(
  userId: string,
  input: RecordActualRunInput,
): Promise<ActualRunSnapshot> {
  const scheduledRun = await prisma.scheduledRun.findUnique({
    where: { id: input.scheduledRunId },
    select: { id: true, userId: true },
  });
  assertOwnership(scheduledRun, userId);

  const saved = await prisma.actualRun.upsert({
    where: { scheduledRunId: input.scheduledRunId },
    create: {
      userId,
      scheduledRunId: input.scheduledRunId,
      actualStartAt: input.actualStartAt,
      actualDurationMin: input.actualDurationMin,
      status: input.status,
    },
    update: {
      actualStartAt: input.actualStartAt,
      actualDurationMin: input.actualDurationMin,
      status: input.status,
    },
  });

  return {
    actualRunId: saved.id,
    scheduledRunId: saved.scheduledRunId,
    actualStartAt: saved.actualStartAt,
    actualDurationMin: saved.actualDurationMin,
    status: saved.status,
  };
}

export interface PendingRetroItem {
  scheduledRunId: string;
  eventId: string;
  title: string;
  scheduledStartAt: Date;
  scheduledDurationMin: number;
}

/**
 * 회고가 안 된 ScheduledRun 목록. 일괄 회고 시작용.
 *
 * 조건:
 * - userId 일치
 * - [from, to] 범위 내 scheduledStartAt
 * - actualRun 없음
 * - 이미 지난 시각만 (회고는 과거에 대해서만 의미 있음)
 */
export async function listPendingRetros(
  userId: string,
  params: { from: Date; to: Date; now?: Date },
): Promise<PendingRetroItem[]> {
  const now = params.now ?? new Date();
  const upper = params.to < now ? params.to : now;

  const rows = await prisma.scheduledRun.findMany({
    where: {
      userId,
      scheduledStartAt: { gte: params.from, lte: upper },
      actualRun: { is: null },
    },
    include: { event: { select: { id: true, title: true } } },
    orderBy: { scheduledStartAt: "asc" },
  });

  return rows.map((r) => ({
    scheduledRunId: r.id,
    eventId: r.event.id,
    title: r.event.title,
    scheduledStartAt: r.scheduledStartAt,
    scheduledDurationMin: r.scheduledDurationMin,
  }));
}
