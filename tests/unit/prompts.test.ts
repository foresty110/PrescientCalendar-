import { describe, expect, it } from "vitest";

import { buildSystemPrompt } from "@/lib/llm/prompts";

const NOW = new Date("2026-05-15T01:00:00.000Z"); // KST 10:00

describe("buildSystemPrompt", () => {
  it("chatContext 없으면 런타임 컨텍스트만 끝에 붙는다", () => {
    const out = buildSystemPrompt(["scheduler"], NOW);
    expect(out).toContain("## 런타임 컨텍스트");
    expect(out).not.toContain("사용자가 현재 보고 있는 일정");
  });

  it("chatContext 있으면 '사용자가 현재 보고 있는 일정' 섹션이 시스템 프롬프트 끝에 덧붙는다", () => {
    const out = buildSystemPrompt(["scheduler"], NOW, {
      scheduledRunId: "run_123",
      title: "운동",
      time: "15:00",
      status: "upcoming",
    });
    expect(out).toContain("## 사용자가 현재 보고 있는 일정");
    expect(out).toContain("제목: 운동");
    expect(out).toContain("시각: 15:00 KST");
    expect(out).toContain("상태: upcoming");
    expect(out).toContain("scheduledRunId: run_123");
  });

  it("종일 일정 컨텍스트도 시각 토큰이 그대로 들어간다", () => {
    const out = buildSystemPrompt(["scheduler"], NOW, {
      scheduledRunId: "run_456",
      title: "워크샵",
      time: "종일",
      status: "in_progress",
    });
    expect(out).toContain("시각: 종일 KST");
    expect(out).toContain("상태: in_progress");
  });

  it("여러 mode 동시에 활성화하면 prompt 들이 합쳐지고 컨텍스트는 한 번만 붙는다", () => {
    const out = buildSystemPrompt(["scheduler", "retrospect"], NOW, {
      scheduledRunId: "run_789",
      title: "회의",
      time: "09:00",
      status: "needs_retro",
    });
    // 컨텍스트 헤더는 정확히 한 번
    const occurrences = out.split("## 사용자가 현재 보고 있는 일정").length - 1;
    expect(occurrences).toBe(1);
  });
});
