"use client";

import { formatInTimeZone } from "date-fns-tz";

const KST = "Asia/Seoul";

interface TimelineHeaderProps {
  date: Date;
  count: number;
  /** "+ 추가" 버튼 클릭 시 호출 — 부모가 채팅 입력란을 포커스 (요구사항 §3.2) */
  onAddClick?: () => void;
}

export function TimelineHeader({ date, count, onAddClick }: TimelineHeaderProps) {
  const ymd = formatInTimeZone(date, KST, "M월 d일");
  const weekday = formatInTimeZone(date, KST, "EEEE");
  return (
    <header className="flex items-baseline justify-between gap-2">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        일정 목록
        <span className="ml-2 text-[11px] font-normal text-slate-500 dark:text-slate-400">
          {ymd} ({shortWeekday(weekday)}) · {count}건
        </span>
      </h2>
      {onAddClick && (
        <button
          type="button"
          onClick={onAddClick}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 dark:focus-visible:ring-offset-slate-950"
        >
          <span aria-hidden>+</span>
          <span>추가</span>
        </button>
      )}
    </header>
  );
}

function shortWeekday(en: string): string {
  // date-fns-tz 의 EEEE 는 ko locale 이 없으면 영문. 안전하게 한글 축약 매핑.
  switch (en) {
    case "Monday":
      return "월";
    case "Tuesday":
      return "화";
    case "Wednesday":
      return "수";
    case "Thursday":
      return "목";
    case "Friday":
      return "금";
    case "Saturday":
      return "토";
    case "Sunday":
      return "일";
    default:
      return en.slice(0, 3);
  }
}
