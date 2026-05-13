import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { fromKstInput } from "@/lib/time";
import { expandRecurrence, type Recurrence } from "@/lib/recurrence";
import { computeFeasibility, persistFeasibilityScore } from "@/lib/db/feasibility";

export type { Recurrence } from "@/lib/recurrence";

export interface CreateEventInput {
  title: string;
  startAt: string;
  durationMin: number;
  recurrence?: Recurrence | null;
}

export interface CreateEventResult {
  eventId: string;
  firstScheduledRunId: string;
  occurrencesPlanned: number;
  conflictWarning?: { scheduledRunId: string; title: string; startAt: Date }[];
}

/** 반복 인스턴스를 한 번에 펼칠 horizon (주). 추후 사용자 설정 가능하게 보강 가능 */
const RECURRENCE_HORIZON_WEEKS = 4;

/**
 * 새 Event + 반복 펼친 모든 ScheduledRun 생성.
 *
 * recurrence가 있으면 expandRecurrence로 첫 4주치 인스턴스 전부 생성.
 * 모든 row를 한 transaction에 묶어 부분 실패 시 롤백.
 *
 * 충돌 감지는 첫 인스턴스(startAt) 기준만 — LLM이 사용자에게 확인 후 진행하는
 * 패턴이라 충돌 시 assistant가 사용자 의사 묻고 재호출.
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

  const instances = expandRecurrence(startAt, input.recurrence ?? null, {
    now,
    horizonWeeks: RECURRENCE_HORIZON_WEEKS,
  });

  const result = await prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        userId,
        title: input.title,
        defaultDurationMin: input.durationMin,
        recurrence: input.recurrence
          ? (input.recurrence as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    const created = await Promise.all(
      instances.map((scheduledStartAt) =>
        tx.scheduledRun.create({
          data: {
            userId,
            eventId: event.id,
            scheduledStartAt,
            scheduledDurationMin: input.durationMin,
          },
        }),
      ),
    );

    return { event, firstScheduledRun: created[0]! };
  });

  // 첫 인스턴스에 대해 feasibility 자동 산출 + 저장. cold start면 score=null로 회색 처리.
  // 실패는 무시 (event 생성 자체는 성공) — 점수는 보조 정보.
  try {
    const feasibility = await computeFeasibility(userId, result.firstScheduledRun.id, now);
    await persistFeasibilityScore(result.firstScheduledRun.id, feasibility);
  } catch {
    // 점수 산출은 best-effort. 실패해도 이벤트 자체는 유효
  }

  return {
    eventId: result.event.id,
    firstScheduledRunId: result.firstScheduledRun.id,
    occurrencesPlanned: instances.length,
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
