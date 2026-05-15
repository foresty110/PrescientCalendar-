/**
 * 데모/테스트용 시드 — 한 사용자에게 사람이 일반적으로 잡는 5개 일정 시나리오를
 * 과거 8주치 회고와 미래 4주치 예정 인스턴스로 만들어 넣는다.
 *
 * 목적: 실현 가능성 점수의 cold-start 가드(가입 14일 이내 또는 같은 시간대 표본
 * 5건 미만)를 통과시켜 데모 시 점수 카드와 색 점이 의미있게 나오게 하는 것.
 *
 * 동작:
 * - User.createdAt 을 30일 전으로 밀어 14일 가드 통과
 * - 5개 시나리오 각각 Event + 과거 ScheduledRun + ActualRun + 미래 ScheduledRun 생성
 * - 트랜잭션 안에서 한 번에 처리 (부분 실패 시 롤백)
 * - 트랜잭션 커밋 후 미래 ScheduledRun 각각에 대해 feasibility 점수 계산·저장
 *
 * 멱등성: 부르면 매번 새로 생성한다 (중복 방지는 호출자 책임 — UI 가 한 번 누름).
 * 시드된 일정은 description 앞머리 "[테스트 데이터]" 로 마크해 추후 삭제 식별 가능.
 */
import { Prisma } from "@prisma/client";
import { fromZonedTime } from "date-fns-tz";

import { prisma } from "@/lib/db/client";
import { computeFeasibility, persistFeasibilityScore } from "@/lib/db/feasibility";
import { KST } from "@/lib/time";
import type { Recurrence, WeekDay } from "@/lib/recurrence";

interface SeedScenario {
  title: string;
  description: string;
  /** KST 시각 (0-23) */
  hour: number;
  minute: number;
  durationMin: number;
  recurrence: Recurrence;
  /** 0..1 — 같은 시간대 ScheduledRun 중 실제 실행(done/late)으로 회고된 비율. 나머지는 skipped */
  executionRate: number;
  /** 분 단위 평균 지연. 정규분포 노이즈 σ=3 추가, 음수는 0으로 클램프 */
  avgDelayMin: number;
}

const SEED_SCENARIOS: readonly SeedScenario[] = [
  {
    title: "아침 운동",
    description: "[테스트 데이터] 헬스장 또는 홈트레이닝",
    hour: 7,
    minute: 0,
    durationMin: 60,
    recurrence: { freq: "WEEKLY", byDay: ["MO", "WE", "FR"] },
    executionRate: 0.7,
    avgDelayMin: 5,
  },
  {
    title: "출근",
    description: "[테스트 데이터] 사무실",
    hour: 9,
    minute: 0,
    durationMin: 480,
    recurrence: { freq: "WEEKLY", byDay: ["MO", "TU", "WE", "TH", "FR"] },
    executionRate: 0.95,
    avgDelayMin: 2,
  },
  {
    title: "팀 주간 미팅",
    description: "[테스트 데이터] 동기화 미팅",
    hour: 14,
    minute: 0,
    durationMin: 60,
    recurrence: { freq: "WEEKLY", byDay: ["TU"] },
    executionRate: 0.92,
    avgDelayMin: 1,
  },
  {
    title: "독서",
    description: "[테스트 데이터] 자기 전 책 30분",
    hour: 22,
    minute: 0,
    durationMin: 30,
    recurrence: { freq: "DAILY" },
    executionRate: 0.5,
    avgDelayMin: 8,
  },
  {
    title: "저녁 산책",
    description: "[테스트 데이터] 30분 가볍게",
    hour: 19,
    minute: 30,
    durationMin: 30,
    recurrence: { freq: "WEEKLY", byDay: ["TU", "TH", "SA"] },
    executionRate: 0.6,
    avgDelayMin: 3,
  },
] as const;

const PAST_WEEKS = 8;
const FUTURE_WEEKS = 4;
const USER_CREATED_DAYS_AGO = 30;

const WEEKDAY_TO_JS: Record<WeekDay, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

export interface SeedResult {
  eventsCreated: number;
  scheduledRunsCreated: number;
  actualRunsCreated: number;
  feasibilityScoresComputed: number;
}

