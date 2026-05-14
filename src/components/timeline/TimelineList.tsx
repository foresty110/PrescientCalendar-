"use client";

import { NowMarker } from "./NowMarker";
import { ScheduleCard, type ScheduleCardItem } from "./ScheduleCard";

interface TimelineListProps {
  items: ScheduleCardItem[]; // 시간 오름차순 가정
  now: Date;
  onSelect: (item: ScheduleCardItem) => void;
  /** 채팅 컨텍스트로 활성된 일정 ID — 해당 카드가 violet 강조 + ring 시각 표시 */
  selectedScheduledRunId?: string | null;
}

/** 시간순 카드 사이 적절한 위치에 NowMarker 1개 삽입.
 *  엣지: 모든 일정이 과거 → 마지막에, 모든 일정이 미래 → 맨 앞에, 0건 → 빈 상태 한 줄.
 *
 *  강조 카드 한 건만:
 *  - 사용자가 선택한 카드가 있으면 그 카드 (어떤 상태든 — 강조가 그쪽으로 "이동")
 *  - 선택 없으면 NowMarker 직후 첫 upcoming 카드 (다음 다가올 일정 시선 유도)
 *  두 시각 단서(highlighted = 현재 분석 대상 / selected = 클릭 결과) 는 같은 카드에 누적. */
export function TimelineList({
  items,
  now,
  onSelect,
  selectedScheduledRunId = null,
}: TimelineListProps) {
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

  const nextCard = items.at(insertAt);
  const defaultHighlightedId =
    nextCard?.status === "upcoming" ? nextCard.scheduledRunId : null;
  const highlightedId = selectedScheduledRunId ?? defaultHighlightedId;

  return (
    <ol className="relative space-y-1">
      {/* 좌측 가이드 라인 (시간 컬럼과 노드 컬럼 사이) */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-[40px] top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-800"
      />
      {items.slice(0, insertAt).map((it) => (
        <ScheduleCard
          key={it.scheduledRunId}
          item={it}
          highlighted={it.scheduledRunId === highlightedId}
          selected={it.scheduledRunId === selectedScheduledRunId}
          onSelect={onSelect}
        />
      ))}
      <NowMarker now={now} />
      {items.slice(insertAt).map((it) => (
        <ScheduleCard
          key={it.scheduledRunId}
          item={it}
          highlighted={it.scheduledRunId === highlightedId}
          selected={it.scheduledRunId === selectedScheduledRunId}
          onSelect={onSelect}
        />
      ))}
    </ol>
  );
}
