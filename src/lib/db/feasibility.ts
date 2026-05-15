/**
 * 실현 가능성 점수 v2 — 결정론적 가중 합 공식.
 *
 * 베이스 = 같은 시간대(±1h)·같은 요일 ActualRun 실행률 × 100 (최근성 가중치)
 *
 * 가산 보너스
 *   + eventBonus       : 같은 eventId 전체 실행률 보정 (±10)
 *   + streakBonus      : 직전 3건 연속 실행/스킵 (±5)
 *
 * 감점 페널티
 *   − delayPenalty     : 평균 지연 분 (최대 15)
 *   − densityPenalty   : 그 날 같은 사용자의 다른 ScheduledRun 개수 × 1.5 (최대 15)
 *   − lengthPenalty    : 90분 초과 부분 30분당 -2 (최대 10)
 *
 * 신뢰도 5단계 (sampleSize 기준): 매우높음 ≥30 / 높음 ≥20 / 보통 ≥10 / 낮음 ≥5 / 없음 <5.
 * 표본 < 5 또는 가입 < 14일이면 score=null, dataInsufficient=true.
 *
 * 대안 시나리오: 시각 ±60 / ±90, 일정 길이 절반 후보에 같은 공식을 메모리에서 다시 적용해
 * 예상 점수를 함께 반환. 사용자가 "어떻게 하면 더 잘 지킬 수 있는지" 를 카드 UI 에서 즉시 비교.
 */
import { prisma } from "@/lib/db/client";
import { assertOwnership } from "@/lib/db/auth";

export type ConfidenceLevel = "매우높음" | "높음" | "보통" | "낮음" | "없음";

export interface FeasibilityFactor {
  /** 안정 식별자 — UI 가 아이콘/색 분기에 사용. */
  key: "executionRate" | "delay" | "density" | "event" | "streak" | "length";
  /** 사용자 노출용 짧은 라벨 */
  label: string;
  /** 사용자에게 보일 디테일 (예: "최근 12건 중 9건 실행", "평균 5분 지연") */
  detail: string;
  /** 점수 기여도 (signed). UI 에 "+5" / "-7" 형태로 표시. */
  delta: number;
}

export interface AlternativeScenario {
  /** "1시간 앞당기기" 같은 짧은 라벨 */
  label: string;
  /** 같은 공식을 후보 조건에 다시 적용한 결과 (0..100) */
  expectedScore: number;
  /** 부연 설명 — 어떤 시각·소요로 바뀌는지 */
  note: string;
}

export interface FeasibilityResult {
  score: number | null;
  rationale: string;
  dataInsufficient: boolean;
  confidence: ConfidenceLevel;
  sampleSize: number;
  factors: FeasibilityFactor[];
  alternatives: AlternativeScenario[];
  evidence: {
    sampleSize: number;
    executionRate: number;
    avgDelayMin: number;
  };
}

const COLD_START_MIN_SAMPLES = 5;
const COLD_START_USER_AGE_DAYS = 14;
const LOOKBACK_WEEKS = 8;
const TIME_WINDOW_HOURS = 1; // ±1h
const RECENCY_MIN_WEIGHT = 0.4; // 8주 전 표본의 가중치 (1.0 → 0.4 선형 감쇠)

const DELAY_PENALTY_MAX = 15;
const DENSITY_PENALTY_PER_RUN = 1.5;
const DENSITY_PENALTY_MAX = 15;
const LENGTH_PENALTY_THRESHOLD_MIN = 90;
const LENGTH_PENALTY_PER_30_MIN = 2;
const LENGTH_PENALTY_MAX = 10;
const EVENT_BONUS_RANGE = 10;
const STREAK_BONUS_VALUE = 5;
const STREAK_WINDOW = 3;

interface RawActualRun {
  scheduledStartAt: Date;
  actualStartAt: Date;
  status: "done" | "skipped" | "late";
  eventId: string;
}

interface RawScheduledRun {
  scheduledStartAt: Date;
  scheduledDurationMin: number;
}

