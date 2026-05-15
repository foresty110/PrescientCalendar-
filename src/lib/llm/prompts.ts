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

/** Front-end 가 타임라인 카드를 클릭해 채팅 컨텍스트를 활성화했을 때 LLM 에 함께 흘려보내는 메타.
 *  scheduledRunId 는 update/delete/record 도구 호출에 직접 쓰이고, status 는 회고/예측 모드 진입을
 *  자연스럽게 만든다. ChatContext (src/components/Chat.tsx) 와 동일한 구조. */
export interface ChatContextInput {
  scheduledRunId: string;
  title: string;
  /** "HH:mm" KST 또는 종일이면 "종일". */
  time: string;
  /** 카드 status — needs_retro / completed / missed / in_progress / upcoming */
  status: string;
}

/**
 * 시스템 프롬프트 + 런타임 컨텍스트(현재 시각·타임존) + (선택) 사용자가 보고 있는 일정 메타.
 *
 * 여러 mode를 동시에 활성화하려면 배열을 전달. 도구 호출 패턴이 모드 구분을
 * 자연스럽게 처리한다(plan §Step 4 참고). 같은 names+시각+컨텍스트면 결과 동일 →
 * 프롬프트 캐싱과 잘 맞음.
 */
export function buildSystemPrompt(
  names: PromptName | PromptName[],
  now: Date,
  chatContext?: ChatContextInput,
): string {
  const list = Array.isArray(names) ? names : [names];
  const sections = list.map(loadPrompt).join("\n\n---\n\n");
  const contextLines = [
    "",
    "---",
    "## 런타임 컨텍스트",
    `- 현재 시각 (KST): ${toKstDisplay(now)}`,
    `- 타임존: ${KST}`,
    `- ISO 입력 시 \`+09:00\` offset 권장`,
  ];
  if (chatContext) {
    contextLines.push(
      "",
      "## 사용자가 현재 보고 있는 일정",
      `- 제목: ${chatContext.title}`,
      `- 시각: ${chatContext.time} KST`,
      `- 상태: ${chatContext.status}`,
      `- scheduledRunId: ${chatContext.scheduledRunId}`,
      "",
      "사용자가 \"이거\" / \"그거\" / \"오늘\" 같은 지시어로 일정을 가리키면 위 일정을 의미한다. " +
        "도구 호출에 scheduledRunId 가 필요하면 위 값을 그대로 쓴다.",
    );
  }
  return sections + contextLines.join("\n");
}
