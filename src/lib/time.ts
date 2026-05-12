import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export const KST = "Asia/Seoul";

/**
 * UTC Date → KST 표시 문자열 (예: "2026-05-13 15:00 KST")
 */
export function toKstDisplay(date: Date): string {
  return formatInTimeZone(date, KST, "yyyy-MM-dd HH:mm 'KST'");
}

/**
 * KST 입력 문자열 (예: "2026-05-13T15:00" 또는 "2026-05-13T15:00:00+09:00") → UTC Date
 */
export function fromKstInput(input: string): Date {
  // ISO 문자열에 offset이 있으면 그대로, 없으면 KST로 해석
  if (/[+-]\d{2}:?\d{2}$|Z$/.test(input)) {
    return new Date(input);
  }
  return fromZonedTime(input, KST);
}

/**
 * KST 기준 그 날 자정(00:00) → UTC Date
 */
export function startOfKstDay(date: Date): Date {
  const kst = toZonedTime(date, KST);
  kst.setHours(0, 0, 0, 0);
  return fromZonedTime(kst, KST);
}

/**
 * KST 기준 그 주 월요일 자정 → UTC Date
 */
export function startOfKstWeek(date: Date): Date {
  const kst = toZonedTime(date, KST);
  const day = kst.getDay(); // 0=일, 1=월, ...
  const diff = day === 0 ? -6 : 1 - day; // 월요일 기준
  kst.setDate(kst.getDate() + diff);
  kst.setHours(0, 0, 0, 0);
  return fromZonedTime(kst, KST);
}
