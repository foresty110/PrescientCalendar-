import { prisma } from "@/lib/db/client";
import { assertOwnership } from "@/lib/db/auth";

export interface UserPatternQuery {
  /** Event.id 또는 title 키워드 (대소문자 무시 substring) */
  eventIdOrKeyword: string;
  since: Date;
  until?: Date;
}

export interface UserPatternStats {
  totalScheduled: number;
  executed: number;
  skipped: number;
  late: number;
  avgDelayMin: number; // 실제 시작 - 예정 시작, 양수만 평균 (지각만)
  executionRate: number; // executed / totalScheduled (0..1), totalScheduled=0이면 0
}

/**
 * 회고 통계 — 특정 이벤트(또는 키워드 일치 이벤트들)의 since..until 범위 ScheduledRun을 보고
 * 실행률·지각률·평균 지연을 집계.
 *
 * IDOR 방어: eventId가 cuid 형식이면 owner 검증. 키워드면 userId 필터로 자연 격리.
 */
export async function queryUserPattern(
  userId: string,
  q: UserPatternQuery,
): Promise<UserPatternStats> {
  const eventIds = await resolveEventIds(userId, q.eventIdOrKeyword);

  if (eventIds.length === 0) {
    return emptyStats();
  }

  const until = q.until ?? new Date();

  const runs = await prisma.scheduledRun.findMany({
    where: {
      userId,
      eventId: { in: eventIds },
      scheduledStartAt: { gte: q.since, lte: until },
    },
    select: {
      scheduledStartAt: true,
      actualRun: {
        select: { actualStartAt: true, status: true },
      },
    },
  });

  return aggregate(runs);
}

async function resolveEventIds(userId: string, eventIdOrKeyword: string): Promise<string[]> {
  // cuid는 25자 영숫자로 시작. 대략 길이 20+면 id 시도, 아니면 키워드 검색
  const looksLikeId = /^c[a-z0-9]{20,}$/.test(eventIdOrKeyword);

  if (looksLikeId) {
    const event = await prisma.event.findUnique({
      where: { id: eventIdOrKeyword },
      select: { id: true, userId: true },
    });
    if (!event) return [];
    assertOwnership(event, userId);
    return [event.id];
  }

  const events = await prisma.event.findMany({
    where: {
      userId,
      title: { contains: eventIdOrKeyword, mode: "insensitive" },
    },
    select: { id: true },
  });
  return events.map((e) => e.id);
}

function emptyStats(): UserPatternStats {
  return {
    totalScheduled: 0,
    executed: 0,
    skipped: 0,
    late: 0,
    avgDelayMin: 0,
    executionRate: 0,
  };
}

function aggregate(
  runs: { scheduledStartAt: Date; actualRun: { actualStartAt: Date; status: string } | null }[],
): UserPatternStats {
  const total = runs.length;
  if (total === 0) return emptyStats();

  let executed = 0;
  let skipped = 0;
  let late = 0;
  let delaySum = 0;
  let delayCount = 0;

  for (const r of runs) {
    if (!r.actualRun) continue; // 미회고 — 어디로도 카운트 안 함
    if (r.actualRun.status === "done") executed += 1;
    else if (r.actualRun.status === "late") {
      late += 1;
      executed += 1; // 지각도 결국 실행됨
    } else if (r.actualRun.status === "skipped") skipped += 1;

    if (r.actualRun.status !== "skipped") {
      const delay = (r.actualRun.actualStartAt.getTime() - r.scheduledStartAt.getTime()) / 60_000;
      if (delay > 0) {
        delaySum += delay;
        delayCount += 1;
      }
    }
  }

  return {
    totalScheduled: total,
    executed,
    skipped,
    late,
    avgDelayMin: delayCount > 0 ? Math.round(delaySum / delayCount) : 0,
    executionRate: total > 0 ? executed / total : 0,
  };
}