export async function computeFeasibility(
  userId: string,
  scheduledRunId: string,
  now: Date = new Date(),
): Promise<FeasibilityResult> {
  const scheduledRun = await prisma.scheduledRun.findUnique({
    where: { id: scheduledRunId },
    select: {
      id: true,
      userId: true,
      scheduledStartAt: true,
      scheduledDurationMin: true,
      eventId: true,
    },
  });
  assertOwnership(scheduledRun, userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });
  if (!user) return insufficient("사용자 정보를 찾지 못함", 0);

  const userAgeDays = (now.getTime() - user.createdAt.getTime()) / 86_400_000;
  if (userAgeDays < COLD_START_USER_AGE_DAYS) {
    return insufficient(
      `가입 후 ${Math.floor(userAgeDays)}일 — 데이터가 더 필요`,
      0,
    );
  }

  const lookbackStart = new Date(now.getTime() - LOOKBACK_WEEKS * 7 * 86_400_000);
  const [allActualRuns, sameDayOtherRuns] = await Promise.all([
    fetchActualRunsInRange(userId, lookbackStart, now),
    fetchOtherRunsOnSameKstDay(userId, scheduledRun.scheduledStartAt, scheduledRun.id),
  ]);

  const baseSamples = filterSimilarSamples(allActualRuns, scheduledRun.scheduledStartAt);
  if (baseSamples.length < COLD_START_MIN_SAMPLES) {
    return insufficient(
      `같은 시간대 표본 ${baseSamples.length}건 — 최소 ${COLD_START_MIN_SAMPLES}건 필요`,
      baseSamples.length,
    );
  }

  const base = scoreFromInputs(
    baseSamples,
    allActualRuns,
    sameDayOtherRuns.length,
    scheduledRun.scheduledDurationMin,
    scheduledRun.eventId,
    now,
  );

  const alternatives = computeAlternatives(
    allActualRuns,
    scheduledRun.scheduledStartAt,
    scheduledRun.scheduledDurationMin,
    scheduledRun.eventId,
    sameDayOtherRuns.length,
    base.score,
    now,
  );

  return {
    score: base.score,
    rationale: buildRationale(baseSamples.length, base.executionRate, base.avgDelayMin),
    dataInsufficient: false,
    confidence: pickConfidence(baseSamples.length),
    sampleSize: baseSamples.length,
    factors: base.factors,
    alternatives,
    evidence: {
      sampleSize: baseSamples.length,
      executionRate: base.executionRate,
      avgDelayMin: Math.round(base.avgDelayMin),
    },
  };
}

/**
 * ScheduledRun에 score 저장. dataInsufficient이면 null 유지.
 */
