"use client";

import { useState } from "react";
import { z } from "zod";

/** `compute_feasibility` tool 의 직렬화된 출력. v2 — 5단계 신뢰도 + factors + alternatives 추가.
 *  agent 가 toolCalls[i].output 으로 넘기는 raw JSON 을 Chat 에서 safeParse 로 통과시킨 결과만
 *  카드로 그린다. 형태가 어긋나면 텍스트 메시지만 남는다. */
export const feasibilityOutputSchema = z.object({
  score: z.number().int().min(0).max(100).nullable(),
  rationale: z.string(),
  dataInsufficient: z.boolean(),
  sampleSize: z.number().int().min(0),
  confidence: z.enum(["매우높음", "높음", "보통", "낮음", "없음"]),
  factors: z.array(
    z.object({
      key: z.enum(["executionRate", "delay", "density", "event", "streak", "length"]),
      label: z.string(),
      detail: z.string(),
      delta: z.number().int(),
    }),
  ),
  alternatives: z.array(
    z.object({
      label: z.string(),
      expectedScore: z.number().int().min(0).max(100),
      note: z.string(),
    }),
  ),
});

export type FeasibilityCardData = z.infer<typeof feasibilityOutputSchema>;

/** Chat 응답 인라인 카드 — 큰 % + 5단계 신뢰도 분할 그래프 + 영향 요인 + 대안.
 *  - 점수 50% 이하면 "왜 N%인가요?" / "어떻게 올릴 수 있을까요?" 섹션이 자동 펼침
 *  - 50% 초과면 접힘. 토글 버튼으로 펼침. */
export function FeasibilityCard({ data }: { data: FeasibilityCardData }) {
  const [forceOpen, setForceOpen] = useState(false);

  if (data.dataInsufficient || data.score === null) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-[12px] dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="font-medium text-slate-700 dark:text-slate-200">
            실현 가능성
          </span>
          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            데이터 수집 중
          </span>
        </div>
        <ConfidenceBar confidence="없음" />
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
          {data.rationale}
        </p>
      </div>
    );
  }

  const tone = pickTone(data.score);
  const lowScore = data.score <= 50;
  const expanded = lowScore || forceOpen;

  return (
    <div
      className="rounded-md border border-slate-200 bg-white p-3 text-[12px] dark:border-slate-800 dark:bg-slate-950"
      aria-label={`실현 가능성 ${data.score}%, 신뢰도 ${data.confidence}`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-medium text-slate-700 dark:text-slate-200">
          실현 가능성
        </span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] ${badgeClass(tone)}`}>
          신뢰도 {data.confidence}
        </span>
      </div>
      <div className="my-1 flex items-center gap-3">
        <span className={`text-2xl font-semibold tabular-nums ${textClass(tone)}`}>
          {data.score}%
        </span>
        <span className="block h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <span
            className={`block h-full ${barClass(tone)}`}
            style={{ width: `${data.score}%` }}
          />
        </span>
      </div>
      <ConfidenceBar confidence={data.confidence} />
      <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-300">
        {data.rationale}
      </p>

      {/* 50% 이하면 자동 펼침, 초과면 접힘 — 사용자가 토글 가능 */}
      {!lowScore && !forceOpen && (data.factors.length > 0 || data.alternatives.length > 0) && (
        <button
          type="button"
          onClick={() => setForceOpen(true)}
          className="mt-2 text-[11px] font-medium text-blue-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:text-blue-400"
        >
          왜 {data.score}%인가요? · 어떻게 올릴 수 있을까요?
        </button>
      )}

      {expanded && data.factors.length > 0 && (
        <section className="mt-3 border-t border-slate-200 pt-2 dark:border-slate-800">
          <h4 className="mb-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
            왜 {data.score}%인가요?
          </h4>
          <ul className="space-y-1">
            {data.factors.map((f) => (
              <li
                key={f.key}
                className="flex items-start justify-between gap-2 text-[11px]"
              >
                <div className="flex-1">
                  <div className="font-medium text-slate-700 dark:text-slate-200">
                    {f.label}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">{f.detail}</div>
                </div>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${deltaClass(f.delta)}`}
                >
                  {f.delta > 0 ? "+" : ""}
                  {f.delta}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {expanded && data.alternatives.length > 0 && (
        <section className="mt-3 border-t border-slate-200 pt-2 dark:border-slate-800">
          <h4 className="mb-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
            어떻게 올릴 수 있을까요?
          </h4>
          <ul className="space-y-1">
            {data.alternatives.map((a) => (
              <li
                key={a.label}
                className="flex items-center justify-between gap-2 rounded-md bg-blue-50 px-2 py-1.5 text-[11px] dark:bg-blue-950/30"
              >
                <div className="flex-1">
                  <div className="font-medium text-slate-800 dark:text-slate-100">
                    {a.label}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    {a.note}
                  </div>
                </div>
                <span className="shrink-0 text-[12px] font-semibold tabular-nums text-blue-700 dark:text-blue-300">
                  → {a.expectedScore}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5칸 분할 신뢰도 그래프
// ---------------------------------------------------------------------------

const CONFIDENCE_FILL: Record<FeasibilityCardData["confidence"], number> = {
  매우높음: 5,
  높음: 4,
  보통: 3,
  낮음: 2,
  없음: 0,
};

function ConfidenceBar({
  confidence,
}: {
  confidence: FeasibilityCardData["confidence"];
}) {
  // eslint-disable-next-line security/detect-object-injection -- confidence 는 union 리터럴, 외부 입력 아님
  const filled = CONFIDENCE_FILL[confidence];
  return (
    <div
      aria-label={`신뢰도 ${confidence}, 5단계 중 ${filled}단계`}
      className="mt-1 flex gap-0.5"
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          aria-hidden
          className={`block h-1 flex-1 rounded-full ${
            i < filled
              ? "bg-blue-500 dark:bg-blue-400"
              : "bg-slate-200 dark:bg-slate-700"
          }`}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 색 톤 매핑
// ---------------------------------------------------------------------------

type Tone = "emerald" | "amber" | "red";

function pickTone(score: number): Tone {
  if (score >= 70) return "emerald";
  if (score >= 40) return "amber";
  return "red";
}

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

function deltaClass(delta: number): string {
  if (delta > 0)
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
  if (delta < 0)
    return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
}
