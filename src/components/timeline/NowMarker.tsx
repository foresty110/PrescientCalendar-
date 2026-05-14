"use client";

import { formatInTimeZone } from "date-fns-tz";

const KST = "Asia/Seoul";

/** 시간순으로 정렬된 카드 사이에 끼워 넣는 "지금" 행.
 *  좌측 시간 컬럼에 현재 HH:mm, 노드 컬럼에 빨간 펄스 점,
 *  본문 컬럼에 그라데이션 가이드 라인. */
export function NowMarker({ now }: { now: Date }) {
  return (
    <li
      aria-label="현재 시각"
      className="grid grid-cols-[32px_16px_1fr] items-center gap-2 py-1"
    >
      <span className="text-right text-[11px] tabular-nums font-medium text-red-500">
        {formatInTimeZone(now, KST, "HH:mm")}
      </span>
      <span className="flex justify-center">
        <span className="relative flex h-2.5 w-2.5 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
        </span>
      </span>
      <span className="flex items-center gap-2">
        <span className="h-px flex-1 bg-gradient-to-r from-red-400/80 via-red-300/40 to-transparent" />
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-red-500">
          지금
        </span>
      </span>
    </li>
  );
}
