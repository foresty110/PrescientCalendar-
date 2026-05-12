/**
 * 시스템 프롬프트 로더 + 런타임 컨텍스트 주입.
 *
 * prompts/*.md 파일을 빌드 시점에 import (Next.js raw loader 미사용 →
 * fs로 읽기). 짧으니 모듈 로드 시 1회 캐시.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { KST, toKstDisplay } from "@/lib/time";

const PROMPTS_DIR = join(process.cwd(), "src", "lib", "llm", "prompts");

const cache: Record<string, string> = {};

function loadPrompt(name: PromptName): string {
  /* eslint-disable security/detect-object-injection, security/detect-non-literal-fs-filename --
     name은 PromptName union, 파일은 소스 트리 내. 모듈 로드 시 1회 캐시. */
  if (!cache[name]) {
    cache[name] = readFileSync(join(PROMPTS_DIR, `${name}.md`), "utf-8");
  }
  return cache[name] ?? "";
  /* eslint-enable security/detect-object-injection, security/detect-non-literal-fs-filename */
}

export type PromptName = "scheduler" | "retrospect" | "feasibility" | "next-week";

/**
 * 시스템 프롬프트 + 런타임 컨텍스트(현재 시각·타임존).
 * 같은 prompt name + 같은 시각이면 결과 동일 → 캐싱과 잘 맞음.
 */
export function buildSystemPrompt(name: PromptName, now: Date): string {
  const base = loadPrompt(name);
  const context = [
    "",
    "---",
    "## 런타임 컨텍스트",
    `- 현재 시각 (KST): ${toKstDisplay(now)}`,
    `- 타임존: ${KST}`,
    `- ISO 입력 시 \`+09:00\` offset 권장`,
  ].join("\n");
  return base + context;
}
