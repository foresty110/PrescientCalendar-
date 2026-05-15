/**
 * 타임라인이 일정 카드를 어떤 상태로 그릴지 5가지로 분기하는 헬퍼.
 *
 * 도메인의 `ActualRun.status` 는 `done | skipped | late` 3개고, 회고가 없는
 * 미래/진행중/지나간 일정은 시각 비교로 런타임에 파생한다. 여기 한 곳에 모아
 * UI 가 어디서든 동일 규칙으로 분류하도록 보장.
 */

export type TimelineStatus =
  | "completed" // 회고 완료 (done 또는 late)
  | "missed" // 사용자가 스킵으로 회고
  | "needs_retro" // 회고 없이 지나간 과거 — 캘린더의 amber-100 과 일관
  | "in_progress" // 시작은 했지만 아직 끝나지 않은 시간대
  | "upcoming"; // 아직 시작 안 한 미래

interface ScheduleInput {
  scheduledStartAt: Date | string;
  scheduledDurationMin: number;
}

interface ActualRunInput {
  status: "done" | "skipped" | "late";
}

export function deriveStatus(
  run: ScheduleInput,
  actualRun: ActualRunInput | undefined,
  now: Date,
): TimelineStatus {
  if (actualRun?.status === "done" || actualRun?.status === "late") return "completed";
  if (actualRun?.status === "skipped") return "missed";

  const start =
    typeof run.scheduledStartAt === "string"
      ? new Date(run.scheduledStartAt)
      : run.scheduledStartAt;
  const end = new Date(start.getTime() + run.scheduledDurationMin * 60_000);

  if (now.getTime() < start.getTime()) return "upcoming";
  if (now.getTime() < end.getTime()) return "in_progress";
  return "needs_retro";
}

/** 하루의 91.7% 이상(22시간 = 1320분)을 차지하는 일정은 "종일"로 분리. 스키마에 종일 플래그가
 *  없어 휴리스틱으로 판정 — 9-to-5(8h) 워크샵 같은 긴-시간형 일정은 시간형 그대로 남는다. */
export const ALL_DAY_THRESHOLD_MIN = 22 * 60;

export function isAllDayDuration(durationMin: number): boolean {
  return durationMin >= ALL_DAY_THRESHOLD_MIN;
}
