"use client";

import { formatInTimeZone } from "date-fns-tz";

import { InlineProbability } from "./InlineProbability";
import type { TimelineStatus } from "./status";

const KST = "Asia/Seoul";

export interface ScheduleCardItem {
  scheduledRunId: string;
  title: string;
  scheduledStartAt: string; // ISO
  scheduledDurationMin: number;
  status: TimelineStatus;
  feasibilityScore: number | null;
}

interface ScheduleCardProps {
  item: ScheduleCardItem;
  /** 미래 일정 중 가장 가까운 한 건만 true — 보라 배경·보더·마이크로카피로 시선 유도 */
  highlighted?: boolean;
  onSelect: (item: ScheduleCardItem) => void;
}

export function ScheduleCard({ item, highlighted, onSelect }: ScheduleCardProps) {
  const start = new Date(item.scheduledStartAt);
  const time = formatInTimeZone(start, KST, "HH:mm");
  const ariaStatus = STATUS_KO[item.status];

  // upcoming / in_progress 카드만 확률 바 노출 (이미 지나간 일정에 미래 예측은 의미 없음)
  const showProbability = item.status === "upcoming" || item.status === "in_progress";

  return (
    <li className="grid grid-cols-[32px_16px_1fr] items-start gap-2">
      <time
        dateTime={item.scheduledStartAt}
        className="pt-1.5 text-right text-[11px] tabular-nums text-slate-500 dark:text-slate-400"
      >
        {time}
      </time>

      <span className="relative flex justify-center pt-2">
        <span className={`block h-2.5 w-2.5 rounded-full ${NODE_CLASS[item.status]}`} />
      </span>

      <button
        type="button"
        onClick={() => onSelect(item)}
        aria-label={`${time} ${item.title} (${ariaStatus}) 일정에 대해 채팅 시작`}
        className={
          "group w-full rounded-md text-left text-[13px] transition-colors " +
          (highlighted
            ? "border border-violet-300 bg-violet-50 px-2 py-2 dark:border-violet-800 dark:bg-violet-950/40"
            : "px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-900")
        }
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={`truncate font-medium ${TITLE_CLASS[item.status]}`}
            title={item.title}
          >
            {item.title}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {showProbability && <InlineProbability score={item.feasibilityScore} />}
            {BADGE[item.status] && (
              <span className={`rounded px-1.5 py-0.5 text-[10px] ${BADGE[item.status]?.className}`}>
                {BADGE[item.status]?.label}
              </span>
            )}
          </div>
        </div>
        {highlighted && (
          <div className="mt-1 text-[10px] font-medium text-violet-700 dark:text-violet-300">
            💬 채팅으로 분석 보기 →
          </div>
        )}
      </button>
    </li>
  );
}

const STATUS_KO: Record<TimelineStatus, string> = {
  completed: "완료",
  missed: "스킵",
  needs_retro: "회고 필요",
  in_progress: "진행중",
  upcoming: "예정",
};

const NODE_CLASS: Record<TimelineStatus, string> = {
  completed: "bg-emerald-500",
  missed: "bg-slate-400 dark:bg-slate-500",
  needs_retro: "bg-amber-500",
  in_progress: "bg-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-900 animate-pulse",
  upcoming: "border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-950",
};

const TITLE_CLASS: Record<TimelineStatus, string> = {
  completed: "text-slate-500 line-through dark:text-slate-500",
  missed: "text-slate-500 dark:text-slate-500",
  needs_retro: "text-slate-900 dark:text-slate-100",
  in_progress: "text-slate-900 dark:text-slate-100",
  upcoming: "text-slate-900 dark:text-slate-100",
};

const BADGE: Record<
  TimelineStatus,
  { label: string; className: string } | null
> = {
  completed: {
    label: "완료",
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  },
  missed: {
    label: "스킵",
    className: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
  needs_retro: {
    label: "회고 필요",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  },
  in_progress: {
    label: "진행중",
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  },
  upcoming: null,
};
