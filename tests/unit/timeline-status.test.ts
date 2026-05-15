import { describe, expect, it } from "vitest";

import {
  ALL_DAY_THRESHOLD_MIN,
  deriveStatus,
  isAllDayDuration,
} from "@/components/timeline/status";

const baseRun = {
  scheduledStartAt: "2026-05-14T05:00:00.000Z", // 14:00 KST
  scheduledDurationMin: 60,
};

const startMs = new Date(baseRun.scheduledStartAt).getTime();
const endMs = startMs + baseRun.scheduledDurationMin * 60_000;

describe("deriveStatus", () => {
  it("회고 done 은 completed", () => {
    expect(
      deriveStatus(baseRun, { status: "done" }, new Date(endMs + 10_000)),
    ).toBe("completed");
  });

  it("회고 late 도 completed (지연 완료도 완료 그룹)", () => {
    expect(
      deriveStatus(baseRun, { status: "late" }, new Date(endMs + 10_000)),
    ).toBe("completed");
  });

  it("회고 skipped 는 missed", () => {
    expect(
      deriveStatus(baseRun, { status: "skipped" }, new Date(endMs + 10_000)),
    ).toBe("missed");
  });

  it("회고 없고 시작 전이면 upcoming", () => {
    expect(deriveStatus(baseRun, undefined, new Date(startMs - 60_000))).toBe(
      "upcoming",
    );
  });

  it("회고 없고 진행 시간대면 in_progress", () => {
    expect(
      deriveStatus(baseRun, undefined, new Date(startMs + 30 * 60_000)),
    ).toBe("in_progress");
  });

  it("회고 없고 끝난 뒤면 needs_retro", () => {
    expect(deriveStatus(baseRun, undefined, new Date(endMs + 60_000))).toBe(
      "needs_retro",
    );
  });

  it("경계: 정확히 start 시각이면 in_progress (시작 시점 포함)", () => {
    expect(deriveStatus(baseRun, undefined, new Date(startMs))).toBe(
      "in_progress",
    );
  });

  it("경계: 정확히 end 시각이면 needs_retro (종료 시점은 끝난 것으로 간주)", () => {
    expect(deriveStatus(baseRun, undefined, new Date(endMs))).toBe(
      "needs_retro",
    );
  });
});

describe("isAllDayDuration", () => {
  it("임계 미만(1319분 = 21시간 59분)은 종일 아님 — 긴-시간형 일정도 시간형으로 남는다", () => {
    expect(isAllDayDuration(ALL_DAY_THRESHOLD_MIN - 1)).toBe(false);
  });

  it("정확히 임계(22시간)면 종일", () => {
    expect(isAllDayDuration(ALL_DAY_THRESHOLD_MIN)).toBe(true);
  });

  it("24시간은 종일", () => {
    expect(isAllDayDuration(24 * 60)).toBe(true);
  });

  it("9-to-5 워크샵(8시간)은 시간형 — 자정 시작이 아니라도 분리되면 안 됨", () => {
    expect(isAllDayDuration(8 * 60)).toBe(false);
  });
});
