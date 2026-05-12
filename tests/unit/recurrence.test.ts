import { describe, it, expect } from "vitest";
import { expandRecurrence } from "@/lib/recurrence";

const NOW = new Date("2026-05-12T00:00:00Z"); // 화요일 (KST는 09시)

describe("expandRecurrence", () => {
  it("recurrence 없으면 startAt 하나만 반환", () => {
    const out = expandRecurrence(new Date("2026-05-13T06:00:00Z"), null, { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0]?.toISOString()).toBe("2026-05-13T06:00:00.000Z");
  });

  it("DAILY: 4주 horizon 동안 매일 (29일치)", () => {
    const start = new Date("2026-05-13T06:00:00Z");
    const out = expandRecurrence(start, { freq: "DAILY" }, { now: NOW });
    // NOW + 4주 = 2026-06-09, start부터 그 날까지 매일
    expect(out.length).toBeGreaterThan(20);
    expect(out.length).toBeLessThanOrEqual(29);
    expect(out[0]?.toISOString()).toBe("2026-05-13T06:00:00.000Z");
    // 두 연속 인스턴스가 정확히 1일 간격
    expect((out[1]!.getTime() - out[0]!.getTime()) / 86400000).toBe(1);
  });

  it("WEEKLY: byDay 없으면 startAt 요일만 매주", () => {
    // 2026-05-13은 수요일
    const start = new Date("2026-05-13T06:00:00Z");
    const out = expandRecurrence(start, { freq: "WEEKLY" }, { now: NOW });
    expect(out.length).toBeGreaterThanOrEqual(4);
    // 모두 수요일 (UTC 기준)
    for (const d of out) {
      expect(d.getUTCDay()).toBe(3);
    }
  });

  it("WEEKLY: byDay 명시되면 그 요일들만 매주", () => {
    const start = new Date("2026-05-13T06:00:00Z"); // 수
    const out = expandRecurrence(
      start,
      { freq: "WEEKLY", byDay: ["MO", "WE", "FR"] },
      { now: NOW },
    );
    // 4주 동안 (수, 금, 월, 수, 금, 월, ...) 약 12개
    expect(out.length).toBeGreaterThanOrEqual(10);
    for (const d of out) {
      expect([1, 3, 5]).toContain(d.getUTCDay()); // 월=1, 수=3, 금=5
    }
  });

  it("MONTHLY: 같은 day-of-month 4주 horizon", () => {
    const start = new Date("2026-05-13T06:00:00Z");
    const out = expandRecurrence(start, { freq: "MONTHLY" }, { now: NOW });
    // horizon이 4주(약 28일)라 5월 13일만 들어오고 6월 13일은 horizon 초과
    expect(out).toHaveLength(1);
    expect(out[0]?.getUTCDate()).toBe(13);
  });

  it("MONTHLY: horizon 늘리면 여러 달 매월 같은 날", () => {
    const start = new Date("2026-05-13T06:00:00Z");
    const out = expandRecurrence(
      start,
      { freq: "MONTHLY" },
      { now: NOW, horizonWeeks: 16 }, // 약 4개월
    );
    expect(out.length).toBeGreaterThanOrEqual(4);
    for (const d of out) {
      expect(d.getUTCDate()).toBe(13);
    }
  });

  it("MONTHLY: 31일 시작은 30일·2월에서 스킵", () => {
    const start = new Date("2026-01-31T06:00:00Z");
    const out = expandRecurrence(
      start,
      { freq: "MONTHLY" },
      { now: new Date("2026-01-01T00:00:00Z"), horizonWeeks: 26 }, // 6개월
    );
    // 1, 3, 5월만 31일 존재 (2·4·6월은 스킵). 7월 31일은 horizon 초과 가능
    for (const d of out) {
      expect(d.getUTCDate()).toBe(31);
    }
    expect(out.length).toBeGreaterThanOrEqual(3);
  });

  it("until 있으면 horizon보다 그 날까지로 제한", () => {
    const start = new Date("2026-05-13T06:00:00Z");
    const out = expandRecurrence(
      start,
      { freq: "DAILY", until: "2026-05-15T23:59:59Z" },
      { now: NOW },
    );
    expect(out).toHaveLength(3); // 13, 14, 15
    expect(out[2]?.toISOString()).toBe("2026-05-15T06:00:00.000Z");
  });

  it("maxOccurrences 안전 한계 작동", () => {
    const out = expandRecurrence(
      new Date("2026-05-13T06:00:00Z"),
      { freq: "DAILY" },
      { now: NOW, maxOccurrences: 5 },
    );
    expect(out).toHaveLength(5);
  });
});
