/**
 * KST 기준 날짜 키 비교/라벨링 헬퍼.
 *
 * selectedDateKey 와 todayKey 는 모두 "yyyy-MM-dd" KST 기준 문자열. 캘린더가 클릭한
 * 날짜와 오늘을 비교해 사용자에게 보여줄 자연어("오늘"/"어제"/"내일"/"M월 d일 (요일)")
 * 를 결정한다. UI 카피·채팅 prefill·EmptyState 메시지에서 같은 함수를 공유.
 *
 * KST 는 UTC+9 고정 (서머타임 없음) 이라 모든 비교를 KST 정오(=UTC 03:00) 기준
 * 동일 시각으로 통일해 일 단위 차를 계산한다.
 */

const KO_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** 현재 시각의 KST 날짜 키. UTC+9 고정 오프셋으로 한 줄 산술. */
export function todayKstDateKey(now: Date): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** "오늘"/"어제"/"내일"/"M월 d일 (요일)" 중 하나로 라벨링.
 *  선택된 날짜가 오늘 기준 -1/0/+1 일이면 자연어, 그 외엔 날짜+요일 형식. */
export function pickDateLabel(selectedDateKey: string, todayKey: string): string {
  if (selectedDateKey === todayKey) return "오늘";

  const todayUtcMs = kstKeyToNoonUtcMs(todayKey);
  const selUtcMs = kstKeyToNoonUtcMs(selectedDateKey);
  const diffDays = Math.round((selUtcMs - todayUtcMs) / 86_400_000);

  if (diffDays === -1) return "어제";
  if (diffDays === 1) return "내일";

  const [, m, d] = selectedDateKey.split("-").map(Number) as [number, number, number];
  const dow = new Date(selUtcMs).getUTCDay();
  // eslint-disable-next-line security/detect-object-injection -- dow 는 getUTCDay 결과 0..6
  return `${m}월 ${d}일 (${KO_WEEKDAYS[dow]})`;
}

function kstKeyToNoonUtcMs(key: string): number {
  // 정오 KST = 03:00 UTC 같은 날. DST 가 없어 안전.
  return new Date(`${key}T03:00:00.000Z`).getTime();
}