export async function persistFeasibilityScore(
  scheduledRunId: string,
  result: FeasibilityResult,
  modelVersion = "heuristic-v2",
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

// ---------------------------------------------------------------------------
// 코어 — 입력(표본·후보 시각·길이·이벤트) 에서 점수·factors 산출
// ---------------------------------------------------------------------------

interface ScoreOutput {
  score: number;
  executionRate: number;
  avgDelayMin: number;
  factors: FeasibilityFactor[];
}

function scoreFromInputs(
  samples: RawActualRun[],
  allRuns: RawActualRun[],
  sameDayOtherCount: number,
  durationMin: number,
  eventId: string,
  now: Date,
): ScoreOutput {
  // 최근성 가중치 적용 실행률
  const weighted = computeWeightedExecutionRate(samples, now);
  const avgDelayMin = computeAvgDelay(samples);

  const factors: FeasibilityFactor[] = [];

  // 베이스 — 실행률 그대로 점수
  const baseScore = weighted.weightedRate * 100;
  factors.push({
    key: "executionRate",
    label: "같은 시간대 실행률",
    detail: `최근 ${samples.length}건 중 ${Math.round(weighted.weightedRate * 100)}% 실행`,
    delta: Math.round(baseScore - 50), // 50% 기준 ±편차로 표시
  });

  // 지연 페널티
  const delayPenalty = Math.min(DELAY_PENALTY_MAX, Math.round(avgDelayMin));
  if (delayPenalty > 0) {
    factors.push({
      key: "delay",
      label: "평균 지연",
      detail: `평균 ${Math.round(avgDelayMin)}분 늦게 시작`,
      delta: -delayPenalty,
    });
  }

  // 밀도 페널티 (같은 날 다른 ScheduledRun 개수)
  const densityPenalty = Math.min(
    DENSITY_PENALTY_MAX,
    Math.round(sameDayOtherCount * DENSITY_PENALTY_PER_RUN),
  );
  if (densityPenalty > 0) {
    factors.push({
      key: "density",
      label: "같은 날 일정 밀도",
      detail: `다른 일정 ${sameDayOtherCount}건이 같은 날`,
      delta: -densityPenalty,
    });
  }

  // 길이 페널티
  const lengthOver = Math.max(0, durationMin - LENGTH_PENALTY_THRESHOLD_MIN);
  const lengthPenalty = Math.min(
    LENGTH_PENALTY_MAX,
    Math.round((lengthOver / 30) * LENGTH_PENALTY_PER_30_MIN),
  );
  if (lengthPenalty > 0) {
    factors.push({
      key: "length",
      label: "긴 일정",
      detail: `${durationMin}분 (90분 기준 초과)`,
      delta: -lengthPenalty,
    });
  }

  // 이벤트 자체 보너스
  const eventBonus = computeEventBonus(allRuns, eventId);
  if (eventBonus.delta !== 0) {
    factors.push({
      key: "event",
      label: "이 일정 종류 패턴",
      detail: eventBonus.detail,
      delta: eventBonus.delta,
    });
  }

  // 연속 실행 streak 보너스
  const streakBonus = computeStreakBonus(allRuns);
  if (streakBonus.delta !== 0) {
    factors.push({
      key: "streak",
      label: "최근 흐름",
      detail: streakBonus.detail,
      delta: streakBonus.delta,
    });
  }

  const sumDeltas =
    Math.round(baseScore) - 50 // base 의 50 초과/미만 분
    - delayPenalty
    - densityPenalty
    - lengthPenalty
    + eventBonus.delta
    + streakBonus.delta;
  const score = clamp(0, 100, Math.round(50 + sumDeltas));

  return {
    score,
    executionRate: weighted.weightedRate,
    avgDelayMin,
    factors,
  };
}

interface WeightedRate {
  weightedRate: number;
  totalWeight: number;
}

/** 최근일수록 무거운 가중치 (1.0 → RECENCY_MIN_WEIGHT 선형). 실행=1, 스킵=0. */
function computeWeightedExecutionRate(
  samples: RawActualRun[],
  now: Date,
): WeightedRate {
  if (samples.length === 0) return { weightedRate: 0, totalWeight: 0 };

  const lookbackMs = LOOKBACK_WEEKS * 7 * 86_400_000;
  let weightedSum = 0;
  let totalWeight = 0;
  for (const s of samples) {
    const ageMs = now.getTime() - s.scheduledStartAt.getTime();
    const ageRatio = Math.min(1, Math.max(0, ageMs / lookbackMs));
    const weight = 1 - ageRatio * (1 - RECENCY_MIN_WEIGHT);
    const executed = s.status === "skipped" ? 0 : 1;
    weightedSum += weight * executed;
    totalWeight += weight;
  }
  return {
    weightedRate: totalWeight > 0 ? weightedSum / totalWeight : 0,
    totalWeight,
  };
}

function computeAvgDelay(samples: RawActualRun[]): number {
  const executed = samples.filter((s) => s.status !== "skipped");
  if (executed.length === 0) return 0;
  const delays = executed.map((s) =>
    Math.max(0, (s.actualStartAt.getTime() - s.scheduledStartAt.getTime()) / 60_000),
  );
  return delays.reduce((a, b) => a + b, 0) / executed.length;
}

function computeEventBonus(
  allRuns: RawActualRun[],
  eventId: string,
): { delta: number; detail: string } {
  const sameEventRuns = allRuns.filter((r) => r.eventId === eventId);
  if (sameEventRuns.length === 0) {
    return { delta: 0, detail: "이 일정 종류는 표본 없음" };
  }
  const executed = sameEventRuns.filter((r) => r.status !== "skipped").length;
  const rate = executed / sameEventRuns.length;
  const delta = Math.round(((rate - 0.5) * 2) * EVENT_BONUS_RANGE * 0.5);
  // (rate - 0.5) * 2 ∈ [-1, 1] → * (BONUS_RANGE/2) ∈ [-5, 5]. 합리적 범위.
  return {
    delta,
    detail: `이 일정은 평소 ${Math.round(rate * 100)}% 실행 (${sameEventRuns.length}건)`,
  };
}

function computeStreakBonus(allRuns: RawActualRun[]): {
  delta: number;
  detail: string;
} {
  const recent = [...allRuns]
    .sort((a, b) => b.scheduledStartAt.getTime() - a.scheduledStartAt.getTime())
    .slice(0, STREAK_WINDOW);
  if (recent.length < STREAK_WINDOW) {
    return { delta: 0, detail: "최근 흐름 표본 부족" };
  }
  const allExecuted = recent.every((r) => r.status !== "skipped");
  const allSkipped = recent.every((r) => r.status === "skipped");
  if (allExecuted) {
    return { delta: STREAK_BONUS_VALUE, detail: `직전 ${STREAK_WINDOW}건 연속 실행` };
  }
  if (allSkipped) {
    return { delta: -STREAK_BONUS_VALUE, detail: `직전 ${STREAK_WINDOW}건 연속 스킵` };
  }
  return { delta: 0, detail: "최근 흐름 혼재" };
}

// ---------------------------------------------------------------------------
// 대안 시나리오
// ---------------------------------------------------------------------------

function computeAlternatives(
  allActualRuns: RawActualRun[],
  scheduledStartAt: Date,
  durationMin: number,
  eventId: string,
  sameDayOtherCount: number,
  baseScore: number,
  now: Date,
): AlternativeScenario[] {
  const candidates: { label: string; startAt: Date; durationMin: number; note: string }[] = [
    {
      label: "1시간 앞당기기",
      startAt: new Date(scheduledStartAt.getTime() - 60 * 60_000),
      durationMin,
      note: "같은 요일·1시간 앞 시간대",
    },
    {
      label: "1시간 뒤로",
      startAt: new Date(scheduledStartAt.getTime() + 60 * 60_000),
      durationMin,
      note: "같은 요일·1시간 뒤 시간대",
    },
    {
      label: "절반 길이로 짧게",
      startAt: scheduledStartAt,
      durationMin: Math.max(5, Math.round(durationMin / 2)),
      note: `${Math.max(5, Math.round(durationMin / 2))}분으로 줄여서`,
    },
  ];

  const out: AlternativeScenario[] = [];
  for (const c of candidates) {
    const samples = filterSimilarSamples(allActualRuns, c.startAt);
    if (samples.length < COLD_START_MIN_SAMPLES) continue; // 후보 시각의 표본도 부족하면 제외
    const result = scoreFromInputs(
      samples,
      allActualRuns,
      sameDayOtherCount,
      c.durationMin,
      eventId,
      now,
    );
    // 개선 폭이 양수인 경우만 노출 — "어떻게 하면 올라갈까" 가 목적
    if (result.score > baseScore) {
      out.push({
        label: c.label,
        expectedScore: result.score,
        note: c.note,
      });
    }
  }
  // 개선 폭 큰 순
  out.sort((a, b) => b.expectedScore - a.expectedScore);
  return out;
}

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function pickConfidence(sampleSize: number): ConfidenceLevel {
  if (sampleSize >= 30) return "매우높음";
  if (sampleSize >= 20) return "높음";
  if (sampleSize >= 10) return "보통";
  if (sampleSize >= 5) return "낮음";
  return "없음";
}

function clamp(min: number, max: number, v: number): number {
  return Math.max(min, Math.min(max, v));
}

function filterSimilarSamples(
  all: RawActualRun[],
  target: Date,
): RawActualRun[] {
  const targetHour = getKstHourFractional(target);
  const targetDow = getKstDayOfWeek(target);
  return all.filter((r) => {
    const h = getKstHourFractional(r.scheduledStartAt);
    const sameWindow = Math.abs(h - targetHour) <= TIME_WINDOW_HOURS;
    const sameDow = getKstDayOfWeek(r.scheduledStartAt) === targetDow;
    return sameWindow && sameDow;
  });
}

function getKstHourFractional(d: Date): number {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.getUTCHours() + kst.getUTCMinutes() / 60;
}

function getKstDayOfWeek(d: Date): number {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.getUTCDay();
}

function getKstDayKey(d: Date): string {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function fetchActualRunsInRange(
  userId: string,
  from: Date,
  to: Date,
): Promise<RawActualRun[]> {
  const rows = await prisma.actualRun.findMany({
    where: {
      userId,
      scheduledRun: { scheduledStartAt: { gte: from, lte: to } },
    },
    include: {
      scheduledRun: {
        select: { scheduledStartAt: true, eventId: true },
      },
    },
  });
  return rows.map((r) => ({
    scheduledStartAt: r.scheduledRun.scheduledStartAt,
    actualStartAt: r.actualStartAt,
    status: r.status,
    eventId: r.scheduledRun.eventId,
  }));
}

async function fetchOtherRunsOnSameKstDay(
  userId: string,
  scheduledStartAt: Date,
  excludeId: string,
): Promise<RawScheduledRun[]> {
  // 해당 KST 날짜의 자정~다음날 자정 사이 ScheduledRun (현재 일정 제외)
  const dayKey = getKstDayKey(scheduledStartAt);
  const dayStartMs = new Date(`${dayKey}T00:00:00.000Z`).getTime() - 9 * 60 * 60 * 1000;
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;

  const rows = await prisma.scheduledRun.findMany({
    where: {
      userId,
      id: { not: excludeId },
      scheduledStartAt: { gte: new Date(dayStartMs), lt: new Date(dayEndMs) },
    },
    select: { scheduledStartAt: true, scheduledDurationMin: true },
  });
  return rows;
}

function buildRationale(
  sampleSize: number,
  executionRate: number,
  avgDelayMin: number,
): string {
  const ratePct = Math.round(executionRate * 100);
  const delay = Math.round(avgDelayMin);
  if (delay <= 3) {
    return `같은 시간대 최근 ${sampleSize}건 중 ${ratePct}% 실행, 거의 정시.`;
  }
  return `같은 시간대 최근 ${sampleSize}건 중 ${ratePct}% 실행, 평균 ${delay}분 지연.`;
}

function insufficient(reason: string, sampleSize: number): FeasibilityResult {
  return {
    score: null,
    rationale: reason,
    dataInsufficient: true,
    confidence: "없음",
    sampleSize,
    factors: [],
    alternatives: [],
    evidence: { sampleSize, executionRate: 0, avgDelayMin: 0 },
  };
}
