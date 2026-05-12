/**
 * 멀티턴 tool_use 루프.
 *
 * 표준 패턴:
 *   1) messages.create → assistant message (text 또는 tool_use)
 *   2) tool_use 있으면 도구 실행 → tool_result content block 생성
 *   3) tool_result을 messages에 추가 후 다시 messages.create
 *   4) text-only 응답이거나 max 턴 도달 시 종료
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages.mjs";

import { anthropic, DEFAULT_MODEL, DEFAULT_MAX_TOKENS } from "@/lib/llm/client";
import { ALL_TOOLS, findTool, toAnthropicTools, type ToolContext } from "@/lib/llm/tools";

export interface RunAgentOptions {
  userId: string;
  /** 사용자 메시지 (가장 최근) 또는 전체 대화 히스토리 */
  messages: MessageParam[];
  /** 시스템 프롬프트 — cache_control 자동 설정 */
  systemPrompt: string;
  /** 현재 시각 — 시각 해석 기준. 테스트에서 주입. */
  now?: Date;
  /** 최대 턴 (도구 호출 횟수) */
  maxTurns?: number;
  /** 사용 가능한 도구 (기본: 전부) */
  tools?: typeof ALL_TOOLS | Anthropic.Tool[];
  /** 모델 오버라이드 */
  model?: string;
}

export interface AgentTrace {
  /** 최종 assistant 응답 텍스트 (도구 결과 포함 종료 시) */
  finalText: string;
  /** 호출된 도구 시퀀스 */
  toolCalls: { name: string; input: unknown; output?: unknown; error?: string }[];
  /** 종료 사유 */
  stopReason: "end_turn" | "max_turns" | "max_tokens" | "stop_sequence" | "tool_use" | "other";
  /** 누적 메시지 (다음 턴에 이어 쓸 수 있음) */
  messages: MessageParam[];
}

export async function runAgent(opts: RunAgentOptions): Promise<AgentTrace> {
  const {
    userId,
    messages,
    systemPrompt,
    now = new Date(),
    maxTurns = 6,
    model = DEFAULT_MODEL,
  } = opts;

  const ctx: ToolContext = { userId, now };
  const tools = toAnthropicTools(ALL_TOOLS);

  const conversation: MessageParam[] = [...messages];
  const toolCalls: AgentTrace["toolCalls"] = [];
  let stopReason: AgentTrace["stopReason"] = "other";

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: DEFAULT_MAX_TOKENS,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools,
      messages: conversation,
    });

    // assistant 응답을 대화에 추가
    conversation.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        const tool = findTool(block.name);
        if (!tool) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Error: unknown tool ${block.name}`,
            is_error: true,
          });
          toolCalls.push({ name: block.name, input: block.input, error: "unknown tool" });
          continue;
        }

        const parsed = tool.inputSchema.safeParse(block.input);
        if (!parsed.success) {
          const msg = parsed.error.toString();
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `VALIDATION_ERROR: ${msg}`,
            is_error: true,
          });
          toolCalls.push({ name: block.name, input: block.input, error: msg });
          continue;
        }

        try {
          // handler는 정의 위치에서 입력 타입을 알지만 여기선 generic 소실 → unknown 캐스팅
          const output = await (tool.handler as (i: unknown, c: ToolContext) => Promise<unknown>)(
            parsed.data,
            ctx,
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(output),
          });
          toolCalls.push({ name: block.name, input: parsed.data, output });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Error: ${msg}`,
            is_error: true,
          });
          toolCalls.push({ name: block.name, input: parsed.data, error: msg });
        }
      }

      conversation.push({ role: "user", content: toolResults });
      continue;
    }

    // text-only 또는 다른 stop_reason → 종료
    stopReason = (response.stop_reason ?? "other") as AgentTrace["stopReason"];
    break;
  }

  if (stopReason === "other" && toolCalls.length >= maxTurns) {
    stopReason = "max_turns";
  }

  const finalText = extractFinalText(conversation);

  return { finalText, toolCalls, stopReason, messages: conversation };
}

function extractFinalText(messages: MessageParam[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    // eslint-disable-next-line security/detect-object-injection -- i는 루프 인덱스, 사용자 입력 아님
    const m = messages[i];
    if (!m || m.role !== "assistant") continue;
    if (typeof m.content === "string") return m.content;
    const text = m.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    if (text) return text;
  }
  return "";
}
