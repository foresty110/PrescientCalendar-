"use client";

import { formatInTimeZone } from "date-fns-tz";

import type { TimelineStatus } from "./status";

const KST = "Asia/Seoul";

export interface ScheduleCardItem {
  scheduledRunId: string;
  title: string;
  scheduledStartAt: string; // ISO
  scheduledDurationMin: number;
  status: TimelineStatus;
}

interface ScheduleCardProps {
  item: ScheduleCardItem;
  onSelect: (item: ScheduleCardItem) => void;
}

/** 시간 컬럼(좌) + 노드(가운데 가이드라인) + 카드 본문(우) 3분할.
 *  요구사항 §3.2 의 4가지 상태 (완료 / 지연·미완(needs_retro·missed) / 다가오는 / 진행중)
 *  를 색·취소선·노드 채움으로 구분. Phase 1 한정이라 강조 카드·확률바·메타는 생략. */
export function ScheduleCard({ item, onSelect }: ScheduleCardProps) {
  const start = new Date(item.scheduledStartAt);
  const time = formatInTimeZone(start, KST, "HH:mm");
  const ariaStatus = STATUS_KO[item.status];

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
          "group w-full rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-slate-50 dark:hover:bg-slate-900 " +
          CARD_CLASS[item.status]
        }
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={`truncate font-medium ${TITLE_CLASS[item.status]}`}
            title={item.title}
          >
            {item.title}
          </span>
          {BADGE[item.status] && (
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${BADGE[item.status]?.className}`}>
              {BADGE[item.status]?.label}
            </span>
          )}
        </div>
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

const CARD_CLASS: Record<TimelineStatus, string> = {
  completed: "",
  missed: "",
  needs_retro: "",
  in_progress: "",
  upcoming: "",
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