export async function seedTestData(userId: string, now: Date): Promise<SeedResult> {
  const startDateStr = kstDateString(addDaysUtc(now, -PAST_WEEKS * 7));
  const endDateStr = kstDateString(addDaysUtc(now, FUTURE_WEEKS * 7));

  let eventsCreated = 0;
  let scheduledRunsCreated = 0;
  let actualRunsCreated = 0;
  const futureRunIds: string[] = [];

  await prisma.$transaction(
    async (tx) => {
      // 1) User.createdAt 을 과거로 — cold-start 의 가입 14일 가드를 풀어줌.
      //    실제 사용자가 그보다 더 오래 전에 가입했어도, 이 시점에서 더 과거로 옮기지는 않게
      //    Math.min 처리할까 했지만, 데모 단순화를 위해 항상 덮어쓴다.
      const targetCreatedAt = new Date(now.getTime() - USER_CREATED_DAYS_AGO * 86_400_000);
      await tx.user.update({
        where: { id: userId },
        data: { createdAt: targetCreatedAt },
      });

      for (const scenario of SEED_SCENARIOS) {
        const occurrences = collectOccurrences(scenario, startDateStr, endDateStr);
        if (occurrences.length === 0) continue;

        const event = await tx.event.create({
          data: {
            userId,
            title: scenario.title,
            description: scenario.description,
            defaultDurationMin: scenario.durationMin,
            recurrence: scenario.recurrence as unknown as Prisma.InputJsonValue,
          },
          select: { id: true },
        });
        eventsCreated++;

        await tx.scheduledRun.createMany({
          data: occurrences.map((start) => ({
            userId,
            eventId: event.id,
            scheduledStartAt: start,
            scheduledDurationMin: scenario.durationMin,
          })),
        });
        scheduledRunsCreated += occurrences.length;

        // createMany 는 ID 를 반환하지 않으므로 다시 조회.
        const runs = await tx.scheduledRun.findMany({
          where: { eventId: event.id },
          select: { id: true, scheduledStartAt: true },
          orderBy: { scheduledStartAt: "asc" },
        });

        const actualRunRows = [] as {
          userId: string;
          scheduledRunId: string;
          actualStartAt: Date;
          actualDurationMin: number;
          status: "done" | "skipped" | "late";
        }[];

        for (const run of runs) {
          if (run.scheduledStartAt.getTime() >= now.getTime()) {
            futureRunIds.push(run.id);
            continue;
          }
          const actual = synthActualRun(scenario, run.scheduledStartAt);
          actualRunRows.push({
            userId,
            scheduledRunId: run.id,
            actualStartAt: actual.actualStartAt,
            actualDurationMin: actual.actualDurationMin,
            status: actual.status,
          });
        }

        if (actualRunRows.length > 0) {
          await tx.actualRun.createMany({ data: actualRunRows });
          actualRunsCreated += actualRunRows.length;
        }
      }
    },
    { timeout: 30_000 },
  );

  // 2) 미래 인스턴스마다 feasibility 점수 계산·저장. 트랜잭션 밖에서 — 한 건 실패해도
  //    seed 전체를 롤백할 필요가 없는 best-effort 경로.
  let feasibilityScoresComputed = 0;
  for (const runId of futureRunIds) {
    try {
      const result = await computeFeasibility(userId, runId, now);
      await persistFeasibilityScore(runId, result);
      if (result.score !== null) feasibilityScoresComputed++;
    } catch (e) {
      console.warn("[seedTestData] feasibility compute failed:", runId, e);
    }
  }

  return {
    eventsCreated,
    scheduledRunsCreated,
    actualRunsCreated,
    feasibilityScoresComputed,
  };
}

// ---------------------------------------------------------------------------
// 시각 헬퍼 — 모두 KST 기준 도메인을 다루고 UTC Date 로 변환
// ---------------------------------------------------------------------------

function kstDateString(d: Date): string {
  // KST = UTC+9 고정. 12:00 KST = 03:00 UTC 같은 날짜.
  // formatInTimeZone 안 쓰고 직접 계산하면 한 줄짜리 의존성 줄이기.
  const utcMs = d.getTime();
  const kstMs = utcMs + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  return kst.toISOString().slice(0, 10);
}

function kstDayOfWeek(dateStr: string): number {
  // dateStr 은 KST 기준 YYYY-MM-DD. 정오로 잡아 UTC 03:00 같은 날.
  return new Date(`${dateStr}T03:00:00.000Z`).getUTCDay();
}

function nextDayStr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function kstDateTimeToUtc(dateStr: string, hour: number, minute: number): Date {
  return fromZonedTime(`${dateStr}T${pad2(hour)}:${pad2(minute)}:00`, KST);
}

function addDaysUtc(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

function scenarioAppliesOn(scenario: SeedScenario, dow: number): boolean {
  if (scenario.recurrence.freq === "DAILY") return true;
  if (scenario.recurrence.freq === "WEEKLY" && scenario.recurrence.byDay) {
    return scenario.recurrence.byDay.some(
      // eslint-disable-next-line security/detect-object-injection -- d 는 WeekDay union, 외부 입력 아님
      (d) => WEEKDAY_TO_JS[d] === dow,
    );
  }
  return false;
}

function collectOccurrences(
  scenario: SeedScenario,
  startDateStr: string,
  endDateStr: string,
): Date[] {
  const out: Date[] = [];
  let cur = startDateStr;
  while (cur < endDateStr) {
    if (scenarioAppliesOn(scenario, kstDayOfWeek(cur))) {
      out.push(kstDateTimeToUtc(cur, scenario.hour, scenario.minute));
    }
    cur = nextDayStr(cur);
  }
  return out;
}

// ---------------------------------------------------------------------------
// ActualRun 합성기 — 사용자별 실행 패턴을 시뮬레이션
// ---------------------------------------------------------------------------

interface SynthActualRun {
  actualStartAt: Date;
  actualDurationMin: number;
  status: "done" | "skipped" | "late";
}

function synthActualRun(scenario: SeedScenario, scheduledStartAt: Date): SynthActualRun {
  // 보안 무관 — 데모용 가짜 데이터 생성기. Math.random 충분.
  if (Math.random() > scenario.executionRate) {
    return {
      actualStartAt: scheduledStartAt,
      actualDurationMin: 0,
      status: "skipped",
    };
  }

  const delayMin = Math.max(0, Math.round(gaussNoise(scenario.avgDelayMin, 3)));
  const durationNoise = Math.round(gaussNoise(0, 5));
  const actualStartAt = new Date(scheduledStartAt.getTime() + delayMin * 60_000);
  const actualDurationMin = Math.max(5, scenario.durationMin + durationNoise);
  const status: "done" | "late" = delayMin > 15 ? "late" : "done";

  return { actualStartAt, actualDurationMin, status };
}

/** Box-Muller 변환으로 정규분포 샘플 1개. 데모 데이터용이라 충실도 X. */
function gaussNoise(mean: number, std: number): number {
  const u1 = Math.random() || 1e-6;
  const u2 = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
