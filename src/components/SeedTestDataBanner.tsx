"use client";

import { useState, useTransition } from "react";

interface SeedTestDataBannerProps {
  /** 시드 성공 시 호출 — 부모(AppShell) 가 캘린더/타임라인 refresh 트리거 */
  onSeeded: () => void;
}

interface SeedSummary {
  eventsCreated: number;
  scheduledRunsCreated: number;
  actualRunsCreated: number;
  feasibilityScoresComputed: number;
}

/** 실현 가능성 점수의 cold-start 가드(가입 14일·표본 5건)를 한 번에 통과시키는 데모용 배너.
 *  버튼 클릭 → POST /api/seed-test-data → 시나리오 5종을 과거 8주·미래 4주로 만들어 넣는다.
 *  성공 시 본인 데이터 카운트와 함께 인라인 결과 라벨로 전환. dismissible 한 번 누르면 사라짐. */
export function SeedTestDataBanner({ onSeeded }: SeedTestDataBannerProps) {
  const [isPending, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState(false);
  const [summary, setSummary] = useState<SeedSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (dismissed) return null;

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/seed-test-data", { method: "POST" });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as SeedSummary;
        setSummary(data);
        onSeeded();
      } catch (e) {
        setError(e instanceof Error ? e.message : "시드 실패");
      }
    });
  }

  return (
    <aside
      aria-label="테스트 데이터 안내"
      className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-[12px] text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100"
    >
      <span aria-hidden className="text-base">
        🧪
      </span>
      <div className="flex-1 leading-snug">
        {summary ? (
          <span>
            예시 데이터를 만들었어요 —
            <strong className="mx-1">{summary.eventsCreated}개 일정</strong>·
            <strong className="mx-1">과거 회고 {summary.actualRunsCreated}건</strong>·
            <strong className="mx-1">
              미래 점수 {summary.feasibilityScoresComputed}건
            </strong>{" "}
            계산 완료. 채팅에서 &quot;운동 이거 가능할까?&quot; 같이 물어보세요.
          </span>
        ) : (
          <span>
            처음이세요? 실현 가능성 점수가 의미있게 나오려면 과거 회고 데이터가 필요해요.{" "}
            <strong>운동·출근·미팅·독서·산책</strong> 5개 시나리오로 30일치 예시 데이터를 한 번에
            만들 수 있어요. 본인 계정에만 들어가요.
          </span>
        )}
        {error && (
          <p className="mt-1 text-[11px] text-red-700 dark:text-red-300">⚠ {error}</p>
        )}
      </div>
      {!summary && (
        <button
          type="button"
          onClick={handleClick}
          disabled={isPending}
          className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-blue-950"
        >
          {isPending ? "생성 중…" : "테스트 데이터 추가"}
        </button>
      )}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="안내 닫기"
        className="shrink-0 rounded-full p-1 text-blue-500 transition-colors hover:bg-blue-200 hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300 dark:hover:bg-blue-800 dark:hover:text-blue-50"
      >
        <span aria-hidden>×</span>
      </button>
    </aside>
  );
}
