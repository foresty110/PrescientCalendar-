import { describe, it, expect } from "vitest";
import {
  ALL_TOOLS,
  toAnthropicTools,
  findTool,
  createEventTool,
} from "@/lib/llm/tools";

describe("LLM tools", () => {
  it("ALL_TOOLS contains 8 tools with unique names", () => {
    expect(ALL_TOOLS).toHaveLength(8);
    const names = ALL_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("toAnthropicTools converts schemas to JSON Schema", () => {
    const tools = toAnthropicTools();
    expect(tools).toHaveLength(8);
    const createEvent = tools.find((t) => t.name === "create_event");
    expect(createEvent).toBeDefined();
    expect(createEvent?.input_schema.type).toBe("object");
    const props = createEvent?.input_schema.properties as Record<string, unknown>;
    expect(props).toHaveProperty("title");
    expect(props).toHaveProperty("startAt");
    expect(props).toHaveProperty("durationMin");
  });

  it("last tool has cache_control for caching tools+system together", () => {
    const tools = toAnthropicTools();
    const last = tools[tools.length - 1] as { cache_control?: unknown };
    expect(last.cache_control).toEqual({ type: "ephemeral" });
  });

  it("findTool returns matching tool", () => {
    expect(findTool("create_event")?.name).toBe("create_event");
    expect(findTool("nonexistent")).toBeUndefined();
  });

  it("create_event input schema rejects invalid input", () => {
    const res = createEventTool.inputSchema.safeParse({
      title: "",
      startAt: "not-a-date",
      durationMin: -1,
    });
    expect(res.success).toBe(false);
  });

  it("create_event input schema accepts valid input", () => {
    const res = createEventTool.inputSchema.safeParse({
      title: "운동",
      startAt: "2026-05-13T15:00:00+09:00",
      durationMin: 60,
    });
    expect(res.success).toBe(true);
  });
});
