"use client";

/** 다가오는 일정 카드 우측 상단에 들어가는 미니 실현 가능성 표시.
 *  [퍼센트 텍스트] [28px 진행 바] 가로 인라인. score === null 이면
 *  "데이터 수집 중" 회색 텍스트 (회고 표본이 부족한 cold start 상태). */
interface InlineProbabilityProps {
  score: number | null;
}

export function InlineProbability({ score }: InlineProbabilityProps) {
  if (score === null) {
    return (
      <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
        데이터 수집 중
      </span>
    );
  }

  const tone = pickTone(score);

  return (
    <span
      className="flex shrink-0 items-center gap-1.5"
      aria-label={`실현 가능성 ${score}%`}
    >
      <span className={`text-[10px] font-medium tabular-nums ${textClass(tone)}`}>
        {score}%
      </span>
      <span className="block h-1 w-7 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <span
          className={`block h-full ${barClass(tone)}`}
          style={{ width: `${score}%` }}
        />
      </span>
    </span>
  );
}

type Tone = "emerald" | "amber" | "red";

function pickTone(score: number): Tone {
  if (score >= 70) return "emerald";
  if (score >= 40) return "amber";
  return "red";
}

function textClass(tone: Tone): string {
  switch (tone) {
    case "emerald":
      return "text-emerald-600 dark:text-emerald-400";
    case "amber":
      return "text-amber-600 dark:text-amber-400";
    case "red":
      return "text-red-600 dark:text-red-400";
  }
}

function barClass(tone: Tone): string {
  switch (tone) {
    case "emerald":
      return "bg-emerald-500";
    case "amber":
      return "bg-amber-500";
    case "red":
      return "bg-red-500";
  }
}
