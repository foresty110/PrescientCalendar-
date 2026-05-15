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

/** 첫 빈 상태에서 입력란 위에 노출되는 빠른 액션. label 클릭 → 즉시 사용자 메시지로 전송.
 *  메시지 1건이라도 쌓이면 사라진다 (조건: messages.length === 0). */
const QUICK_ACTIONS: readonly { label: string; message: string }[] = [
  { label: "일정 만들기", message: "새 일정을 만들고 싶어요." },
  { label: "일정 논의하기", message: "오늘 일정을 같이 살펴봐 주세요." },
  { label: "회고하기", message: "오늘 한 일을 회고하고 싶어요." },
] as const;

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

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isPending) return;
    setError(null);
    const next: ChatMessage[] = [
      ...messages,
      pendingMeta
        ? { role: "user", content: trimmed, meta: pendingMeta }
        : { role: "user", content: trimmed },
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

  function handleFormSubmit(form: FormData) {
    const raw = form.get("text");
    send(typeof raw === "string" ? raw : "");
  }

  const showQuickActions = messages.length === 0 && !isPending;

  return (
    <div className="flex h-full min-h-[400px] flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-950">
      <header className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <span
          aria-hidden
          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-300"
        >
          ✨
        </span>
        <span>일정 어시스턴트</span>
        {context && (
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-normal text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
            <span aria-label="대화 중인 일정">{context.time} {context.title}</span>
            <button
              type="button"
              onClick={() => onContextClear?.()}
              aria-label="컨텍스트 해제"
              className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-blue-500 transition-colors hover:bg-blue-200 hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:text-blue-300 dark:hover:bg-blue-800 dark:hover:text-blue-50 dark:focus-visible:ring-offset-slate-950"
            >
              ×
            </button>
          </span>
        )}
      </header>

      <ol className="flex-1 space-y-3 overflow-y-auto text-sm">
        {messages.length === 0 && !isPending && (
          <li className="rounded-md bg-slate-50 p-3 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            안녕하세요. 일정을 자연어로 만들고 회고할 수 있게 도와드릴게요.
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
              <span className="rounded-md bg-blue-500 px-3 py-2 text-white">
                {m.content}
              </span>
            </li>
          ) : (
            <li key={i} className="mr-8 space-y-1.5">
              <AssistantLabel />
              {(m.content || isPending) && (
                <div className="rounded-md bg-slate-100 px-3 py-2 text-slate-800 dark:bg-slate-800 dark:text-slate-100">
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
          <li className="mr-8 space-y-1.5">
            <AssistantLabel />
            <div className="rounded-md bg-slate-100 px-3 py-2 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              생각 중…
            </div>
          </li>
        )}
        {error && (
          <li className="mr-8 rounded-md bg-red-50 px-3 py-2 text-red-700 dark:bg-red-900/30 dark:text-red-400">
            {error}
          </li>
        )}
      </ol>

      {showQuickActions && (
        <div
          aria-label="빠른 액션"
          className="flex flex-wrap gap-2"
        >
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => send(action.message)}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-200"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      <form action={handleFormSubmit} className="flex gap-2">
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
          className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={isPending || input.trim().length === 0}
          className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          보내기
        </button>
      </form>
    </div>
  );
});

/** 어시스턴트 응답 위에 붙는 작은 프로필 + 이름 라벨. Gemini/ChatGPT 결의 시각 단서로
 *  "이건 내가 친 게 아니라 AI 가 한 말이다" 가 한눈에. */
function AssistantLabel() {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
      <span
        aria-hidden
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[11px] text-blue-600 dark:bg-blue-950 dark:text-blue-300"
      >
        ✨
      </span>
      <span>일정 어시스턴트</span>
    </div>
  );
}
