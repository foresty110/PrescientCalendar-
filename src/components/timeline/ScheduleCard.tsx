"use client";

import type { KeyboardEvent } from "react";
import { formatInTimeZone } from "date-fns-tz";

import { InlineProbability } from "./InlineProbability";
import type { TimelineStatus } from "./status";

const KST = "Asia/Seoul";

export interface ScheduleCardItem {
  scheduledRunId: string;
  title: string;
  /** Event 의 사전 메모 — 있으면 카드 본문에 한 줄 텍스트로 노출 (긴 경우 truncate, title 속성으로 전문) */
  description: string | null;
  scheduledStartAt: string; // ISO
  scheduledDurationMin: number;
  status: TimelineStatus;
  feasibilityScore: number | null;
  /** 종일 일정 — `isAllDayDuration` 로 판정. true 면 카드가 시간 라인 대신 "종일" 라벨로 렌더되고,
   *  TodayTimeline 이 별도 "종일" 섹션으로 분리해 보낸다. */
  isAllDay: boolean;
}

interface ScheduleCardProps {
  item: ScheduleCardItem;
  /** 미래 일정 중 가장 가까운 한 건만 true — 보라 배경·보더·마이크로카피로 시선 유도 */
  highlighted?: boolean;
  /** 현재 채팅 컨텍스트로 활성된 카드 — 외곽 ring + 좌측 violet 줄로 "선택됨" 표시 */
  selected?: boolean;
  onSelect: (item: ScheduleCardItem) => void;
}

export function ScheduleCard({ item, highlighted, selected, onSelect }: ScheduleCardProps) {
  const start = new Date(item.scheduledStartAt);
  const end = new Date(start.getTime() + item.scheduledDurationMin * 60_000);
  const time = formatInTimeZone(start, KST, "HH:mm");
  const endTime = formatInTimeZone(end, KST, "HH:mm");
  const ariaStatus = STATUS_KO[item.status];

  // upcoming / in_progress 카드만 확률 바 노출 (이미 지나간 일정에 미래 예측은 의미 없음)
  const showProbability = item.status === "upcoming" || item.status === "in_progress";
  const timeLabel = item.isAllDay ? "종일" : `${time} – ${endTime}`;
  const ariaWhen = item.isAllDay ? "종일" : time;

  return (
    <li className="grid grid-cols-[32px_16px_1fr] items-start gap-2">
      {item.isAllDay ? (
        <span
          aria-hidden
          className="pt-1.5 text-right text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500"
        >
          종일
        </span>
      ) : (
        <time
          dateTime={item.scheduledStartAt}
          className="pt-1.5 text-right text-[11px] tabular-nums text-slate-500 dark:text-slate-400"
        >
          {time}
        </time>
      )}

      <span className="relative flex justify-center pt-2">
        <span className={`block h-2.5 w-2.5 rounded-full ${NODE_CLASS[item.status]}`} />
      </span>

      <button
        type="button"
        onClick={() => onSelect(item)}
        onKeyDown={handleCardKeyDown}
        aria-pressed={selected}
        aria-label={`${ariaWhen} ${item.title} (${ariaStatus}) 일정에 대해 채팅 시작`}
        data-timeline-card="true"
        className={
          "group relative w-full rounded-md text-left text-[13px] transition-all " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950 " +
          (highlighted
            ? "border border-violet-300 bg-violet-50 px-2 py-2 dark:border-violet-800 dark:bg-violet-950/40"
            : "px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-900") +
          (selected
            ? " ring-2 ring-violet-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-950"
            : "")
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
        <div
          className={
            "mt-0.5 text-[11px] tabular-nums " +
            (highlighted
              ? "text-[color:var(--color-brand-primary)]"
              : "text-slate-500 dark:text-slate-400")
          }
        >
          {timeLabel}
        </div>
        {item.description && (
          <div
            className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400"
            title={item.description}
          >
            {item.description}
          </div>
        )}
        {highlighted && (
          <div className="mt-1 text-[10px] font-medium text-[color:var(--color-brand-primary)]">
            💬 채팅으로 분석 보기 →
          </div>
        )}
      </button>
    </li>
  );
}

/** 화살표/Home/End 로 타임라인 카드 사이를 이동. data-timeline-card 가 붙은 모든 카드 button 을
 *  순서대로 모아 현재 포커스 위치 기준 이동. 종일·시간형 어느 섹션에 있어도 같은 흐름. */
function handleCardKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
  const navKey =
    e.key === "ArrowDown" ||
    e.key === "ArrowUp" ||
    e.key === "Home" ||
    e.key === "End";
  if (!navKey) return;
  e.preventDefault();
  const all = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-timeline-card="true"]'),
  );
  if (all.length === 0) return;
  const cur = all.indexOf(e.currentTarget);
  let nextIdx = cur;
  if (e.key === "ArrowDown") nextIdx = Math.min(cur + 1, all.length - 1);
  else if (e.key === "ArrowUp") nextIdx = Math.max(cur - 1, 0);
  else if (e.key === "Home") nextIdx = 0;
  else if (e.key === "End") nextIdx = all.length - 1;
  all.at(nextIdx)?.focus();
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
