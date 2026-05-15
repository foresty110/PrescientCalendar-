import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { assertOwnership } from "@/lib/db/auth";
import { fromKstInput } from "@/lib/time";
import { expandRecurrence, type Recurrence } from "@/lib/recurrence";
import { computeFeasibility, persistFeasibilityScore } from "@/lib/db/feasibility";

export type { Recurrence } from "@/lib/recurrence";

export interface CreateEventInput {
  title: string;
  startAt: string;
  durationMin: number;
  recurrence?: Recurrence | null;
  /** 사전 메모 — 일정 카드 시간 범위 옆에 표시. 모든 ScheduledRun 인스턴스 공유. */
  description?: string | null;
}

export interface ConflictItem {
  scheduledRunId: string;
  title: string;
  startAt: Date;
}

export interface AlternativeSlot {
  /** 제안 시각 (ISO 문자열) — 다음 create_event 재호출에 그대로 사용 */
  startAt: string;
  /** 사용자에게 보일 자연어 라벨 — "30분 뒤" / "내일 같은 시각" */
  label: string;
}

/** create_event 의 두 갈래 결과. 도구 호출에서 OK/실패를 ok 플래그로 구분 — LLM 이 ok=false 면
 *  사용자에게 대안 카드 UI 가 자동 렌더되도록 안내만 한다 (긴 텍스트 X). 클라이언트는 ok=false
 *  결과를 ConflictAlternativesCard 로 인라인 렌더. */
export type CreateEventResult =
  | {
      ok: true;
      eventId: string;
      firstScheduledRunId: string;
      occurrencesPlanned: number;
    }
  | {
      ok: false;
      reason: "conflict";
      conflicts: ConflictItem[];
      suggestedAlternatives: AlternativeSlot[];
      /** 사용자가 '그래도 만들기' 누르면 LLM 이 이 입력에 force=true 를 더해 재호출 */
      originalInput: CreateEventInput;
    };

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

  // 충돌은 절대 허용 안 한다 — 사용자가 명시: "충돌이 절대 있어선 안 돼". UI 의 '그래도 만들기'
  // 우회 경로도 같이 제거됐다. 충돌이 있으면 항상 거부 + 대안 후보 반환.
  const conflicts = await findConflicts(userId, startAt, input.durationMin);
  if (conflicts.length > 0) {
    const suggestedAlternatives = await suggestAlternatives(
      userId,
      startAt,
      input.durationMin,
      now,
    );
    return {
      ok: false,
      reason: "conflict",
      conflicts,
      suggestedAlternatives,
      originalInput: input,
    };
  }

  const instances = expandRecurrence(startAt, input.recurrence ?? null, {
    now,
    horizonWeeks: RECURRENCE_HORIZON_WEEKS,
  });

  const result = await prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        userId,
        title: input.title,
        description: input.description ?? null,
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
    ok: true,
    eventId: result.event.id,
    firstScheduledRunId: result.firstScheduledRun.id,
    occurrencesPlanned: instances.length,
  };
}

/** 충돌이 발생한 baseStart 주변에서 충돌 없는 대안 시각 후보를 최대 4개 반환.
 *  오프셋 후보를 가까운 것부터 검사. 사용자 일정이 빽빽해 충돌이 많아도 충분한 후보를 보장하기
 *  위해 풀을 넓게 잡았다(±15·±30·±45·±60·±90·±120·+180·+24h·+48h). 과거 시각·또 충돌 나는
 *  시각은 자동 제외. */
async function suggestAlternatives(
  userId: string,
  baseStart: Date,
  durationMin: number,
  now: Date,
): Promise<AlternativeSlot[]> {
  const candidates: { offsetMin: number; label: string }[] = [
    { offsetMin: 15, label: "15분 뒤" },
    { offsetMin: -15, label: "15분 앞" },
    { offsetMin: 30, label: "30분 뒤" },
    { offsetMin: -30, label: "30분 앞" },
    { offsetMin: 45, label: "45분 뒤" },
    { offsetMin: -45, label: "45분 앞" },
    { offsetMin: 60, label: "1시간 뒤" },
    { offsetMin: -60, label: "1시간 앞" },
    { offsetMin: 90, label: "1시간 30분 뒤" },
    { offsetMin: -90, label: "1시간 30분 앞" },
    { offsetMin: 120, label: "2시간 뒤" },
    { offsetMin: -120, label: "2시간 앞" },
    { offsetMin: 180, label: "3시간 뒤" },
    { offsetMin: 24 * 60, label: "내일 같은 시각" },
    { offsetMin: 2 * 24 * 60, label: "모레 같은 시각" },
  ];

  const out: AlternativeSlot[] = [];
  for (const c of candidates) {
    if (out.length >= 4) break;
    const candidate = new Date(baseStart.getTime() + c.offsetMin * 60_000);
    if (candidate.getTime() < now.getTime()) continue; // 과거 시각 후보 제외
    const conflicts = await findConflicts(userId, candidate, durationMin);
    if (conflicts.length === 0) {
      out.push({ startAt: candidate.toISOString(), label: c.label });
    }
  }
  return out;
}

