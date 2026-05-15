import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/db/auth";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL";

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; details?: unknown };
}

const STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export function apiError(code: ApiErrorCode, message: string, details?: unknown) {
  const body: ApiErrorBody = { error: { code, message, ...(details ? { details } : {}) } };
  // eslint-disable-next-line security/detect-object-injection -- code는 ApiErrorCode union, 외부 입력 아님
  return NextResponse.json(body, { status: STATUS[code] });
}

/**
 * 알려진 예외를 표준 envelope로, 알 수 없는 예외는 INTERNAL + 로그.
 * 스택트레이스는 사용자에게 노출하지 않음.
 */
export function mapError(e: unknown) {
  if (e instanceof UnauthorizedError) return apiError("UNAUTHORIZED", "로그인이 필요합니다");
  if (e instanceof ForbiddenError) return apiError("FORBIDDEN", "권한이 없습니다");

  console.error("[api] unhandled error:", e);
  return apiError("INTERNAL", "내부 오류가 발생했습니다");
}
