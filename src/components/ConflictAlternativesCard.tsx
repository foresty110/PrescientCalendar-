"use client";

import { z } from "zod";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";

const KST = "Asia/Seoul";
const KO_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

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
      durationMin: z.number().int().min(5),
      label: z.string(),
    }),
  ),
  originalInput: z
    .object({
      title: z.string(),
      startAt: z.string(),
      durationMin: z.number(),
      description: z.string().nullable().optional(),
    })
    .passthrough(),
});

export type ConflictAlternativesData = z.infer<typeof conflictAlternativesSchema>;

interface ConflictAlternativesCardProps {
  data: ConflictAlternativesData;
  /** 대안 시각 버튼 클릭 시 호출 — 부모(Chat) 가 자연어 메시지로 변환해 즉시 전송. */
  onPickAlternative: (
    alternative: { startAt: string; durationMin: number; label: string },
    originalInput: ConflictAlternativesData["originalInput"],
  ) => void;
  /** 카드 이후 새 대화 turn 이 발생했거나 응답 대기 중일 때 true — 버튼 클릭 차단 + 옅은 톤.
   *  대안 클릭은 새 채팅 turn 을 시작하는 행위라, 이미 다른 주제로 넘어간 시점에 누르면
   *  대화 맥락이 어긋난다 (사용자 보고: "이전 대안 버튼이 늦게 클릭돼서 새 충돌 카드 발생"). */
  disabled?: boolean;
}

export function ConflictAlternativesCard({
  data,
  onPickAlternative,
  disabled = false,
}: ConflictAlternativesCardProps) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[12px] dark:border-amber-900/50 dark:bg-amber-950/30">
      <div className="mb-2 font-medium text-amber-900 dark:text-amber-100">
        같은 시간에 다른 일정이 있어요
      </div>
      <ul className="mb-3 space-y-0.5 text-amber-800 dark:text-amber-200">
        {data.conflicts.map((c) => (
          <li key={c.scheduledRunId} className="text-[11px]">
            · <span className="font-medium">{c.title}</span>{" "}
            ({formatInTimeZone(new Date(c.startAt), KST, "HH:mm")} 시작)
          </li>
        ))}
      </ul>

      {data.suggestedAlternatives.length > 0 ? (
        <>
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-300">
            다른 시각으로 잡기
          </div>
          <div className="flex flex-col gap-1.5">
            {data.suggestedAlternatives.map((alt) => (
              <button
                key={alt.startAt}
                type="button"
                onClick={() => onPickAlternative(alt, data.originalInput)}
                disabled={disabled}
                className={
                  "flex items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-[12px] font-medium text-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 " +
                  (disabled
                    ? "cursor-not-allowed opacity-60"
                    : "hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 dark:hover:border-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-200")
                }
                title={
                  disabled
                    ? "이미 다음 대화로 넘어간 대안 — 새 일정으로 다시 요청해 주세요"
                    : koDateTimeLabel(new Date(alt.startAt))
                }
              >
                <span className="flex-1 truncate">{alt.label}</span>
                <span className="shrink-0 text-[11px] font-normal text-slate-500 dark:text-slate-400">
                  {koDateTimeShort(new Date(alt.startAt))} · {alt.durationMin}분
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">
          가까운 시간대에 가용 슬롯을 찾지 못했어요. 직접 다른 시각을 입력해 주세요.
        </p>
      )}
    </div>
  );
}

/** KST 기준 "M월 d일 (요일) HH:mm" 한글 표기. date-fns-tz 의 EEEE 가 영문이라
 *  별도 KO_WEEKDAYS 매핑 사용. */
function koDateTimeLabel(d: Date): string {
  const month = formatInTimeZone(d, KST, "M");
  const day = formatInTimeZone(d, KST, "d");
  const hhmm = formatInTimeZone(d, KST, "HH:mm");
  const dow = toZonedTime(d, KST).getDay();
  // eslint-disable-next-line security/detect-object-injection -- dow 는 getDay 결과 0..6
  return `${month}월 ${day}일 (${KO_WEEKDAYS[dow]}) ${hhmm}`;
}

/** 버튼 부 라벨용 짧은 표기 — "HH:mm" 만. 같은 날 안에서 옵션끼리 시각 차이만 보면 충분. */
function koDateTimeShort(d: Date): string {
  return formatInTimeZone(d, KST, "HH:mm");
}
