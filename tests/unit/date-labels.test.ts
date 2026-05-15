import { describe, expect, it } from "vitest";

import { pickDateLabel, todayKstDateKey } from "@/lib/date-labels";

describe("todayKstDateKey", () => {
  it("UTC 자정 직후 시각도 KST 같은 날로 잡힌다", () => {
    // 2026-05-15 00:00 UTC = 2026-05-15 09:00 KST
    const utc = new Date("2026-05-15T00:00:00.000Z");
    expect(todayKstDateKey(utc)).toBe("2026-05-15");
  });

  it("KST 자정 직전(UTC 14:59) 은 그 KST 날짜 유지", () => {
    // 2026-05-14 14:59 UTC = 2026-05-14 23:59 KST → 5월 14일
    const utc = new Date("2026-05-14T14:59:00.000Z");
    expect(todayKstDateKey(utc)).toBe("2026-05-14");
  });

  it("KST 자정 직후(UTC 15:00) 다음 KST 날짜로 넘어간다", () => {
    // 2026-05-14 15:00 UTC = 2026-05-15 00:00 KST → 5월 15일
    const utc = new Date("2026-05-14T15:00:00.000Z");
    expect(todayKstDateKey(utc)).toBe("2026-05-15");
  });
});

describe("pickDateLabel", () => {
  it("같은 키면 '오늘'", () => {
    expect(pickDateLabel("2026-05-15", "2026-05-15")).toBe("오늘");
  });

  it("하루 전이면 '어제'", () => {
    expect(pickDateLabel("2026-05-14", "2026-05-15")).toBe("어제");
  });

  it("하루 후면 '내일'", () => {
    expect(pickDateLabel("2026-05-16", "2026-05-15")).toBe("내일");
  });

  it("그 외 미래면 'M월 d일 (요일)' (2026-05-18 = 월요일)", () => {
    // 2026-05-15 = 금. 17 일, 18 월.
    expect(pickDateLabel("2026-05-18", "2026-05-15")).toBe("5월 18일 (월)");
  });

  it("그 외 과거도 'M월 d일 (요일)' (2026-05-11 = 월요일)", () => {
    expect(pickDateLabel("2026-05-11", "2026-05-15")).toBe("5월 11일 (월)");
  });

  it("주말도 정확히 (토요일/일요일)", () => {
    // 2026-05-16 = 토, 2026-05-17 = 일
    expect(pickDateLabel("2026-05-16", "2026-05-12")).toBe("5월 16일 (토)");
    expect(pickDateLabel("2026-05-17", "2026-05-12")).toBe("5월 17일 (일)");
  });

  it("달 경계 넘는 어제 (5/1 → 4/30) 도 정상", () => {
    expect(pickDateLabel("2026-04-30", "2026-05-01")).toBe("어제");
  });

  it("연 경계 넘는 내일 (12/31 → 1/1)", () => {
    expect(pickDateLabel("2027-01-01", "2026-12-31")).toBe("내일");
  });
});
