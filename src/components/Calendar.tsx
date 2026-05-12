"use client";

import { useEffect, useMemo, useState } from "react";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";

import { RetrospectModal, type RetrospectModalTarget } from "@/components/RetrospectModal";

const KST = "Asia/Seoul";

interface ScheduledRunItem {
  scheduledRunId: string;
  title: string;
  scheduledStartAt: string; // ISO
  scheduledDurationMin: number;
  feasibilityScore: number | null;
  actualRun?: {
    actualStartAt: string;
    actualDurationMin: number;
    status: "done" | "skipped" | "late";
  };
}

interface CalendarProps {
  /** 외부에서 부모가 새로고침 트리거를 변경할 때마다 다시 fetch */
  refreshKey?: number;
}

export function Calendar({ refreshKey = 0 }: CalendarProps) {
  const [now] = useState(() => new Date());
  const [items, setItems] = useState<ScheduledRunItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);
  const [retroTarget, setRetroTarget] = useState<RetrospectModalTarget | null>(null);

  // ISO 문자열로 메모이즈 — Date 객체 ID 안정화 (무한 refetch 방지)
  const range = useMemo(() => {
    return {
      fromIso: startOfKstMonth(now).toISOString(),
      toIso: endOfKstMonth(now).toISOString(),
    };
  }, [now]);

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
        if (!cancelled) setItems(data.items);
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
  }, [range, refreshKey, localRefresh]);

  const days = monthGrid(now);

  // 일별 이벤트 묶기
  const itemsByDay = new Map<string, ScheduledRunItem[]>();
  for (const item of items) {
    const key = formatInTimeZone(new Date(item.scheduledStartAt), KST, "yyyy-MM-dd");
    const arr = itemsByDay.get(key) ?? [];
    arr.push(item);
    itemsByDay.set(key, arr);
  }

  return (
    <div className="flex h-full min-h-[400px] flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
      <header className="flex items-center justify-between text-sm">
        <span className="font-semibold text-slate-600 dark:text-slate-300">
          {formatInTimeZone(now, KST, "yyyy년 M월")}
        </span>
        {loading && <span className="text-xs text-slate-400">로딩…</span>}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </header>

      <div className="grid flex-1 grid-cols-7 gap-px overflow-hidden rounded border border-slate-200 bg-slate-200 text-xs dark:border-slate-800 dark:bg-slate-800">
        {["월", "화", "수", "목", "금", "토", "일"].map((d) => (
          <div
            key={d}
            className="bg-slate-50 px-2 py-1 text-center text-slate-500 dark:bg-slate-900 dark:text-slate-400"
          >
            {d}
          </div>
        ))}
        {days.map((d) => {
          const key = formatInTimeZone(d.date, KST, "yyyy-MM-dd");
          const dayItems = itemsByDay.get(key) ?? [];
          return (
            <div
              key={key}
              className={
                "min-h-[80px] bg-white px-2 py-1 dark:bg-slate-950 " +
                (d.inMonth ? "" : "text-slate-300 dark:text-slate-700") +
                (d.isToday ? " ring-2 ring-inset ring-slate-900 dark:ring-slate-100" : "")
              }
            >
              <div className="mb-1 text-right">{formatInTimeZone(d.date, KST, "d")}</div>
              <ul className="space-y-0.5">
                {dayItems.slice(0, 3).map((it) => {
                  const isPast = new Date(it.scheduledStartAt).getTime() <= now.getTime();
                  const hasRetro = !!it.actualRun;
                  return (
                    <li key={it.scheduledRunId}>
                      <button
                        type="button"
                        onClick={() =>
                          setRetroTarget({
                            scheduledRunId: it.scheduledRunId,
                            title: it.title,
                            scheduledStartAt: it.scheduledStartAt,
                            scheduledDurationMin: it.scheduledDurationMin,
                            ...(it.actualRun ? { existing: it.actualRun } : {}),
                          })
                        }
                        disabled={!isPast}
                        className={
                          "flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[10px] " +
                          (hasRetro
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                            : isPast
                              ? "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60"
                              : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200") +
                          (isPast ? " cursor-pointer" : " cursor-default")
                        }
                        title={feasibilityTooltip(it, isPast, hasRetro)}
                      >
                        <FeasibilityBadge score={it.feasibilityScore} />
                        <span className="truncate">
                          {formatInTimeZone(new Date(it.scheduledStartAt), KST, "HH:mm")} {it.title}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {dayItems.length > 3 && (
                  <li className="text-[10px] text-slate-400">+{dayItems.length - 3}</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>

      <RetrospectModal
        target={retroTarget}
        onClose={() => setRetroTarget(null)}
        onSaved={() => setLocalRefresh((k) => k + 1)}
      />
    </div>
  );
}

function FeasibilityBadge({ score }: { score: number | null }) {
  // null → 데이터 부족 회색. 점수에 따라 red→amber→green 그라데이션.
  if (score === null) {
    return (
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600"
        aria-label="실현 가능성 — 데이터 부족"
      />
    );
  }
  const color =
    score >= 70
      ? "bg-emerald-500"
      : score >= 50
        ? "bg-amber-500"
        : "bg-red-500";
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`}
      aria-label={`실현 가능성 ${score}점`}
    />
  );
}

function feasibilityTooltip(
  it: ScheduledRunItem,
  isPast: boolean,
  hasRetro: boolean,
): string {
  const time = formatInTimeZone(new Date(it.scheduledStartAt), KST, "HH:mm");
  const status = hasRetro ? " (회고됨)" : isPast ? " (회고 필요)" : "";
  const score =
    it.feasibilityScore === null
      ? " · 실현 가능성: 데이터 부족"
      : ` · 실현 가능성 ${it.feasibilityScore}점`;
  return `${time} ${it.title}${status}${score}`;
}

function startOfKstMonth(d: Date): Date {
  const z = toZonedTime(d, KST);
  z.setDate(1);
  z.setHours(0, 0, 0, 0);
  return new Date(formatInTimeZone(z, KST, "yyyy-MM-dd'T'HH:mm:ssXXX"));
}

function endOfKstMonth(d: Date): Date {
  const z = toZonedTime(d, KST);
  z.setMonth(z.getMonth() + 1, 1);
  z.setHours(0, 0, 0, 0);
  return new Date(formatInTimeZone(z, KST, "yyyy-MM-dd'T'HH:mm:ssXXX"));
}

function monthGrid(d: Date): { date: Date; inMonth: boolean; isToday: boolean }[] {
  const start = startOfKstMonth(d);
  const startZ = toZonedTime(start, KST);
  const firstWeekday = (startZ.getDay() + 6) % 7; // 월=0 ... 일=6
  const gridStart = new Date(startZ);
  gridStart.setDate(gridStart.getDate() - firstWeekday);

  const today = formatInTimeZone(new Date(), KST, "yyyy-MM-dd");
  const monthStr = formatInTimeZone(d, KST, "yyyy-MM");

  const days: { date: Date; inMonth: boolean; isToday: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const cur = new Date(gridStart);
    cur.setDate(gridStart.getDate() + i);
    const inMonth = formatInTimeZone(cur, KST, "yyyy-MM") === monthStr;
    const isToday = formatInTimeZone(cur, KST, "yyyy-MM-dd") === today;
    days.push({ date: cur, inMonth, isToday });
  }
  return days;
}
