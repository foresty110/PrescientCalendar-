"use client";

import { useEffect, useState, useTransition } from "react";
import { formatInTimeZone } from "date-fns-tz";

const KST = "Asia/Seoul";

export interface RetrospectModalTarget {
  scheduledRunId: string;
  title: string;
  scheduledStartAt: string; // ISO
  scheduledDurationMin: number;
  existing?: {
    actualStartAt: string;
    actualDurationMin: number;
    status: "done" | "skipped" | "late";
  };
}

interface Props {
  target: RetrospectModalTarget | null;
  onClose: () => void;
  onSaved: () => void;
}

export function RetrospectModal({ target, onClose, onSaved }: Props) {
  const [actualStartAtKst, setActualStartAtKst] = useState("");
  const [actualDurationMin, setActualDurationMin] = useState(0);
  const [status, setStatus] = useState<"done" | "skipped" | "late">("done");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!target) return;
    const scheduled = new Date(target.scheduledStartAt);
    const existing = target.existing;
    const start = existing ? new Date(existing.actualStartAt) : scheduled;
    setActualStartAtKst(formatInTimeZone(start, KST, "yyyy-MM-dd'T'HH:mm"));
    setActualDurationMin(existing ? existing.actualDurationMin : target.scheduledDurationMin);
    setStatus(existing ? existing.status : "done");
    setError(null);
  }, [target]);

  if (!target) return null;

  const scheduledKst = formatInTimeZone(
    new Date(target.scheduledStartAt),
    KST,
    "M월 d일 HH:mm",
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setError(null);
    const isoLocal = new Date(`${actualStartAtKst}:00+09:00`).toISOString();

    startTransition(async () => {
      try {
        const res = await fetch("/api/retros", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            scheduledRunId: target.scheduledRunId,
            actualStartAt: isoLocal,
            actualDurationMin,
            status,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
        }
        onSaved();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "저장 실패");
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="retro-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="retro-title" className="mb-1 text-lg font-semibold">
          회고: {target.title}
        </h2>
        <p className="mb-4 text-xs text-slate-500">
          예정 {scheduledKst} · {target.scheduledDurationMin}분
        </p>

        <form onSubmit={submit} className="space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">실제 시작</span>
            <input
              type="datetime-local"
              required
              value={actualStartAtKst}
              onChange={(e) => setActualStartAtKst(e.target.value)}
              disabled={isPending}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">실제 소요 (분)</span>
            <input
              type="number"
              min={0}
              max={720}
              required
              value={actualDurationMin}
              onChange={(e) => setActualDurationMin(Number(e.target.value))}
              disabled={isPending}
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>

          <fieldset className="space-y-1">
            <legend className="mb-1 text-slate-600 dark:text-slate-300">상태</legend>
            {(["done", "late", "skipped"] as const).map((s) => (
              <label key={s} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="status"
                  value={s}
                  checked={status === s}
                  onChange={() => setStatus(s)}
                  disabled={isPending}
                />
                {/* eslint-disable-next-line security/detect-object-injection -- s는 status union 리터럴 */}
                <span>{LABEL[s]}</span>
              </label>
            ))}
          </fieldset>

          {error && (
            <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
            >
              {isPending ? "저장 중…" : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const LABEL: Record<"done" | "late" | "skipped", string> = {
  done: "완료 (정시 진행)",
  late: "지연 시작",
  skipped: "스킵 (안 함)",
};
