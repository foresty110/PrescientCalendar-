/**
 * computeFeasibility v2 점수 산출 단위 테스트.
 *
 * DB 의존성은 vi.mock으로 끊고, 표본 셋을 직접 주입해 cold-start 분기 / 신뢰도 라벨 /
 * factors breakdown 의 존재성을 결정론으로 검증. 정확한 점수 값은 가중치 변경에 따라
 * 흔들리므로 범위 검증 위주.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findUserUnique: vi.fn(),
  findManyActualRun: vi.fn(),
  findManyScheduledRun: vi.fn(),
  updateScheduledRun: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    scheduledRun: {
      findUnique: mocks.findUnique,
      findMany: mocks.findManyScheduledRun,
      update: mocks.updateScheduledRun,
    },
    user: { findUnique: mocks.findUserUnique },
    actualRun: { findMany: mocks.findManyActualRun },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { computeFeasibility } from "@/lib/db/feasibility";

const { findUnique, findUserUnique, findManyActualRun, findManyScheduledRun, updateScheduledRun } =
  mocks;

const USER_ID = "u1";
const SCHEDULED_ID = "sr1";
const EVENT_ID = "e1";
const NOW = new Date("2026-05-12T00:00:00Z");
const CREATED_LONG_AGO = new Date("2026-01-01T00:00:00Z"); // 4개월 전

// 타겟: 같은 시간대 검색을 위해 KST 기준 화요일 07:00
const TARGET_AT = new Date("2026-05-11T22:00:00Z"); // = 5/12 화 07:00 KST

function mockScheduledRunOwner(target: Date = TARGET_AT, durationMin = 60) {
  findUnique.mockResolvedValue({
    id: SCHEDULED_ID,
    userId: USER_ID,
    scheduledStartAt: target,
    scheduledDurationMin: durationMin,
    eventId: EVENT_ID,
  });
}

function mockUserAge(createdAt: Date) {
  findUserUnique.mockResolvedValue({ createdAt });
}

function mockSamples(
  samples: { scheduledStartAt: Date; actualStartAt: Date; status: string }[],
) {
  findManyActualRun.mockResolvedValue(
    samples.map((s) => ({
      actualStartAt: s.actualStartAt,
      status: s.status,
      scheduledRun: { scheduledStartAt: s.scheduledStartAt, eventId: EVENT_ID },
    })),
  );
}

describe("computeFeasibility v2", () => {
  beforeEach(() => {
    findUnique.mockReset();
    findUserUnique.mockReset();
    findManyActualRun.mockReset();
    findManyScheduledRun.mockReset();
    updateScheduledRun.mockReset();
    findManyScheduledRun.mockResolvedValue([]); // 같은 날 다른 ScheduledRun 없음 기본
  });

  it("가입 14일 미만이면 cold start, 신뢰도=없음", async () => {
    mockScheduledRunOwner();
    mockUserAge(new Date("2026-05-05T00:00:00Z"));
    mockSamples([]);

    const result = await computeFeasibility(USER_ID, SCHEDULED_ID, NOW);
    expect(result.dataInsufficient).toBe(true);
    expect(result.score).toBeNull();
    expect(result.confidence).toBe("없음");
    expect(result.factors).toEqual([]);
    expect(result.alternatives).toEqual([]);
    expect(result.rationale).toMatch(/가입 후/);
  });

  it("표본 5건 미만이면 cold start, 신뢰도=없음", async () => {
    mockScheduledRunOwner();
    mockUserAge(CREATED_LONG_AGO);
    mockSamples(sample(3, { hour: 22, dow: 1, status: "done" }));

    const result = await computeFeasibility(USER_ID, SCHEDULED_ID, NOW);
    expect(result.dataInsufficient).toBe(true);
    expect(result.confidence).toBe("없음");
    expect(result.sampleSize).toBe(3);
  });

  it("100% 정시 실행 → 90 이상 + 신뢰도=낮음(5건)", async () => {
    mockScheduledRunOwner();
    mockUserAge(CREATED_LONG_AGO);
    mockSamples(sample(5, { hour: 22, dow: 1, status: "done", delayMin: 0 }));

    const result = await computeFeasibility(USER_ID, SCHEDULED_ID, NOW);
    expect(result.dataInsufficient).toBe(false);
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.confidence).toBe("낮음");
    expect(result.factors.length).toBeGreaterThan(0);
  });

  it("표본 10건이면 신뢰도=보통", async () => {
    mockScheduledRunOwner();
    mockUserAge(CREATED_LONG_AGO);
    mockSamples(sample(10, { hour: 22, dow: 1, status: "done", delayMin: 0 }));

    const result = await computeFeasibility(USER_ID, SCHEDULED_ID, NOW);
    expect(result.confidence).toBe("보통");
  });

  it("표본 20건이면 신뢰도=높음", async () => {
    mockScheduledRunOwner();
    mockUserAge(CREATED_LONG_AGO);
    mockSamples(sample(20, { hour: 22, dow: 1, status: "done", delayMin: 0 }));

    const result = await computeFeasibility(USER_ID, SCHEDULED_ID, NOW);
    expect(result.confidence).toBe("높음");
  });

  it("80% 실행 + 15분 평균 지연이면 50-80 범위", async () => {
    mockScheduledRunOwner();
    mockUserAge(CREATED_LONG_AGO);
    mockSamples([
      ...sample(8, { hour: 22, dow: 1, status: "done", delayMin: 15 }),
      ...sample(2, { hour: 22, dow: 1, status: "skipped" }),
    ]);

    const result = await computeFeasibility(USER_ID, SCHEDULED_ID, NOW);
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.score).toBeLessThanOrEqual(80);
    // 지연 페널티 factor 포함
    expect(result.factors.some((f) => f.key === "delay" && f.delta < 0)).toBe(true);
  });

  it("다른 요일·시간대 표본은 제외", async () => {
    mockScheduledRunOwner();
    mockUserAge(CREATED_LONG_AGO);
    mockSamples([
      ...sample(2, { hour: 22, dow: 1, status: "done" }),
      ...sample(10, { hour: 10, dow: 3, status: "done" }),
    ]);

    const result = await computeFeasibility(USER_ID, SCHEDULED_ID, NOW);
    expect(result.dataInsufficient).toBe(true);
    expect(result.sampleSize).toBe(2);
  });

  it("같은 날 다른 일정이 많으면 밀도 페널티 factor 포함", async () => {
    mockScheduledRunOwner();
    mockUserAge(CREATED_LONG_AGO);
    mockSamples(sample(10, { hour: 22, dow: 1, status: "done", delayMin: 0 }));
    findManyScheduledRun.mockResolvedValue([
      { scheduledStartAt: TARGET_AT, scheduledDurationMin: 60 },
      { scheduledStartAt: TARGET_AT, scheduledDurationMin: 60 },
      { scheduledStartAt: TARGET_AT, scheduledDurationMin: 60 },
    ]);

    const result = await computeFeasibility(USER_ID, SCHEDULED_ID, NOW);
    expect(result.factors.some((f) => f.key === "density" && f.delta < 0)).toBe(true);
  });

  it("긴 일정(>90분)이면 길이 페널티 factor 포함", async () => {
    mockScheduledRunOwner(TARGET_AT, 180); // 3시간
    mockUserAge(CREATED_LONG_AGO);
    mockSamples(sample(10, { hour: 22, dow: 1, status: "done", delayMin: 0 }));

    const result = await computeFeasibility(USER_ID, SCHEDULED_ID, NOW);
    expect(result.factors.some((f) => f.key === "length" && f.delta < 0)).toBe(true);
  });

  it("score는 0..100으로 클램프", async () => {
    mockScheduledRunOwner();
    mockUserAge(CREATED_LONG_AGO);
    mockSamples([
      ...sample(1, { hour: 22, dow: 1, status: "done", delayMin: 60 }),
      ...sample(9, { hour: 22, dow: 1, status: "skipped" }),
    ]);

    const result = await computeFeasibility(USER_ID, SCHEDULED_ID, NOW);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

/** 같은 시각·요일·상태의 표본 N개를 만드는 헬퍼. KST 변환 후 비교에 부합하도록 UTC 시각으로
 *  옵션 dow 요일을 맞춰 둠 (target 의 KST 화요일 07:00 과 매칭하려면 UTC dow=1, hour=22). */
function sample(
  count: number,
  opts: { hour: number; dow: number; status: string; delayMin?: number },
): { scheduledStartAt: Date; actualStartAt: Date; status: string }[] {
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(NOW.getTime() - (i + 1) * 7 * 86_400_000);
    while (d.getUTCDay() !== opts.dow) {
      d.setUTCDate(d.getUTCDate() - 1);
    }
    d.setUTCHours(opts.hour, 0, 0, 0);
    const actual = new Date(d.getTime() + (opts.delayMin ?? 0) * 60_000);
    out.push({
      scheduledStartAt: new Date(d),
      actualStartAt: actual,
      status: opts.status,
    });
  }
  return out;
}
