import { describe, it, expect } from "vitest";
import { toKstDisplay, fromKstInput, startOfKstDay } from "@/lib/time";

describe("time", () => {
  it("toKstDisplay formats UTC date as KST string", () => {
    // 2026-05-13T06:00:00Z = 15:00 KST
    const utc = new Date("2026-05-13T06:00:00Z");
    expect(toKstDisplay(utc)).toBe("2026-05-13 15:00 KST");
  });

  it("fromKstInput interprets naive ISO as KST", () => {
    const d = fromKstInput("2026-05-13T15:00");
    expect(d.toISOString()).toBe("2026-05-13T06:00:00.000Z");
  });

  it("fromKstInput respects explicit offset", () => {
    const d = fromKstInput("2026-05-13T15:00:00+09:00");
    expect(d.toISOString()).toBe("2026-05-13T06:00:00.000Z");
  });

  it("fromKstInput respects Z (UTC) offset", () => {
    const d = fromKstInput("2026-05-13T06:00:00Z");
    expect(d.toISOString()).toBe("2026-05-13T06:00:00.000Z");
  });

  it("startOfKstDay returns KST midnight as UTC", () => {
    // 어느 시각이든 → 그 날 KST 자정 = 전날 15:00 UTC
    const d = startOfKstDay(new Date("2026-05-13T10:30:00Z"));
    // 2026-05-13 19:30 KST → 2026-05-13 00:00 KST 자정 = 2026-05-12T15:00:00Z
    expect(d.toISOString()).toBe("2026-05-12T15:00:00.000Z");
  });
});
