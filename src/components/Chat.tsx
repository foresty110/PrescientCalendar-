"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  FeasibilityCard,
  feasibilityOutputSchema,
  type FeasibilityCardData,
} from "@/components/FeasibilityCard";

interface ToolCallSummary {
  name: string;
  output?: unknown;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** 사용자 메시지가 어떤 경로로 생성됐는지 표시할 작은 라벨 (예: "일정 카드에서 시작됨").
   *  요구사항 §4.1 의 "↗ 일정 카드에서 시작됨" 메타 표기. */
  meta?: string;
  /** assistant 메시지에 한해 — compute_feasibility tool 호출 결과를 카드로 본문 아래 인라인 표시. */
  feasibilityCards?: FeasibilityCardData[];
}

/** assistant 응답에서 compute_feasibility 결과만 추려 Zod 로 형태 검증.
 *  여러 일정에 대해 한 턴에 여러 번 호출될 수 있어 배열로 모은다. 형태가 어긋나는 출력은 조용히 버린다 —
 *  LLM 텍스트 본문은 어차피 따로 살아남는다. */
function extractFeasibilityCards(toolCalls: ToolCallSummary[]): FeasibilityCardData[] {
  return toolCalls
    .filter((c) => c.name === "compute_feasibility")
    .map((c) => feasibilityOutputSchema.safeParse(c.output))
    .filter((r): r is { success: true; data: FeasibilityCardData } => r.success)
    .map((r) => r.data);
}

/** 채팅 헤더 컨텍스트 칩에 표시되면서 동시에 LLM 시스템 프롬프트에 메타로 주입되는 일정 컨텍스트.
 *  요청 본문의 `chatContext` 필드로 그대로 직렬화돼 서버로 전달된다 — `src/app/api/chat/route.ts`
 *  와 `src/lib/llm/prompts.ts:ChatContextInput` 와 동일한 모양을 유지해야 한다. */
export interface ChatContext {
  scheduledRunId: string;
  title: string;
  /** 헤더 칩에 그대로 노출되는 시각 표기 — "HH:mm" KST 또는 종일 일정이면 "종일". */
  time: string;
  /** 카드의 derived TimelineStatus — LLM 이 회고/예측 모드 진입을 자연스럽게 결정하는 데 사용. */
  status: "completed" | "missed" | "needs_retro" | "in_progress" | "upcoming";
}

interface ChatProps {
  /** 메시지 한 턴이 끝난 뒤 호출 — 캘린더 새로고침 등 외부 상태 갱신용 */
  onCompletion?: (toolCalls: { name: string }[]) => void;
  /** 현재 대화 컨텍스트 일정 (controlled — 부모 단계의 단일 진실 원천) */
  context?: ChatContext | null;
  /** 헤더 칩 × 클릭 시 호출 */
  onContextClear?: () => void;
}

/** 외부에서 채팅 입력란을 제어하는 명령형 핸들.
 *  - prefill(text, meta?): 입력란 자동 채움 + 포커스. meta 가 주어지면 다음 send 시
 *    그 메시지에 작은 메타 라벨이 붙는다 (예: "일정 카드에서 시작됨")
 *  - focusInput(): 입력란만 포커스 (메시지 채우지 않음 — "+ 추가" 버튼 등에서 사용)
 *  컨텍스트 상태는 더 이상 핸들에 두지 않고 props 로 controlled. */
export interface ChatHandle {
  prefill: (text: string, meta?: string) => void;
  focusInput: () => void;
}

export const Chat = forwardRef<ChatHandle, ChatProps>(function Chat(
  { onCompletion, context = null, onContextClear },
  ref,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingMeta, setPendingMeta] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      prefill: (text: string, meta?: string) => {
        setInput(text);
        setPendingMeta(meta ?? null);
        // 다음 paint 이후 포커스 — 입력값 갱신이 DOM 에 반영된 뒤
        requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.setSelectionRange(text.length, text.length);
        });
      },
      focusInput: () => {
        requestAnimationFrame(() => inputRef.current?.focus());
      },
    }),
    [],
  );

  function send(form: FormData) {
    const raw = form.get("text");
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!text || isPending) return;
    setError(null);
    const next: ChatMessage[] = [
      ...messages,
      pendingMeta
        ? { role: "user", content: text, meta: pendingMeta }
        : { role: "user", content: text },
    ];
    setMessages(next);
    setInput("");
    setPendingMeta(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          // context 가 활성화된 상태면 같이 보내 LLM 이 "이거/그거" 같은 지시어를 해석할 수 있게.
          body: JSON.stringify({
            messages: next,
            ...(context ? { chatContext: context } : {}),
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          text: string;
          toolCalls: ToolCallSummary[];
        };
        const feasibilityCards = extractFeasibilityCards(data.toolCalls);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.text,
            ...(feasibilityCards.length > 0 ? { feasibilityCards } : {}),
          },
        ]);
        if (data.toolCalls.length > 0) onCompletion?.(data.toolCalls);
      } catch (e) {
        setError(e instanceof Error ? e.message : "알 수 없는 오류");
      }
    });
  }

  return (
    <div className="flex h-full min-h-[400px] flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
      <header className="flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
        <span>채팅</span>
        {context && (
          <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-normal text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
            <span aria-label="대화 중인 일정">{context.time} {context.title}</span>
            <button
              type="button"
              onClick={() => onContextClear?.()}
              aria-label="컨텍스트 해제"
              className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-violet-500 transition-colors hover:bg-violet-200 hover:text-violet-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:text-violet-300 dark:hover:bg-violet-800 dark:hover:text-violet-50 dark:focus-visible:ring-offset-slate-950"
            >
              ×
            </button>
          </span>
        )}
      </header>

      <ol className="flex-1 space-y-2 overflow-y-auto text-sm">
        {messages.length === 0 && (
          <li className="rounded-md bg-slate-50 p-3 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            예: <code>내일 오후 3시에 1시간 운동</code> · <code>다음 주 화요일 9시 회의</code>
          </li>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <li key={i} className="ml-8 flex flex-col items-end gap-1">
              {m.meta && (
                <span className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                  <span aria-hidden>↗</span>
                  <span>{m.meta}</span>
                </span>
              )}
              <span className="rounded-md bg-slate-900 px-3 py-2 text-white dark:bg-slate-100 dark:text-slate-900">
                {m.content}
              </span>
            </li>
          ) : (
            <li key={i} className="mr-8 space-y-2">
              {(m.content || isPending) && (
                <div className="rounded-md bg-slate-100 px-3 py-2 dark:bg-slate-800">
                  {m.content || "…"}
                </div>
              )}
              {m.feasibilityCards?.map((card, j) => (
                <FeasibilityCard key={j} data={card} />
              ))}
            </li>
          ),
        )}
        {isPending && (
          <li className="mr-8 rounded-md bg-slate-100 px-3 py-2 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            생각 중…
          </li>
        )}
        {error && (
          <li className="mr-8 rounded-md bg-red-50 px-3 py-2 text-red-700 dark:bg-red-900/30 dark:text-red-400">
            {error}
          </li>
        )}
      </ol>

      <form action={send} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          name="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // 컨텍스트 활성 상태에서 Esc → 칩 해제. 입력값 자체엔 영향 없음
            // (그래야 prefill 된 텍스트를 잃지 않는다).
            if (e.key === "Escape" && context) {
              e.preventDefault();
              onContextClear?.();
            }
          }}
          placeholder="일정을 자연어로 입력하세요…"
          disabled={isPending}
          className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={isPending || input.trim().length === 0}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          보내기
        </button>
      </form>
    </div>
  );
});
