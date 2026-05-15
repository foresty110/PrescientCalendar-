"use client";

import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";

const KST = "Asia/Seoul";

/** `create_event` 도구가 충돌 시 반환하는 결과 형태. AssistantMarkdown 본문과 별개로
 *  채팅 인라인 카드(ConflictAlternativesCard) 로 자동 렌더된다.
 *  Zod safeParse 통과한 결과만 카드로 그려서, 형태가 어긋나면 LLM 텍스트 본문만 남는다. */
export const conflictAlternativesSchema = z.object({
  ok: z.literal(false),
  reason: z.literal("conflict"),
  conflicts: z.array(
    z.object({
      scheduledRunId: z.string(),
      title: z.string(),
      startAt: z.string(),
    }),
  ),
  suggestedAlternatives: z.array(
    z.object({
      startAt: z.string(),
      label: z.string(),
    }),
  ),
  originalInput: z.object({
    title: z.string(),
    startAt: z.string(),
    durationMin: z.number(),
    description: z.string().nullable().optional(),
  }).passthrough(),
});

export type ConflictAlternativesData = z.infer<typeof conflictAlternativesSchema>;

interface ConflictAlternativesCardProps {
  data: ConflictAlternativesData;
  /** 대안 시각 버튼 클릭 시 호출 — 부모(Chat) 가 자동 채팅 메시지로 변환해 즉시 전송. */
  onPickAlternative: (alternative: { startAt: string; label: string }, originalInput: ConflictAlternativesData["originalInput"]) => void;
  /** '그래도 만들기' 버튼 — 같은 시각·같은 제목으로 force=true 재호출 트리거. */
  onForceCreate: (originalInput: ConflictAlternativesData["originalInput"]) => void;
}

export function ConflictAlternativesCard({
  data,
  onPickAlternative,
  onForceCreate,
}: ConflictAlternativesCardProps) {
  const originalTime = formatInTimeZone(
    new Date(data.originalInput.startAt),
    KST,
    "M월 d일 (eee) HH:mm",
  );

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[12px] dark:border-amber-900/50 dark:bg-amber-950/30">
      <div className="mb-2 font-medium text-amber-900 dark:text-amber-100">
        같은 시간에 다른 일정이 있어서 못 잡았어요
      </div>
      <ul className="mb-3 space-y-0.5 text-amber-800 dark:text-amber-200">
        {data.conflicts.map((c) => (
          <li key={c.scheduledRunId} className="text-[11px]">
            · <span className="font-medium">{c.title}</span>{" "}
            ({formatInTimeZone(new Date(c.startAt), KST, "HH:mm")} 시작)
          </li>
        ))}
      </ul>

      {data.suggestedAlternatives.length > 0 && (
        <>
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-300">
            다른 시간으로 잡기
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.suggestedAlternatives.map((alt) => (
              <button
                key={alt.startAt}
                type="button"
                onClick={() => onPickAlternative(alt, data.originalInput)}
                className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-200"
              >
                <span className="block">{alt.label}</span>
                <span className="block text-[10px] font-normal text-slate-500 dark:text-slate-400">
                  {formatInTimeZone(new Date(alt.startAt), KST, "HH:mm")}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mt-3 border-t border-amber-200 pt-2 dark:border-amber-900/60">
        <button
          type="button"
          onClick={() => onForceCreate(data.originalInput)}
          className="text-[11px] font-medium text-amber-800 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 dark:text-amber-200"
          title={`${originalTime} 그대로 두 일정 모두 두기`}
        >
          그래도 {originalTime} 로 만들기
        </button>
      </div>
    </div>
  );
}
