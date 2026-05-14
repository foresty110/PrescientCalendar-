"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useTransition,
} from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** 채팅 헤더 컨텍스트 칩에 표시되는 일정 컨텍스트.
 *  Phase 2 에선 시각 단서 + 타임라인 선택 상태 동기화에만 사용.
 *  LLM 호출 시 시스템 프롬프트 주입은 Phase 3 로 미룸. */
export interface ChatContext {
  scheduledRunId: string;
  title: string;
  time: string; // "HH:mm" KST
}

interface ChatProps {
  /** 메시지 한 턴이 끝난 뒤 호출 — 캘린더 새로고침 등 외부 상태 갱신용 */
  onCompletion?: (toolCalls: { name: string }[]) => void;
  /** 현재 대화 컨텍스트 일정 (controlled — 부모 단계의 단일 진실 원천) */
  context?: ChatContext | null;
  /** 헤더 칩 × 클릭 시 호출 */
  onContextClear?: () => void;
}

/** 외부에서 채팅 입력란을 자동 채워주는 명령형 핸들 (요구사항 §4.1).
 *  컨텍스트 상태는 더 이상 핸들에 두지 않고 props 로 controlled. */
export interface ChatHandle {
  prefill: (text: string) => void;
}

export const Chat = forwardRef<ChatHandle, ChatProps>(function Chat(
  { onCompletion, context = null, onContextClear },
  ref,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      prefill: (text: string) => {
        setInput(text);
        // 다음 paint 이후 포커스 — 입력값 갱신이 DOM 에 반영된 뒤
        requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.setSelectionRange(text.length, text.length);
        });
      },
    }),
    [],
  );

  function send(form: FormData) {
    const raw = form.get("text");
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!text || isPending) return;
    setError(null);
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");

    startTransition(async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: next }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          text: string;
          toolCalls: { name: string }[];
        };
        setMessages((prev) => [...prev, { role: "assistant", content: data.text }]);
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
              className="ml-1 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-violet-500 transition-colors hover:bg-violet-200 hover:text-violet-900 dark:text-violet-300 dark:hover:bg-violet-800 dark:hover:text-violet-50"
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
        {messages.map((m, i) => (
          <li
            key={i}
            className={
              m.role === "user"
                ? "ml-8 rounded-md bg-slate-900 px-3 py-2 text-white dark:bg-slate-100 dark:text-slate-900"
                : "mr-8 rounded-md bg-slate-100 px-3 py-2 dark:bg-slate-800"
            }
          >
            {m.content || (m.role === "assistant" && isPending ? "…" : null)}
          </li>
        ))}
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
