import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUserId } from "@/lib/db/auth";
import { listScheduledRuns } from "@/lib/db/events";
import { apiError, mapError } from "@/lib/api/errors";

const querySchema = z.object({
  from: z.string().datetime({ offset: true }).or(z.string().datetime()),
  to: z.string().datetime({ offset: true }).or(z.string().datetime()),
  withActualRun: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export async function GET(req: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const params = querySchema.safeParse({
      from: req.nextUrl.searchParams.get("from"),
      to: req.nextUrl.searchParams.get("to"),
      withActualRun: req.nextUrl.searchParams.get("withActualRun") ?? undefined,
    });
    if (!params.success) {
      return apiError("VALIDATION_ERROR", "Invalid query", params.error.flatten());
    }
    const rows = await listScheduledRuns(userId, {
      from: new Date(params.data.from),
      to: new Date(params.data.to),
      withActualRun: params.data.withActualRun ?? false,
    });
    return NextResponse.json({ items: rows });
  } catch (e) {
    return mapError(e);
  }
}
