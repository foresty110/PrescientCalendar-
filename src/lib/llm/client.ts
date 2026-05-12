import Anthropic from "@anthropic-ai/sdk";

const globalForClient = globalThis as unknown as { anthropic?: Anthropic };

export const anthropic =
  globalForClient.anthropic ??
  new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

if (process.env.NODE_ENV !== "production") {
  globalForClient.anthropic = anthropic;
}

/** 기본 모델. 정확도 우선 → claude-opus-4-7, 속도/비용 우선 → claude-sonnet-4-6 */
export const DEFAULT_MODEL = "claude-sonnet-4-6";

/** 토큰 제한 — 캘린더 도메인은 짧은 응답이 대부분 */
export const DEFAULT_MAX_TOKENS = 2048;
