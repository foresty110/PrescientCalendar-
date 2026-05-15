"use client";

import { useEffect, useMemo, useState } from "react";
import { fromZonedTime } from "date-fns-tz";

import { pickDateLabel, todayKstDateKey } from "@/lib/date-labels";

import { EmptyState } from "./EmptyState";
import { TimelineHeader } from "./TimelineHeader";
import { TimelineList } from "./TimelineList";
import { deriveStatus, isAllDayDuration } from "./status";
import { ScheduleCard, type ScheduleCardItem } from "./ScheduleCard";

const KST = "Asia/Seoul";

interface ScheduledRunItem {
  scheduledRunId: string;
  title: string;
  description: string | null;
  scheduledStartAt: string;
  scheduledDurationMin: number;
  feasibilityScore: number | null;
  actualRun?: {
    actualStartAt: string;
    actualDurationMin: number;
    status: "done" | "skipped" | "late";
  };
}

interface TodayTimelineProps {
  /** 부모(`AppShell`)가 채팅 응답 끝났을 때 +1 — Calendar 와 동일 패턴 */
  refreshKey?: number;
  /** 카드 클릭 시 채팅 입력란에 자동 채울 문장을 부모로 위임 */
  onSelect: (item: ScheduleCardItem) => void;
  /** 헤더 "+ 추가" 버튼 / 빈 상태 "+ 일정 추가" 클릭 시 부모가 채팅 입력란 포커스 */
  onAddClick?: () => void;
  /** 빈 상태 예시 칩 클릭 시 — 그 문장이 채팅 입력란에 prefill 된다 */
  onExampleClick?: (text: string) => void;
  /** 현재 채팅 컨텍스트로 선택된 일정 ID — 해당 카드가 시각적으로 강조됨 */
  selectedScheduledRunId?: string | null;
  /** 보여줄 KST 'yyyy-MM-dd' 날짜. 안 주면 내부에서 오늘로 계산. */
  selectedDateKey?: string;
}

