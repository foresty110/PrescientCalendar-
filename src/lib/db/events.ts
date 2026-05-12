import { prisma } from "@/lib/db/client";
import { fromKstInput } from "@/lib/time";

export type Recurrence = {
  freq: "DAILY" | "WEEKLY" | "MONTHLY";
  byDay?: ("MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU")[];
  until?: string;
} | null | undefined;

export interface CreateEventInput {
  title: string;
  startAt: string;
  durationMin: number;
  recurrence?: Recurrence;
}

export interface CreateEventResult {
  eventId: string;
  firstScheduledRunId: string;
  occurrencesPlanned: number;
  conflictWarning?: { scheduledRunId: string; title: string; startAt: Date }[];
}

/**
 * 새 Event + 첫 ScheduledRun 생성.
 *
 * Step 4 단계의 최소 구현 — 반복 일정은 첫 인스턴스만 생성 (전체 펼치기는 Step 5에서 보강).
 * 충돌 감지·재확인 흐름은 시스템 프롬프트가 안내.
 */
export async function createEvent(
  userId: string,
  input: CreateEventInput,
  now: Date,
): Promise<CreateEventResult> {
  const startAt = fromKstInput(input.startAt);

  if (startAt.getTime() < now.getTime()) {
    throw new Error("PAST_TIME: 과거 시각은 거부 — assistant가 재질문해야 합니다");
  }

  const conflict = await findConflicts(userId, startAt, input.durationMin);

  const event = await prisma.event.create({
    data: {
      userId,
      title: input.title,
      defaultDurationMin: input.durationMin,
      recurrence: input.recurrence ? input.recurrence : undefined,
    },
  });

  const scheduledRun = await prisma.scheduledRun.create({
    data: {
      userId,
      eventId: event.id,
      scheduledStartAt: startAt,
      scheduledDurationMin: input.durationMin,
    },
  });

  return {
    eventId: event.id,
    firstScheduledRunId: scheduledRun.id,
    occurrencesPlanned: 1,
    ...(conflict.length > 0 ? { conflictWarning: conflict } : {}),
  };
}

export interface ScheduledRunListItem {
  scheduledRunId: string;
  eventId: string;
  title: string;
  scheduledStartAt: Date;
  scheduledDurationMin: number;
  feasibilityScore: number | null;
  actualRun?: {
    actualStartAt: Date;
    actualDurationMin: number;
    status: "done" | "skipped" | "late";
  };
}

/**
 * from~to 범위의 ScheduledRun 조회. 캘린더 표시 + LLM 컨텍스트용.
 * userId 필터 필수. include로 N+1 방지.
 */
export async function listScheduledRuns(
  userId: string,
  params: { from: Date; to: Date; withActualRun?: boolean },
): Promise<ScheduledRunListItem[]> {
  const rows = await prisma.scheduledRun.findMany({
    where: {
      userId,
      scheduledStartAt: { gte: params.from, lte: params.to },
    },
    include: {
      event: { select: { id: true, title: true } },
      actualRun: params.withActualRun ? true : false,
    },
    orderBy: { scheduledStartAt: "asc" },
  });

  return rows.map((r) => ({
    scheduledRunId: r.id,
    eventId: r.event.id,
    title: r.event.title,
    scheduledStartAt: r.scheduledStartAt,
    scheduledDurationMin: r.scheduledDurationMin,
    feasibilityScore: r.feasibilityScore,
    ...(params.withActualRun && r.actualRun
      ? {
          actualRun: {
            actualStartAt: r.actualRun.actualStartAt,
            actualDurationMin: r.actualRun.actualDurationMin,
            status: r.actualRun.status,
          },
        }
      : {}),
  }));
}

async function findConflicts(userId: string, startAt: Date, durationMin: number) {
  const endAt = new Date(startAt.getTime() + durationMin * 60_000);
  const rows = await prisma.scheduledRun.findMany({
    where: {
      userId,
      AND: [
        { scheduledStartAt: { lt: endAt } },
        // 종료 시각 비교 — DB에서 직접 계산이 어려워 충분히 넓게 잡고 코드에서 필터
        { scheduledStartAt: { gte: new Date(startAt.getTime() - 12 * 3600 * 1000) } },
      ],
    },
    include: { event: { select: { title: true } } },
  });
  return rows
    .filter((r) => {
      const rEnd = new Date(r.scheduledStartAt.getTime() + r.scheduledDurationMin * 60_000);
      return rEnd > startAt && r.scheduledStartAt < endAt;
    })
    .map((r) => ({
      scheduledRunId: r.id,
      title: r.event.title,
      startAt: r.scheduledStartAt,
    }));
}
