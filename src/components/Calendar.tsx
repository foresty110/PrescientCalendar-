"use client";

import { useEffect, useMemo, useState } from "react";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";

import { RetrospectModal, type RetrospectModalTarget } from "@/components/RetrospectModal";
import { lookupHolidayName } from "@/lib/holidays/kr";

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
  /** 현재 타임라인이 보고 있는 KST 'yyyy-MM-dd' 날짜. 해당 셀에 violet ring 으로 표시 (오늘 셀은 기존 slate ring 유지). */
  selectedDateKey: string;
  /** 셀 클릭 시 호출 — 부모가 selectedDateKey 갱신 → 타임라인 자동 재조회. */
  onDateSelect: (dateKey: string) => void;
  /** '오늘' 버튼 클릭 시 호출 — 부모가 selectedDateKey 를 오늘로 리셋 (캘린더 자체는 viewedDate 도 같이 리셋). */
  onJumpToToday?: () => void;
  /** 회고 저장 등 데이터가 바뀌었을 때 호출 — 부모가 전역 refreshKey 를 올려 캘린더·타임라인을 함께 재조회. */
  onDataChange?: () => void;
}

export function Calendar({
  refreshKey = 0,
  selectedDateKey,
  onDateSelect,
  onJumpToToday,
  onDataChange,
}: CalendarProps) {
  // now: 첫 마운트 시 "오늘"의 시각 참조 (isToday 비교·과거 일정 disabled 판정용). 자정 넘기 전까진 안정적.
  // viewedDate: 화면이 보여주는 달의 어느 한 시점 — ← → 로 이동 / '오늘' 으로 리셋.
  const [now] = useState(() => new Date());
  const [viewedDate, setViewedDate] = useState(() => new Date());
  const [items, setItems] = useState<ScheduledRunItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retroTarget, setRetroTarget] = useState<RetrospectModalTarget | null>(null);

  // ISO 문자열로 메모이즈 — Date 객체 ID 안정화 (무한 refetch 방지). viewedDate 가 바뀌면 새 달 fetch.
  const range = useMemo(() => {
    return {
      fromIso: startOfKstMonth(viewedDate).toISOString(),
      toIso: endOfKstMonth(viewedDate).toISOString(),
    };
  }, [viewedDate]);

  const viewedYm = formatInTimeZone(viewedDate, KST, "yyyy-MM");
  const todayYm = formatInTimeZone(now, KST, "yyyy-MM");
  const isCurrentMonth = viewedYm === todayYm;

  // 다른 달로 옮길 때 이전 달 카드를 잠깐 남기지 않도록 즉시 비운다. 그 직후 fetch useEffect
  // 가 새 달을 가져온다. 같은 달 새로고침(refreshKey 갱신) 엔 stale 유지해 flicker 회피.
  useEffect(() => {
    setItems([]);
  }, [viewedDate]);

  function shiftMonth(delta: number) {
    setViewedDate((prev) => addMonthsInKst(prev, delta));
  }

  function jumpToToday() {
    setViewedDate(new Date());
    onJumpToToday?.();
  }

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
  }, [range, refreshKey]);

  const days = monthGrid(viewedDate);

  // 일별 이벤트 묶기
  const itemsByDay = new Map<string, ScheduledRunItem[]>();
  for (const item of items) {
    const key = formatInTimeZone(new Date(item.scheduledStartAt), KST, "yyyy-MM-dd");
    const arr = itemsByDay.get(key) ?? [];
    arr.push(item);
    itemsByDay.set(key, arr);
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-200/70 bg-white p-3 shadow-sm dark:border-slate-800/70 dark:bg-slate-950">
      <header className="flex items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="이전 달"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <span aria-hidden>‹</span>
          </button>
          <span
            className="min-w-[6.5rem] text-center font-semibold text-slate-600 dark:text-slate-300"
            aria-live="polite"
          >
            {formatInTimeZone(viewedDate, KST, "yyyy년 M월")}
          </span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label="다음 달"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <span aria-hidden>›</span>
          </button>
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={jumpToToday}
              className="ml-1 rounded-md border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              title="이번 달 + 오늘 날짜로 돌아가기"
            >
              오늘
            </button>
          )}
        </div>
        <ul
          aria-label="일정 색상 안내"
          className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400"
        >
          <li className="inline-flex items-center gap-1">
            <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-emerald-400 dark:bg-emerald-500" />
            완료
          </li>
          <li className="inline-flex items-center gap-1">
            <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-amber-400 dark:bg-amber-500" />
            지연
          </li>
          <li className="inline-flex items-center gap-1">
            <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500" />
            미완
          </li>
        </ul>
      </header>

      {loading && items.length === 0 ? (
        <div
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200/70 bg-white py-16 text-[12px] text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"
          aria-live="polite"
          aria-busy="true"
        >
          <span
            aria-hidden
            className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500 dark:border-slate-700 dark:border-t-blue-400"
          />
          <span>{formatInTimeZone(viewedDate, KST, "yyyy년 M월")} 불러오는 중…</span>
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-red-200 bg-red-50 py-16 text-[12px] text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          ⚠ {error}
        </div>
      ) : (
      <div className="grid flex-1 grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-300 bg-slate-300 text-xs dark:border-slate-700 dark:bg-slate-700">
        {["월", "화", "수", "목", "금", "토", "일"].map((d, i) => {
          // i===5(토), i===6(일) → 주말. 기존 emerald/amber/slate 톤과 어울리도록 강도는 500/400 으로 절제.
          const isWeekend = i >= 5;
          return (
            <div
              key={d}
              className={
                "bg-slate-100 px-2 py-1 text-center text-[11px] font-medium dark:bg-slate-900 " +
                (isWeekend
                  ? "text-red-500 dark:text-red-400"
                  : "text-slate-700 dark:text-slate-300")
              }
            >
              {d}
            </div>
          );
        })}
        {days.map((d) => {
          const key = formatInTimeZone(d.date, KST, "yyyy-MM-dd");
          const dayItems = itemsByDay.get(key) ?? [];
          const isSelected = key === selectedDateKey;
          const dateAriaLabel = `${formatInTimeZone(d.date, KST, "M월 d일")} 선택`;
          // ISO 요일: 월=1 ... 토=6, 일=7. 토·일 → 주말.
          const isoWeekday = formatInTimeZone(d.date, KST, "i");
          const isWeekend = isoWeekday === "6" || isoWeekday === "7";
          const holidayName = lookupHolidayName(key);
          const isHoliday = holidayName !== null;
          // 숫자 색: 이번 달이 아니면 옅은 회색 우선, 이번 달이면 주말·공휴일 빨강, 아니면 슬레이트.
          // 같은 빨강 톤(red-500/dark red-400) 으로 통일해 헤더 요일과 시각 일관.
          const dateNumberColor = !d.inMonth
            ? "text-slate-300 dark:text-slate-700"
            : isWeekend || isHoliday
              ? "text-red-500 dark:text-red-400"
              : "text-slate-700 dark:text-slate-200";
          return (
            // 셀은 <button> 대신 role="button" div — 안에 일정 chip <button> 이 들어가야 해서
            // 중첩 interactive content 금지 규칙을 피한다. Enter/Space 키도 명시적으로 처리.
            <div
              key={key}
              role="button"
              tabIndex={0}
              onClick={() => onDateSelect(key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onDateSelect(key);
                }
              }}
              aria-pressed={isSelected}
              aria-label={dateAriaLabel}
              className={
                // 셀 높이를 64→76 으로 키워 (1) 오늘 원과 일반 숫자가 동일한 20px 박스로 정렬돼도 답답하지 않고
                // (2) 공휴일 라벨 한 줄이 들어갈 공간 확보.
                "flex h-[76px] cursor-pointer flex-col overflow-hidden px-1 py-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 " +
                (isSelected
                  ? "bg-blue-50 dark:bg-blue-950/40 "
                  : "bg-white hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900 ")
              }
            >
              {/* 날짜 숫자 + 공휴일 라벨을 같은 행에 배치. 좌측 라벨(있을 때만), 우측 숫자.
                  오늘이든 일반이든 같은 h-5 w-5 박스로 감싸 시작 위치 정렬. */}
              <div className="mb-0.5 flex items-center justify-between gap-1">
                {isHoliday ? (
                  <span
                    className={
                      "min-w-0 truncate text-[10px] font-medium " +
                      (d.inMonth
                        ? "text-red-600 dark:text-red-400"
                        : "text-red-300 dark:text-red-900")
                    }
                    title={holidayName ?? undefined}
                  >
                    {holidayName}
                  </span>
                ) : (
                  // justify-between 균형을 위한 빈 자리 — 셀 안의 시각 일관 유지.
                  <span aria-hidden className="min-w-0" />
                )}
                <span
                  aria-label={d.isToday ? "오늘" : undefined}
                  className={
                    "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold " +
                    (d.isToday ? "bg-blue-500 text-white" : dateNumberColor)
                  }
                >
                  {formatInTimeZone(d.date, KST, "d")}
                </span>
              </div>
              <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                {dayItems.slice(0, 2).map((it) => {
                  const isPast = new Date(it.scheduledStartAt).getTime() <= now.getTime();
                  const hasRetro = !!it.actualRun;
                  return (
                    <li key={it.scheduledRunId}>
                      <button
                        type="button"
                        onClick={(e) => {
                          // 셀 onClick (날짜 선택) 까지 버블링되지 않게 — chip 클릭은 회고 모달만.
                          e.stopPropagation();
                          setRetroTarget({
                            scheduledRunId: it.scheduledRunId,
                            title: it.title,
                            scheduledStartAt: it.scheduledStartAt,
                            scheduledDurationMin: it.scheduledDurationMin,
                            ...(it.actualRun ? { existing: it.actualRun } : {}),
                          });
                        }}
                        disabled={!isPast}
                        className={
                          // 한 셀 안에 일정이 빽빽해 보이지 않게 두께·글자·라인높이를 모두 살짝 줄인다.
                          // py-px(1px) + leading-tight(1.25) + text-[10px] 조합으로 칩 한 줄 높이 ~13px.
                          "flex w-full items-center gap-1 truncate rounded px-1 py-px text-left text-[10px] font-medium leading-tight " +
                          (hasRetro
                            ? "bg-emerald-200 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100"
                            : isPast
                              ? "bg-amber-200 text-amber-900 hover:bg-amber-300 dark:bg-amber-900/60 dark:text-amber-100 dark:hover:bg-amber-900/80"
                              : "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100") +
                          (isPast ? " cursor-pointer" : " cursor-default")
                        }
                        title={feasibilityTooltip(it, isPast, hasRetro)}
                      >
                        <span className="truncate">
                          {formatInTimeZone(new Date(it.scheduledStartAt), KST, "HH:mm")} {it.title}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {dayItems.length > 2 && (
                  <li className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                    +{dayItems.length - 2}
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
      )}

      <RetrospectModal
        target={retroTarget}
        onClose={() => setRetroTarget(null)}
        onSaved={() => onDataChange?.()}
      />
    </div>
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

/** KST 기준으로 delta 개월 이동한 같은 일자의 UTC Date. 일자가 다음 달에 존재하지 않으면(예: 1/31 + 1) JS Date 의
 *  표준 overflow 동작에 맡긴다 — 어느 일자든 결과의 'yyyy-MM' 가 fetch 범위에 사용되므로 일자 정확성은 무관. */
function addMonthsInKst(d: Date, delta: number): Date {
  const z = toZonedTime(d, KST);
  z.setMonth(z.getMonth() + delta);
  return new Date(formatInTimeZone(z, KST, "yyyy-MM-dd'T'HH:mm:ssXXX"));
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

  // 5주(35칸) 만 표시 — 6주가 필요한 달(예: 1일이 금/토에 시작하고 31일이 있는 달) 은 마지막 며칠이
  // 잘려 보인다. 의도된 트레이드오프 — 화면 높이를 일정하게 유지해 일정 목록·채팅이 한 화면에 들어오게.
  const days: { date: Date; inMonth: boolean; isToday: boolean }[] = [];
  for (let i = 0; i < 35; i++) {
    const cur = new Date(gridStart);
    cur.setDate(gridStart.getDate() + i);
    const inMonth = formatInTimeZone(cur, KST, "yyyy-MM") === monthStr;
    const isToday = formatInTimeZone(cur, KST, "yyyy-MM-dd") === today;
    days.push({ date: cur, inMonth, isToday });
  }
  return days;
}
