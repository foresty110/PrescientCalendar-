"use client";

import { z } from "zod";

/** `compute_feasibility` tool 의 직렬화된 출력. agent 가 toolCalls[i].output 으로 넘기는 raw JSON 을
 *  Chat 에서 `safeParse` 로 통과시킨 결과만 카드로 그린다 — 형태가 어긋나면 텍스트 메시지만 남는다. */
export const feasibilityOutputSchema = z.object({
  score: z.number().int().min(0).max(100).nullable(),
  rationale: z.string(),
  dataInsufficient: z.boolean(),
  sampleSize: z.number().int().min(0),
});

export type FeasibilityCardData = z.infer<typeof feasibilityOutputSchema>;

/** Chat 응답 인라인 카드 — LLM 텍스트 본문 아래에 붙어 확률/신뢰도/요인을 한 번에 보여준다.
 *  - 점수가 있으면: 큰 % + 진행 바 + 신뢰도 배지 + rationale.
 *  - 데이터 부족이면: 회색 톤 + "데이터 수집 중" 배지 + rationale 만. */
export function FeasibilityCard({ data }: { data: FeasibilityCardData }) {
  if (data.dataInsufficient || data.score === null) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-[12px] dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="font-medium text-slate-700 dark:text-slate-200">
            🎯 실현 가능성
          </span>
          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            데이터 수집 중
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <span aria-hidden className="block h-full w-0" />
        </div>
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
          {data.rationale}
        </p>
      </div>
    );
  }

  const tone = pickTone(data.score);
  const confidence = pickConfidence(data.sampleSize);

  return (
    <div
      className="rounded-md border border-slate-200 bg-white p-3 text-[12px] dark:border-slate-800 dark:bg-slate-950"
      aria-label={`실현 가능성 ${data.score}%, 신뢰도 ${confidence}`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-medium text-slate-700 dark:text-slate-200">
          🎯 실현 가능성
        </span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] ${badgeClass(tone)}`}>
          신뢰도 {confidence}
        </span>
      </div>
      <div className="my-1 flex items-center gap-3">
        <span
          className={`text-2xl font-semibold tabular-nums ${textClass(tone)}`}
        >
          {data.score}%
        </span>
        <span className="block h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <span
            className={`block h-full ${barClass(tone)}`}
            style={{ width: `${data.score}%` }}
          />
        </span>
      </div>
      <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
        {data.rationale}
      </p>
    </div>
  );
}

type Tone = "emerald" | "amber" | "red";

function pickTone(score: number): Tone {
  if (score >= 70) return "emerald";
  if (score >= 40) return "amber";
  return "red";
}

/** 신뢰도 라벨 — 표본 수가 클수록 점수의 변동성이 작다는 추정. 임계값은 inline-probability 와
 *  분리해서 잡았는데, 카드 UI 가 작은 인라인 표시보다 더 큰 정보 단위라 더 세분화. */
function pickConfidence(sampleSize: number): "높음" | "보통" | "낮음" {
  if (sampleSize >= 20) return "높음";
  if (sampleSize >= 10) return "보통";
  return "낮음";
}

// switch 기반 매퍼 — InlineProbability.tsx 와 동일 패턴 (eslint 의 object-injection
// 경고를 피하면서도 타입 안전 보장).
function textClass(t: Tone): string {
  switch (t) {
    case "emerald":
      return "text-emerald-600 dark:text-emerald-400";
    case "amber":
      return "text-amber-600 dark:text-amber-400";
    case "red":
      return "text-red-600 dark:text-red-400";
  }
}

function barClass(t: Tone): string {
  switch (t) {
    case "emerald":
      return "bg-emerald-500";
    case "amber":
      return "bg-amber-500";
    case "red":
      return "bg-red-500";
  }
}

function badgeClass(t: Tone): string {
  switch (t) {
    case "emerald":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
    case "amber":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
    case "red":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
  }
}
