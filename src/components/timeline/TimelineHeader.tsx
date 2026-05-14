"use client";

import { formatInTimeZone } from "date-fns-tz";

const KST = "Asia/Seoul";

interface TimelineHeaderProps {
  date: Date;
  count: number;
}

export function TimelineHeader({ date, count }: TimelineHeaderProps) {
  const ymd = formatInTimeZone(date, KST, "M월 d일");
  const weekday = formatInTimeZone(date, KST, "EEEE");
  return (
    <header className="flex items-baseline justify-between">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        오늘의 일정
        <span className="ml-2 text-[11px] font-normal text-slate-500 dark:text-slate-400">
          {ymd} ({shortWeekday(weekday)}) · {count}건
        </span>
      </h2>
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
