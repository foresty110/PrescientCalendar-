/**
 * LLM 도구 정의.
 *
 * 각 도구는 Zod 스키마(런타임 검증) + 핸들러(userId 인자) + 메타데이터로 구성.
 * Anthropic tool format은 자동 변환.
 *
 * 도구 카탈로그는 `docs/llm-tools.md` 참조.
 */
import { z, ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type Anthropic from "@anthropic-ai/sdk";

import * as events from "@/lib/db/events";
import * as runs from "@/lib/db/runs";
import * as patterns from "@/lib/db/patterns";
import { computeFeasibility, persistFeasibilityScore } from "@/lib/db/feasibility";

// ---------------------------------------------------------------------------
// Tool 정의 헬퍼
// ---------------------------------------------------------------------------

export interface ToolContext {
  userId: string;
  /** "지금" — 시각 해석 기준. 테스트에서 주입. */
  now: Date;
}

export interface ToolDefinition<TInput extends ZodTypeAny, TOutput> {
  name: string;
  description: string;
  inputSchema: TInput;
  handler: (input: z.infer<TInput>, ctx: ToolContext) => Promise<TOutput>;
}

export function defineTool<TInput extends ZodTypeAny, TOutput>(
  def: ToolDefinition<TInput, TOutput>,
): ToolDefinition<TInput, TOutput> {
  return def;
}

// ---------------------------------------------------------------------------
// 공통 스키마 조각
// ---------------------------------------------------------------------------

const isoDateTime = z
  .string()
  .regex(
    // 고정 길이 시퀀스 + 한정된 옵션 그룹 — 백트래킹 위험 없음
    // eslint-disable-next-line security/detect-unsafe-regex
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/,
    "ISO-8601 datetime",
  );

const recurrenceSchema = z
  .object({
    freq: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
    byDay: z.array(z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"])).optional(),
    until: z.string().optional(),
  })
  .nullable()
  .optional();

// ---------------------------------------------------------------------------
// 도구들
// ---------------------------------------------------------------------------

export const createEventTool = defineTool({
  name: "create_event",
  description:
    "사용자가 새 일정을 만들 때 호출. 과거 시각은 거부 — assistant는 사용자에게 재질문. " +
    "같은 시간에 겹치는 일정이 있으면 conflictWarning을 반환하므로 사용자 확인 후 진행. " +
    "사용자가 일정의 내용·메모·의제 등을 함께 알려주면 description 인자에 그대로 담아 저장.",
  inputSchema: z.object({
    title: z.string().min(1).max(100),
    description: z
      .string()
      .max(2000)
      .nullable()
      .optional()
      .describe("일정의 사전 메모 — 모든 회차 공유. 사용자가 명시적으로 줬을 때만 채움"),
    startAt: isoDateTime.describe("ISO-8601, KST offset 권장 (예: 2026-05-13T15:00:00+09:00)"),
    durationMin: z.number().int().min(5).max(480),
    recurrence: recurrenceSchema,
  }),
  handler: async (input, ctx) => {
    return events.createEvent(ctx.userId, input, ctx.now);
  },
});

export const listEventsTool = defineTool({
  name: "list_events",
  description: "from~to 범위의 ScheduledRun 조회. 캘린더 표시·예측 컨텍스트용.",
  inputSchema: z.object({
    from: isoDateTime,
    to: isoDateTime,
    withActualRun: z.boolean().optional().default(false),
  }),
  handler: async (input, ctx) => {
    return events.listScheduledRuns(ctx.userId, {
      from: new Date(input.from),
      to: new Date(input.to),
      withActualRun: input.withActualRun ?? false,
    });
  },
});

export const updateEventTool = defineTool({
  name: "update_event",
  description: "기존 Event 수정. 미래 ScheduledRun만 재생성, 과거 인스턴스는 보존.",
  inputSchema: z.object({
    eventId: z.string(),
    patch: z.object({
      title: z.string().min(1).max(100).optional(),
      description: z
        .string()
        .max(2000)
        .nullable()
        .optional()
        .describe("사전 메모 갱신. null 전달 시 메모 제거. 미전달이면 그대로 유지"),
      recurrence: recurrenceSchema,
      defaultDurationMin: z.number().int().min(5).max(480).optional(),
    }),
  }),
  handler: async (input, ctx) => {
    return events.updateEvent(ctx.userId, input.eventId, input.patch, ctx.now);
  },
});

export const deleteEventTool = defineTool({
  name: "delete_event",
  description: "Event 삭제. scope=all이면 전부, future_only면 미래 ScheduledRun만.",
  inputSchema: z.object({
    eventId: z.string(),
    scope: z.enum(["all", "future_only"]),
  }),
  handler: async (input, ctx) => {
    return events.deleteEvent(ctx.userId, input.eventId, input.scope, ctx.now);
  },
});

export const recordActualRunTool = defineTool({
  name: "record_actual_run",
  description:
    "회고 단건 기록. ScheduledRun에 1:1로 ActualRun 생성 (이미 있으면 갱신). " +
    "IDOR 방어를 위해 핸들러는 scheduledRunId 소유자 검증.",
  inputSchema: z.object({
    scheduledRunId: z.string(),
    actualStartAt: isoDateTime,
    actualDurationMin: z.number().int().min(0).max(720),
    status: z.enum(["done", "skipped", "late"]),
  }),
  handler: async (input, ctx) => {
    return runs.recordActualRun(ctx.userId, {
      scheduledRunId: input.scheduledRunId,
      actualStartAt: new Date(input.actualStartAt),
      actualDurationMin: input.actualDurationMin,
      status: input.status,
    });
  },
});

export const listPendingRetrosTool = defineTool({
  name: "list_pending_retros",
  description: "회고가 안 된 ScheduledRun 목록. 일괄 회고 시작용.",
  inputSchema: z.object({
    from: isoDateTime,
    to: isoDateTime,
  }),
  handler: async (input, ctx) => {
    return runs.listPendingRetros(ctx.userId, {
      from: new Date(input.from),
      to: new Date(input.to),
      now: ctx.now,
    });
  },
});

export const queryUserPatternTool = defineTool({
  name: "query_user_pattern",
  description:
    "회고 통계 조회 — 채팅에서 '이번 주 운동 실행률 어때?' 같은 질의에 대응. " +
    "실행률, 평균 지연, 완료/스킵/지연 카운트 반환.",
  inputSchema: z.object({
    eventIdOrKeyword: z.string(),
    since: isoDateTime,
    until: isoDateTime.optional(),
  }),
  handler: async (input, ctx) => {
    return patterns.queryUserPattern(ctx.userId, {
      eventIdOrKeyword: input.eventIdOrKeyword,
      since: new Date(input.since),
      ...(input.until ? { until: new Date(input.until) } : {}),
    });
  },
});

export const computeFeasibilityTool = defineTool({
  name: "compute_feasibility",
  description:
    "특정 ScheduledRun의 실현 가능성 점수(0~100) 산출. " +
    "데이터 부족 시 dataInsufficient=true (UI는 회색 처리). " +
    "임계값: 같은 시간대 ±1h ActualRun 5건 미만 또는 가입 2주 이내.",
  inputSchema: z.object({
    scheduledRunId: z.string(),
  }),
  handler: async (input, ctx) => {
    const result = await computeFeasibility(ctx.userId, input.scheduledRunId, ctx.now);
    // 재계산 결과를 ScheduledRun에 갱신 — 다음 조회 시 캘린더가 최신값 보게
    await persistFeasibilityScore(input.scheduledRunId, result);
    return {
      score: result.score,
      rationale: result.rationale,
      dataInsufficient: result.dataInsufficient,
    };
  },
});

// ---------------------------------------------------------------------------
// 전체 도구 목록 + Anthropic 변환
// ---------------------------------------------------------------------------

export const ALL_TOOLS = [
  createEventTool,
  listEventsTool,
  updateEventTool,
  deleteEventTool,
  recordActualRunTool,
  listPendingRetrosTool,
  queryUserPatternTool,
  computeFeasibilityTool,
] as const;

export type AnyToolDefinition = (typeof ALL_TOOLS)[number];

export type ToolName = AnyToolDefinition["name"];

/** Anthropic tools 배열로 변환. 마지막 도구에 cache_control 설정 (system+tools 캐시) */
export function toAnthropicTools(
  tools: readonly AnyToolDefinition[] = ALL_TOOLS,
): Anthropic.Tool[] {
  return tools.map((t, i) => ({
    name: t.name,
    description: t.description,
    input_schema: zodToJsonSchema(t.inputSchema, { target: "openApi3" }) as Anthropic.Tool["input_schema"],
    ...(i === tools.length - 1 ? { cache_control: { type: "ephemeral" } } : {}),
  }));
}

/** 이름으로 도구 찾기 */
export function findTool(name: string): AnyToolDefinition | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}
