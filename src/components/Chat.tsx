"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useTransition,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { formatInTimeZone } from "date-fns-tz";

import {
  ConflictAlternativesCard,
  conflictAlternativesSchema,
  type ConflictAlternativesData,
} from "@/components/ConflictAlternativesCard";
import {
  FeasibilityCard,
  feasibilityOutputSchema,
  type FeasibilityCardData,
} from "@/components/FeasibilityCard";

const KST = "Asia/Seoul";

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
  /** assistant 메시지에 한해 — create_event 가 충돌로 거부됐을 때 대안 카드 데이터. */
  conflictCards?: ConflictAlternativesData[];
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

/** create_event 호출 결과 중 ok=false(충돌 거부) 인 것만 추려 충돌 카드 데이터로 변환. */
function extractConflictCards(toolCalls: ToolCallSummary[]): ConflictAlternativesData[] {
  return toolCalls
    .filter((c) => c.name === "create_event")
    .map((c) => conflictAlternativesSchema.safeParse(c.output))
    .filter((r): r is { success: true; data: ConflictAlternativesData } => r.success)
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
  const listRef = useRef<HTMLOListElement>(null);

  // 새 메시지가 추가되거나 응답 대기 상태가 바뀔 때 스크롤을 맨 아래로 — 사용자가 방금 보낸 메시지가
  // 시야 밖으로 잘려 "안 보내진 것처럼" 보이는 인지 오류를 막는다.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isPending]);

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
        const conflictCards = extractConflictCards(data.toolCalls);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.text,
            ...(feasibilityCards.length > 0 ? { feasibilityCards } : {}),
            ...(conflictCards.length > 0 ? { conflictCards } : {}),
          },
        ]);
        if (data.toolCalls.length > 0) onCompletion?.(data.toolCalls);
      } catch (e) {
        setError(e instanceof Error ? e.message : "알 수 없는 오류");
      }
    });
  }

  /** 충돌 카드에서 대안 시각 버튼 클릭 → 자연어 채팅 메시지로 즉시 전송.
   *  LLM 이 create_event 를 새 시각·동일 제목으로 다시 호출하게 한다. */
  function pickConflictAlternative(
    alt: { startAt: string; label: string },
    original: ConflictAlternativesData["originalInput"],
  ) {
    const newTime = formatInTimeZone(new Date(alt.startAt), KST, "M월 d일 HH:mm");
    send(`${newTime} 로 ${original.title} ${original.durationMin}분 잡아줘`);
  }

  // 빈 상태뿐 아니라 한 턴 대화가 마무리된 시점(마지막 메시지가 assistant) 에도 다시 노출 —
  // 직전 주제 흐름이 끝나면 사용자가 다음 의도(만들기/논의/회고) 를 빠르게 선택할 수 있게.
  const lastMessage = messages[messages.length - 1];
  const showQuickActions =
    !isPending && (messages.length === 0 || lastMessage?.role === "assistant");

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

      <ol ref={listRef} className="flex-1 space-y-3 overflow-y-auto text-sm">
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
              {/* 충돌 카드가 있으면 카드가 정보 + 안내를 모두 담고 있어 LLM 텍스트는 중복이 됨 — 카드만 노출.
                  feasibility 카드 등은 텍스트와 보완 관계라 함께 노출. */}
              {!m.conflictCards?.length && (m.content || isPending) && (
                <div className="rounded-md bg-slate-100 px-3 py-2 text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                  {m.content ? (
                    <AssistantMarkdown content={m.content} />
                  ) : (
                    "…"
                  )}
                </div>
              )}
              {m.feasibilityCards?.map((card, j) => (
                <FeasibilityCard key={j} data={card} />
              ))}
              {m.conflictCards?.map((card, j) => (
                <ConflictAlternativesCard
                  key={`conflict-${j}`}
                  data={card}
                  onPickAlternative={pickConflictAlternative}
                />
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

      {/* form action 대신 onSubmit 사용 — React 19 form action 은 호출 함수를 자동으로 transition 으로 감싸
          setMessages/setInput 같은 urgent 업데이트가 지연돼 "보낸 메시지가 화면에 안 떠 보이는" 인지 문제를
          유발한다. onSubmit 에서 직접 send 를 호출하면 사용자 메시지 추가·입력란 비우기가 즉시 반영된다. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <input
          ref={inputRef}
          type="text"
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
          placeholder="일정을 직접 만들거나 상의해보세요.."
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

/** LLM 응답을 마크다운으로 렌더 — 줄바꿈·**굵게**·리스트·표·인라인 코드 모두 살아남는다.
 *  Tailwind 로 직접 스타일링해 채팅 말풍선 안에서 어색하지 않게 컴팩트. 외부 링크는 새 탭 + noopener. */
function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2">{children}</p>,
          ul: ({ children }) => (
            <ul className="mb-2 ml-5 list-disc space-y-0.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 ml-5 list-decimal space-y-0.5">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-slate-900 dark:text-slate-50">
              {children}
            </strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children, className }) => {
            const isBlock = className?.startsWith("language-");
            if (isBlock) {
              return (
                <pre className="my-2 overflow-x-auto rounded bg-slate-200 p-2 text-[12px] text-slate-800 dark:bg-slate-700 dark:text-slate-100">
                  <code>{children}</code>
                </pre>
              );
            }
            return (
              <code className="rounded bg-slate-200 px-1 py-0.5 text-[0.92em] text-slate-800 dark:bg-slate-700 dark:text-slate-100">
                {children}
              </code>
            );
          },
          h1: ({ children }) => (
            <h3 className="mb-1 mt-2 text-base font-semibold">{children}</h3>
          ),
          h2: ({ children }) => (
            <h3 className="mb-1 mt-2 text-base font-semibold">{children}</h3>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-2 text-sm font-semibold">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="mb-1 mt-2 text-sm font-semibold">{children}</h4>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline hover:text-blue-700 dark:text-blue-400"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-slate-300 pl-3 text-slate-600 dark:border-slate-600 dark:text-slate-400">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-2 border-slate-300 dark:border-slate-700" />,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-slate-300 bg-slate-200 px-2 py-1 text-left font-semibold dark:border-slate-600 dark:bg-slate-700">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-slate-300 px-2 py-1 dark:border-slate-600">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

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
