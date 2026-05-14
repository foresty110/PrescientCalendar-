"use client";

import { useEffect, useMemo, useState } from "react";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";

import { TimelineHeader } from "./TimelineHeader";
import { TimelineList } from "./TimelineList";
import { deriveStatus } from "./status";
import type { ScheduleCardItem } from "./ScheduleCard";

const KST = "Asia/Seoul";

interface ScheduledRunItem {
  scheduledRunId: string;
  title: string;
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
  /** 현재 채팅 컨텍스트로 선택된 일정 ID — 해당 카드가 시각적으로 강조됨 */
  selectedScheduledRunId?: string | null;
}

export function TodayTimeline({
  refreshKey = 0,
  onSelect,
  selectedScheduledRunId = null,
}: TodayTimelineProps) {
  const [items, setItems] = useState<ScheduledRunItem[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1분마다 현재 시각 갱신 — "지금" 마커 이동
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // 오늘 KST 00:00 ~ 24:00 — yyyy-MM-dd 키로 메모이즈해 자정 넘기 전까지 동일 range
  const dateKey = formatInTimeZone(now, KST, "yyyy-MM-dd");
  const range = useMemo(
    () => ({
      fromIso: startOfKstDay(now).toISOString(),
      toIso: endOfKstDay(now).toISOString(),
    }),
    [dateKey], // eslint 룰 미정이라 disable 코멘트 없이도 통과
  );

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
    scheduledStartAt: it.scheduledStartAt,
    scheduledDurationMin: it.scheduledDurationMin,
    feasibilityScore: it.feasibilityScore,
    status: deriveStatus(
      {
        scheduledStartAt: it.scheduledStartAt,
        scheduledDurationMin: it.scheduledDurationMin,
      },
      it.actualRun,
      now,
    ),
  }));

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
      <TimelineHeader date={now} count={cards.length} />
      {loading && items.length === 0 ? (
        <p className="px-2 py-6 text-center text-[12px] text-slate-400">로딩…</p>
      ) : error ? (
        <p className="px-2 py-6 text-center text-[12px] text-red-500">{error}</p>
      ) : (
        <TimelineList
          items={cards}
          now={now}
          onSelect={onSelect}
          selectedScheduledRunId={selectedScheduledRunId}
        />
      )}
    </div>
  );
}

function startOfKstDay(d: Date): Date {
  const z = toZonedTime(d, KST);
  z.setHours(0, 0, 0, 0);
  return new Date(formatInTimeZone(z, KST, "yyyy-MM-dd'T'HH:mm:ssXXX"));
}

function endOfKstDay(d: Date): Date {
  const z = toZonedTime(d, KST);
  z.setHours(0, 0, 0, 0);
  z.setDate(z.getDate() + 1);
  return new Date(formatInTimeZone(z, KST, "yyyy-MM-dd'T'HH:mm:ssXXX"));
}
