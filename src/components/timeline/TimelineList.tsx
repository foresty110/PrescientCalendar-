"use client";

import { NowMarker } from "./NowMarker";
import { ScheduleCard, type ScheduleCardItem } from "./ScheduleCard";

interface TimelineListProps {
  items: ScheduleCardItem[]; // 시간 오름차순 가정
  now: Date;
  onSelect: (item: ScheduleCardItem) => void;
}

/** 시간순 카드 사이 적절한 위치에 NowMarker 1개 삽입.
 *  엣지: 모든 일정이 과거 → 마지막에, 모든 일정이 미래 → 맨 앞에, 0건 → 빈 상태 한 줄.
 *  강조 대상: 미래(upcoming) 일정 중 시간상 가장 가까운 첫 카드 한 건. */
export function TimelineList({ items, now, onSelect }: TimelineListProps) {
  if (items.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-[12px] text-slate-500 dark:text-slate-400">
        오늘은 일정이 없어요.
      </p>
    );
  }

  const nowMs = now.getTime();
  // first index whose scheduledStartAt > now → 그 직전에 NowMarker 삽입.
  let insertAt = items.findIndex(
    (it) => new Date(it.scheduledStartAt).getTime() > nowMs,
  );
  if (insertAt === -1) insertAt = items.length; // 전부 과거

  // 강조할 카드 = NowMarker 직후 첫 upcoming 카드
  const nextCard = items.at(insertAt);
  const highlightedId =
    nextCard && nextCard.status === "upcoming" ? nextCard.scheduledRunId : null;

  return (
    <ol className="relative space-y-1">
      {/* 좌측 가이드 라인 (시간 컬럼과 노드 컬럼 사이) */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-[40px] top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-800"
      />
      {items.slice(0, insertAt).map((it) => (
        <ScheduleCard key={it.scheduledRunId} item={it} onSelect={onSelect} />
      ))}
      <NowMarker now={now} />
      {items.slice(insertAt).map((it) => (
        <ScheduleCard
          key={it.scheduledRunId}
          item={it}
          highlighted={it.scheduledRunId === highlightedId}
          onSelect={onSelect}
        />
      ))}
    </ol>
  );
}
