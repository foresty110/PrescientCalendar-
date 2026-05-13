import { prisma } from "@/lib/db/client";
import { assertOwnership } from "@/lib/db/auth";

export interface FeasibilityResult {
  score: number | null; // 0..100, null이면 데이터 부족
  rationale: string;
  dataInsufficient: boolean;
  /** 디버깅·표시용 — 사용된 표본 수, 실행률, 평균 지연 */
  evidence: {
    sampleSize: number;
    executionRate: number; // 0..1
    avgDelayMin: number;
  };
}

const COLD_START_MIN_SAMPLES = 5;
const COLD_START_USER_AGE_DAYS = 14;
const LOOKBACK_WEEKS = 8;
const TIME_WINDOW_HOURS = 1; // ±1h

/**
 * 결정론적 feasibility 점수.
 *
 * 동일 사용자의 최근 8주 ActualRun 중 같은 시간대(±1h)와 같은 요일을 표본으로 삼아
 * 실행률·평균 지연을 가중치로 0..100 점수 산출. LLM 호출 없음 → 빠르고 테스트 가능.
 *
 * cold start 조건:
 * - 표본 < 5건
 * - 또는 사용자 가입 후 < 14일
 *
 * → score=null, dataInsufficient=true. UI는 회색 처리.
 */
export async function computeFeasibility(
  userId: string,
  scheduledRunId: string,
  now: Date = new Date(),
): Promise<FeasibilityResult> {
  const scheduledRun = await prisma.scheduledRun.findUnique({
    where: { id: scheduledRunId },
    select: { id: true, userId: true, scheduledStartAt: true },
  });
  assertOwnership(scheduledRun, userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });
  if (!user) {
    return insufficient("사용자 정보를 찾지 못함", { sampleSize: 0 });
  }

  const userAgeDays = (now.getTime() - user.createdAt.getTime()) / 86_400_000;
  if (userAgeDays < COLD_START_USER_AGE_DAYS) {
    return insufficient(`가입 후 ${Math.floor(userAgeDays)}일 — 데이터가 더 필요`, {
      sampleSize: 0,
    });
  }

  const samples = await collectSimilarRuns(userId, scheduledRun.scheduledStartAt, now);

  if (samples.length < COLD_START_MIN_SAMPLES) {
    return insufficient(
      `같은 시간대 표본 ${samples.length}건 — 최소 ${COLD_START_MIN_SAMPLES}건 필요`,
      { sampleSize: samples.length },
    );
  }

  const executed = samples.filter((s) => s.status !== "skipped").length;
  const executionRate = executed / samples.length;

  const delays = samples
    .filter((s) => s.status !== "skipped")
    .map((s) => Math.max(0, (s.actualStartAt.getTime() - s.scheduledStartAt.getTime()) / 60_000));
  const avgDelayMin = delays.length > 0 ? delays.reduce((a, b) => a + b, 0) / delays.length : 0;

  // 점수: 실행률을 기본점으로, 평균 지연 분당 1점 차감 (최대 -20)
  const base = executionRate * 100;
  const delayPenalty = Math.min(20, Math.round(avgDelayMin));
  const score = Math.max(0, Math.min(100, Math.round(base - delayPenalty)));

  return {
    score,
    rationale: buildRationale(samples.length, executionRate, avgDelayMin),
    dataInsufficient: false,
    evidence: {
      sampleSize: samples.length,
      executionRate,
      avgDelayMin: Math.round(avgDelayMin),
    },
  };
}

interface SampleRun {
  scheduledStartAt: Date;
  actualStartAt: Date;
  status: string;
}

async function collectSimilarRuns(
  userId: string,
  target: Date,
  now: Date,
): Promise<SampleRun[]> {
  const lookbackStart = new Date(now.getTime() - LOOKBACK_WEEKS * 7 * 86_400_000);

  // 모든 ActualRun을 8주 lookback으로 조회 후 코드에서 시간대·요일 필터
  // (Postgres에서 hour 추출은 timezone 의존이라 코드 필터가 단순)
  const rows = await prisma.actualRun.findMany({
    where: {
      userId,
      scheduledRun: { scheduledStartAt: { gte: lookbackStart, lte: now } },
    },
    include: {
      scheduledRun: { select: { scheduledStartAt: true } },
    },
  });

  const targetHour = target.getUTCHours() + target.getUTCMinutes() / 60;
  const targetDayOfWeek = target.getUTCDay();

  return rows
    .map((r) => ({
      scheduledStartAt: r.scheduledRun.scheduledStartAt,
      actualStartAt: r.actualStartAt,
      status: r.status,
    }))
    .filter((r) => {
      const h = r.scheduledStartAt.getUTCHours() + r.scheduledStartAt.getUTCMinutes() / 60;
      const sameWindow = Math.abs(h - targetHour) <= TIME_WINDOW_HOURS;
      const sameDow = r.scheduledStartAt.getUTCDay() === targetDayOfWeek;
      return sameWindow && sameDow;
    });
}

function buildRationale(sampleSize: number, executionRate: number, avgDelayMin: number): string {
  const ratePct = Math.round(executionRate * 100);
  const delay = Math.round(avgDelayMin);
  if (delay <= 3) {
    return `같은 시간대 최근 ${sampleSize}건 중 ${ratePct}% 실행, 거의 정시.`;
  }
  return `같은 시간대 최근 ${sampleSize}건 중 ${ratePct}% 실행, 평균 ${delay}분 지각 경향.`;
}

function insufficient(reason: string, evidence: { sampleSize: number }): FeasibilityResult {
  return {
    score: null,
    rationale: reason,
    dataInsufficient: true,
    evidence: { ...evidence, executionRate: 0, avgDelayMin: 0 },
  };
}

/**
 * ScheduledRun에 score 저장. dataInsufficient이면 null 유지.
 */
export async function persistFeasibilityScore(
  scheduledRunId: string,
  result: FeasibilityResult,
  modelVersion = "heuristic-v1",
): Promise<void> {
  await prisma.scheduledRun.update({
    where: { id: scheduledRunId },
    data: {
      feasibilityScore: result.score,
      feasibilityModelVersion: modelVersion,
      feasibilityComputedAt: new Date(),
    },
  });
}
