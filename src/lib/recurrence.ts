/**
 * 반복 일정 인스턴스 펼치기.
 *
 * Event.recurrence와 첫 시작 시각을 받아 horizon(기본 4주) 내에 떨어지는
 * ScheduledRun 시각 배열을 반환한다. 순수 함수 — DB 접근 없음.
 *
 * 규칙:
 * - DAILY: byDay 무시, 매일
 * - WEEKLY: byDay 명시되면 그 요일들. 없으면 startAt 요일만
 * - MONTHLY: 같은 day-of-month. 존재하지 않는 날(예: 2월 31일)은 스킵
 * - `until` (ISO date) 있으면 그 날(UTC 자정 기준) 이전까지만 펼침
 * - 그 외엔 horizon (now + horizonWeeks)까지 펼침
 * - 결과는 startAt 포함, 시간순 정렬, 최대 `maxOccurrences`(기본 200) 안전 제한
 */

export type RecurrenceFreq = "DAILY" | "WEEKLY" | "MONTHLY";
export type WeekDay = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

export interface Recurrence {
  freq: RecurrenceFreq;
  byDay?: WeekDay[];
  until?: string; // ISO date or datetime
}

export interface ExpandOptions {
  /** "지금" — horizon 계산 기준. 테스트에서 주입 */
  now: Date;
  /** horizon 주 수 (기본 4) */
  horizonWeeks?: number;
  /** 안전 한계 (기본 200) */
  maxOccurrences?: number;
}

const WEEKDAY_TO_JS: Record<WeekDay, number> = {
  // JS Date.getDay(): 0=일, 1=월, ..., 6=토
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

const JS_TO_WEEKDAY: WeekDay[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/**
 * 반복 일정 인스턴스 시각 배열 반환. startAt 포함.
 * recurrence가 없거나 null이면 [startAt] 단일 반환.
 */
export function expandRecurrence(
  startAt: Date,
  recurrence: Recurrence | null | undefined,
  opts: ExpandOptions,
): Date[] {
  if (!recurrence) return [startAt];

  const horizonWeeks = opts.horizonWeeks ?? 4;
  const maxOccurrences = opts.maxOccurrences ?? 200;

  const horizonEnd = new Date(opts.now);
  horizonEnd.setDate(horizonEnd.getDate() + horizonWeeks * 7);

  const untilEnd = recurrence.until ? new Date(recurrence.until) : null;
  const endAt = untilEnd && untilEnd < horizonEnd ? untilEnd : horizonEnd;

  if (recurrence.freq === "DAILY") {
    return expandDaily(startAt, endAt, maxOccurrences);
  }
  if (recurrence.freq === "WEEKLY") {
    return expandWeekly(startAt, endAt, recurrence.byDay, maxOccurrences);
  }
  return expandMonthly(startAt, endAt, maxOccurrences);
}

function expandDaily(startAt: Date, endAt: Date, max: number): Date[] {
  const out: Date[] = [];
  const cursor = new Date(startAt);
  while (cursor <= endAt && out.length < max) {
    out.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function expandWeekly(
  startAt: Date,
  endAt: Date,
  byDay: WeekDay[] | undefined,
  max: number,
): Date[] {
  // byDay 없으면 startAt 요일 1개
  const targetJsDays = new Set<number>(
    byDay && byDay.length > 0
      ? // eslint-disable-next-line security/detect-object-injection -- d는 WeekDay union, 외부 입력 아님
        byDay.map((d) => WEEKDAY_TO_JS[d])
      : [startAt.getDay()],
  );

  const out: Date[] = [];

  // startAt이 첫 인스턴스. byDay에 startAt 요일이 없으면 startAt이 어색하지만
  // 사용자 의도 존중: startAt은 항상 첫 인스턴스로 포함
  if (startAt <= endAt) out.push(new Date(startAt));

  const cursor = new Date(startAt);
  cursor.setDate(cursor.getDate() + 1);

  while (cursor <= endAt && out.length < max) {
    if (targetJsDays.has(cursor.getDay())) {
      out.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return out;
}

function expandMonthly(startAt: Date, endAt: Date, max: number): Date[] {
  const out: Date[] = [];
  const dayOfMonth = startAt.getDate();
  const hours = startAt.getHours();
  const minutes = startAt.getMinutes();
  const seconds = startAt.getSeconds();

  let year = startAt.getFullYear();
  let month = startAt.getMonth();

  while (out.length < max) {
    // 해당 월의 dayOfMonth가 존재하는지 확인 (2월 31일 같은 케이스 스킵)
    const candidate = new Date(year, month, dayOfMonth, hours, minutes, seconds);
    const validDay = candidate.getMonth() === month; // overflow되면 다음 달로 넘어가서 month가 달라짐

    if (validDay) {
      if (candidate > endAt) break;
      out.push(candidate);
    }

    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
  }

  return out;
}

/** WeekDay 이름 변환 (디버깅·로깅용) */
export function jsDayToWeekDay(jsDay: number): WeekDay {
  // eslint-disable-next-line security/detect-object-injection -- 0..6 외 인덱스는 ?? "MO"로 안전 fallback
  return JS_TO_WEEKDAY[jsDay] ?? "MO";
}
