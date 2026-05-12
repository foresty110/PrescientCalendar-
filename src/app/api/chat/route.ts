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

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(50),
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
    const systemPrompt = buildSystemPrompt("scheduler", now);

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