export interface ScheduledRunListItem {
  scheduledRunId: string;
  eventId: string;
  title: string;
  description: string | null;
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
      event: { select: { id: true, title: true, description: true } },
      actualRun: params.withActualRun ? true : false,
    },
    orderBy: { scheduledStartAt: "asc" },
  });

  return rows.map((r) => ({
    scheduledRunId: r.id,
    eventId: r.event.id,
    title: r.event.title,
    description: r.event.description,
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

export interface UpdateEventInput {
  title?: string;
  description?: string | null;
  recurrence?: Recurrence | null;
  defaultDurationMin?: number;
}

export interface UpdateEventResult {
  eventId: string;
  futureRunsDeleted: number;
  futureRunsCreated: number;
}

/**
 * Event 메타데이터 수정. recurrence가 바뀌면 미래 ScheduledRun (회고 없는 것)만
 * 재생성. 회고 있는 미래 인스턴스는 보존 (사용자가 이미 의존). 과거 인스턴스
 * 전부 보존.
 *
 * defaultDurationMin이 바뀌면 회고 없는 미래 ScheduledRun의 scheduledDurationMin도
 * 동기화. 회고 있는 건 보존.
 */
export async function updateEvent(
  userId: string,
  eventId: string,
  patch: UpdateEventInput,
  now: Date,
): Promise<UpdateEventResult> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, userId: true, defaultDurationMin: true, recurrence: true },
  });
  assertOwnership(event, userId);

  let futureRunsDeleted = 0;
  let futureRunsCreated = 0;

  await prisma.$transaction(async (tx) => {
    await tx.event.update({
      where: { id: eventId },
      data: {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.defaultDurationMin !== undefined
          ? { defaultDurationMin: patch.defaultDurationMin }
          : {}),
        ...(patch.recurrence !== undefined
          ? {
              recurrence: patch.recurrence
                ? (patch.recurrence as unknown as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            }
          : {}),
      },
    });

    if (patch.recurrence !== undefined) {
      const deleted = await tx.scheduledRun.deleteMany({
        where: {
          eventId,
          userId,
          scheduledStartAt: { gt: now },
          actualRun: { is: null },
        },
      });
      futureRunsDeleted = deleted.count;

      if (patch.recurrence) {
        const anchor = await tx.scheduledRun.findFirst({
          where: { eventId, userId },
          orderBy: { scheduledStartAt: "asc" },
          select: { scheduledStartAt: true, scheduledDurationMin: true },
        });
        const anchorAt = anchor?.scheduledStartAt ?? now;
        const durationMin =
          patch.defaultDurationMin ??
          anchor?.scheduledDurationMin ??
          event.defaultDurationMin;

        const instances = expandRecurrence(anchorAt, patch.recurrence, {
          now,
          horizonWeeks: RECURRENCE_HORIZON_WEEKS,
        }).filter((d) => d.getTime() > now.getTime());

        await Promise.all(
          instances.map((scheduledStartAt) =>
            tx.scheduledRun.create({
              data: { userId, eventId, scheduledStartAt, scheduledDurationMin: durationMin },
            }),
          ),
        );
        futureRunsCreated = instances.length;
      }
    } else if (patch.defaultDurationMin !== undefined) {
      await tx.scheduledRun.updateMany({
        where: {
          eventId,
          userId,
          scheduledStartAt: { gt: now },
          actualRun: { is: null },
        },
        data: { scheduledDurationMin: patch.defaultDurationMin },
      });
    }
  });

  return { eventId, futureRunsDeleted, futureRunsCreated };
}

export type DeleteScope = "all" | "future_only";

export interface DeleteEventResult {
  eventDeleted: boolean;
  deletedScheduledRuns: number;
}

/**
 * Event 또는 미래 ScheduledRun 삭제.
 *
 * - scope=all: Event row 삭제 → cascade로 모든 ScheduledRun·ActualRun 삭제
 * - scope=future_only: 회고 없는 미래 ScheduledRun만 삭제. Event + 과거·회고됨은 보존
 */
export async function deleteEvent(
  userId: string,
  eventId: string,
  scope: DeleteScope,
  now: Date,
): Promise<DeleteEventResult> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, userId: true },
  });
  assertOwnership(event, userId);

  if (scope === "all") {
    const count = await prisma.scheduledRun.count({ where: { eventId, userId } });
    await prisma.event.delete({ where: { id: eventId } });
    return { eventDeleted: true, deletedScheduledRuns: count };
  }

  const result = await prisma.scheduledRun.deleteMany({
    where: {
      eventId,
      userId,
      scheduledStartAt: { gt: now },
      actualRun: { is: null },
    },
  });
  return { eventDeleted: false, deletedScheduledRuns: result.count };
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
