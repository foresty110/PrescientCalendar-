import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUserId } from "@/lib/db/auth";
import { recordActualRun } from "@/lib/db/runs";
import { apiError, mapError } from "@/lib/api/errors";

export const runtime = "nodejs";

const bodySchema = z.object({
  scheduledRunId: z.string().min(1),
  actualStartAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  actualDurationMin: z.number().int().min(0).max(720),
  status: z.enum(["done", "skipped", "late"]),
});

export async function POST(req: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const json = (await req.json()) as unknown;
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return apiError("VALIDATION_ERROR", "Invalid body", parsed.error.flatten());
    }
    const saved = await recordActualRun(userId, {
      scheduledRunId: parsed.data.scheduledRunId,
      actualStartAt: new Date(parsed.data.actualStartAt),
      actualDurationMin: parsed.data.actualDurationMin,
      status: parsed.data.status,
    });
    return NextResponse.json(saved);
  } catch (e) {
    return mapError(e);
  }
}
