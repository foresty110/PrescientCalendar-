/**
 * computeFeasibility 점수 산출 로직 단위 테스트.
 *
 * DB 의존성은 vi.mock으로 끊고, 표본 셋을 직접 주입해 점수·rationale·cold-start 분기를
 * 결정론으로 검증.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted: vi.mock factory가 호이스팅되므로 같은 시점에 평가될 mock fn들도 함께 호이스팅
const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findUserUnique: vi.fn(),
  findManyActualRun: vi.fn(),
  updateScheduledRun: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    scheduledRun: {
      findUnique: mocks.findUnique,
      update: mocks.updateScheduledRun,
    },
    user: { findUnique: mocks.findUserUnique },
    actualRun: { findMany: mocks.findManyActualRun },
  },
}));

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { computeFeasibility } from "@/lib/db/feasibility";

const { findUnique, findUserUnique, findManyActualRun, updateScheduledRun } = mocks;

const USER_ID = "u1";
const SCHEDULED_ID = "sr1";
const NOW = new Date("2026-05-12T00:00:00Z");
const CREATED_LONG_AGO = new Date("2026-01-01T00:00:00Z"); // 4개월 전

// 타겟: 매주 화요일 07:00 KST = 화요일 22:00 UTC 전날
const TARGET_AT = new Date("2026-05-11T22:00:00Z"); // 월요일 22 UTC = 화요일 07 KST

function mockScheduledRunOwner(target: Date = TARGET_AT) {
  findUnique.mockResolvedValue({
    id: SCHEDULED_ID,
    userId: USER_ID,
    scheduledStartAt: target,
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
      scheduledRun: { scheduledStartAt: s.scheduledStartAt },
    })),
  );
}

describe("computeFeasibility", () => {
  beforeEach(() => {
    findUnique.mockReset();
    findUserUnique.mockReset();
    findManyActualRun.mockReset();
    updateScheduledRun.mockReset();
  });

  it("가입 14일 미만이면 cold start", async () => {
    mockScheduledRunOwner();
    mockUserAge(new Date("2026-05-05T00:00:00Z")); // 7일 전
    mockSamples([]);

    const result = await computeFeasibility(USER_ID, SCHEDULED_ID, NOW);
    expect(result.dataInsufficient).toBe(true);
    expect(result.score).toBeNull();
    expect(result.rationale).toMatch(/가입 후/);
  });

  it("표본 5건 미만이면 cold start", async () => {
    mockScheduledRunOwner();
    mockUserAge(CREATED_LONG_AGO);
    mockSamples(
      sample(3, { hour: 22, dow: 1, status: "done" }), // 같은 시간대·요일, 3건
    );

    const result = await computeFeasibility(USER_ID, SCHEDULED_ID, NOW);
    expect(result.dataInsufficient).toBe(true);
    expect(result.evidence.sampleSize).toBe(3);
  });

  it("100% 정시 실행 → score 100", async () => {
    mockScheduledRunOwner();
    mockUserAge(CREATED_LONG_AGO);
    mockSamples(sample(8, { hour: 22, dow: 1, status: "done", delayMin: 0 }));

    const result = await computeFeasibility(USER_ID, SCHEDULED_ID, NOW);
    expect(result.dataInsufficient).toBe(false);
    expect(result.score).toBe(100);
    expect(result.rationale).toMatch(/100%/);
  });

  it("80% 실행 + 평균 15분 지각 → 80 - 15 = 65", async () => {
    mockScheduledRunOwner();
    mockUserAge(CREATED_LONG_AGO);
    mockSamples([
      ...sample(8, { hour: 22, dow: 1, status: "done", delayMin: 15 }),
      ...sample(2, { hour: 22, dow: 1, status: "skipped" }),
    ]);

    const result = await computeFeasibility(USER_ID, SCHEDULED_ID, NOW);
    expect(result.score).toBe(65); // base 80, penalty 15
    expect(result.rationale).toMatch(/평균 15분 지각/);
  });

  it("다른 요일·시간대 표본은 제외", async () => {
    mockScheduledRunOwner();
    mockUserAge(CREATED_LONG_AGO);
    mockSamples([
      ...sample(2, { hour: 22, dow: 1, status: "done" }), // 일치
      ...sample(10, { hour: 10, dow: 3, status: "done" }), // 다른 시간·요일
    ]);

    const result = await computeFeasibility(USER_ID, SCHEDULED_ID, NOW);
    // 일치 표본 2건만 카운트 → cold start
    expect(result.dataInsufficient).toBe(true);
    expect(result.evidence.sampleSize).toBe(2);
  });

  it("지연 페널티 최대 -20점", async () => {
    mockScheduledRunOwner();
    mockUserAge(CREATED_LONG_AGO);
    mockSamples(sample(6, { hour: 22, dow: 1, status: "done", delayMin: 60 }));

    const result = await computeFeasibility(USER_ID, SCHEDULED_ID, NOW);
    // base 100, penalty min(20, 60) = 80
    expect(result.score).toBe(80);
  });

  it("score는 0..100으로 클램프", async () => {
    mockScheduledRunOwner();
    mockUserAge(CREATED_LONG_AGO);
    mockSamples([
      ...sample(1, { hour: 22, dow: 1, status: "done", delayMin: 60 }),
      ...sample(9, { hour: 22, dow: 1, status: "skipped" }),
    ]);

    const result = await computeFeasibility(USER_ID, SCHEDULED_ID, NOW);
    // executionRate = 1/10 = 10%, base 10. delay 60→penalty 20. 결과 -10 → clamp 0
    expect(result.score).toBe(0);
  });
});

// 같은 시각·요일·상태의 표본 N개를 만드는 헬퍼
function sample(
  count: number,
  opts: { hour: number; dow: number; status: string; delayMin?: number },
): { scheduledStartAt: Date; actualStartAt: Date; status: string }[] {
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(NOW.getTime() - (i + 1) * 7 * 86_400_000); // 매주 i+1주 전
    // 해당 요일로 맞추기
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