export function TodayTimeline({
  refreshKey = 0,
  onSelect,
  onAddClick,
  onExampleClick,
  selectedScheduledRunId = null,
  selectedDateKey,
}: TodayTimelineProps) {
  const [items, setItems] = useState<ScheduledRunItem[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 보여줄 날짜 — props 가 없으면 오늘로 fallback. now state 변화에 따라 자정 넘어가면 자동으로 새 "오늘" 키로 갱신.
  const todayKey = todayKstDateKey(now);
  const effectiveDateKey = selectedDateKey ?? todayKey;
  const isToday = effectiveDateKey === todayKey;

  // 1분마다 현재 시각 갱신 — "지금" 마커 이동. 오늘 보고 있을 때만 의미 있어 그 외엔 멈춤.
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [isToday]);

  // 선택된 KST 날짜 00:00 ~ 24:00 — yyyy-MM-dd 키만 의존성에 두어 자정 넘기 전까지 동일 range.
  const range = useMemo(
    () => ({
      fromIso: startOfKstDayFromKey(effectiveDateKey).toISOString(),
      toIso: endOfKstDayFromKey(effectiveDateKey).toISOString(),
    }),
    [effectiveDateKey],
  );

  // 헤더·prefill 메시지에 쓰는 보조 카피("오늘"/"어제"/"내일"/"M월 d일 (요일)") — EmptyState 가 직접 사용.
  const dateLabel = pickDateLabel(effectiveDateKey, todayKey);

  // 날짜를 바꿨을 때 이전 날짜의 카드가 잠깐 보여 "잘못된 것 아닌가" 혼동되는 걸 막기 위해
  // items 를 즉시 비운다. refreshKey 갱신(같은 날짜 재조회) 에선 stale 카드를 유지해 flicker 회피.
  useEffect(() => {
    setItems([]);
  }, [effectiveDateKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      from: range.fromIso,
      to: range.toIso,
      withActualRun: "true",
    });
    fetch(`/api/events?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as { items: ScheduledRunItem[] };
      })
      .then((data) => {
        if (cancelled) return;
        const sorted = [...data.items].sort(
          (a, b) =>
            new Date(a.scheduledStartAt).getTime() -
            new Date(b.scheduledStartAt).getTime(),
        );
        setItems(sorted);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "조회 실패");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, refreshKey]);

  const cards: ScheduleCardItem[] = items.map((it) => ({
    scheduledRunId: it.scheduledRunId,
    title: it.title,
    description: it.description,
    scheduledStartAt: it.scheduledStartAt,
    scheduledDurationMin: it.scheduledDurationMin,
    feasibilityScore: it.feasibilityScore,
    isAllDay: isAllDayDuration(it.scheduledDurationMin),
    status: deriveStatus(
      {
        scheduledStartAt: it.scheduledStartAt,
        scheduledDurationMin: it.scheduledDurationMin,
      },
      it.actualRun,
      now,
    ),
  }));

  // 종일 / 시간형 분리 — 종일은 NowMarker 흐름에서 빠지고 별도 섹션으로 묶인다.
  // 시작 시각 정렬은 상위에서 이미 끝났으므로 partition 만.
  const allDayCards = cards.filter((c) => c.isAllDay);
  const timedCards = cards.filter((c) => !c.isAllDay);

  const showEmptyState = !loading && !error && cards.length === 0;

  // 헤더 메타 라인이 표시하는 날짜 — 보여주는 KST 날짜를 그대로 (now 가 아니라 effectiveDate 의 자정 UTC).
  const headerDate = startOfKstDayFromKey(effectiveDateKey);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-950">
      <TimelineHeader date={headerDate} count={cards.length} onAddClick={onAddClick} />
      {loading && items.length === 0 ? (
        <div
          className="flex items-center justify-center gap-2 px-2 py-8 text-[12px] text-slate-500 dark:text-slate-400"
          aria-live="polite"
          aria-busy="true"
        >
          <span
            aria-hidden
            className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500 dark:border-slate-700 dark:border-t-blue-400"
          />
          <span>{dateLabel} 일정 불러오는 중…</span>
        </div>
      ) : error ? (
        <p className="px-2 py-6 text-center text-[12px] text-red-500">{error}</p>
      ) : showEmptyState ? (
        <EmptyState
          onAddClick={onAddClick}
          onExampleClick={onExampleClick}
          dateLabel={dateLabel}
        />
      ) : (
        <>
          {allDayCards.length > 0 && (
            <section
              aria-labelledby="all-day-heading"
              className="border-b border-slate-100 pb-2 dark:border-slate-900"
            >
              <h3
                id="all-day-heading"
                className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400"
              >
                종일
              </h3>
              <ol className="space-y-1">
                {allDayCards.map((it) => (
                  <ScheduleCard
                    key={it.scheduledRunId}
                    item={it}
                    selected={it.scheduledRunId === selectedScheduledRunId}
                    onSelect={onSelect}
                  />
                ))}
              </ol>
            </section>
          )}
          {timedCards.length > 0 && (
            <TimelineList
              items={timedCards}
              now={now}
              onSelect={onSelect}
              selectedScheduledRunId={selectedScheduledRunId}
              showNowMarker={isToday}
            />
          )}
        </>
      )}
    </div>
  );
}

/** 'yyyy-MM-dd' KST 키 → 해당 KST 00:00 의 UTC Date. fromZonedTime 한 줄. */
function startOfKstDayFromKey(dateKey: string): Date {
  return fromZonedTime(`${dateKey}T00:00:00`, KST);
}

/** 'yyyy-MM-dd' KST 키 → 다음 날 KST 00:00 (배타적 범위 끝) 의 UTC Date. */
function endOfKstDayFromKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number) as [number, number, number];
  const nextDay = new Date(Date.UTC(y, m - 1, d + 1));
  const nextKey = nextDay.toISOString().slice(0, 10);
  return fromZonedTime(`${nextKey}T00:00:00`, KST);
}
