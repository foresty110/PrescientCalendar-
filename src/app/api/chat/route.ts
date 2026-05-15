import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUserId } from "@/lib/db/auth";
import { runAgent } from "@/lib/llm/agent";
import { buildSystemPrompt } from "@/lib/llm/prompts";
import { apiError, mapError } from "@/lib/api/errors";

export const runtime = "nodejs"; // Anthropic SDK는 Node runtime 필요

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

// 타임라인 카드 클릭으로 활성화된 컨텍스트. 클라이언트가 함께 보내면 시스템 프롬프트에 메타로 주입.
// 미인증 신뢰 안 되는 값이므로 Zod 로 검증 후 그대로 LLM 에 흘려보냄 — DB 호출에는 쓰지 않는다
// (IDOR 위험 회피: scheduledRunId 는 LLM 이 도구 호출 인자로 다시 보내면 그때 assertOwnership 으로 검증).
const chatContextSchema = z
  .object({
    scheduledRunId: z.string().min(1).max(64),
    title: z.string().min(1).max(200),
    time: z.string().min(1).max(16),
    status: z.enum(["completed", "missed", "needs_retro", "in_progress", "upcoming"]),
  })
  .optional();

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(50),
  chatContext: chatContextSchema,
});

export async function POST(req: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const json = (await req.json()) as unknown;
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid body", parsed.error.flatten());
    }

    const now = new Date();
    // 단일 채팅에서 scheduling + retrospect + feasibility를 모두 처리.
    // 도구 호출 패턴으로 모드 구분 (plan §Step 4 라우터 미사용 원칙).
    const systemPrompt = buildSystemPrompt(
      ["scheduler", "retrospect", "feasibility"],
      now,
      parsed.data.chatContext,
    );

    const trace = await runAgent({
      userId,
      messages: parsed.data.messages.map((m) => ({ role: m.role, content: m.content })),
      systemPrompt,
      now,
    });

    return NextResponse.json({
      text: trace.finalText,
      toolCalls: trace.toolCalls,
      stopReason: trace.stopReason,
    });
  } catch (e) {
    return mapError(e);
  }
}
