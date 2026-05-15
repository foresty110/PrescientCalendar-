"use client";

/** 오늘 일정 0건일 때 타임라인에 들어가는 풍부한 빈 상태.
 *  - 아이콘 + 카피 + CTA 버튼(채팅 입력란 포커스) + 예시 prefill 칩 3개.
 *  - 예시 칩 클릭 시 그 문장이 채팅 입력란에 자동 채워진다 — 사용자는 보내기 전 수정 가능.
 *  - 메타 라벨("예시에서 시작") 은 부모(AppShell) 가 prefill 호출 시 붙인다. */
interface EmptyStateProps {
  /** 헤더 "+ 추가" 와 동일 동작 — 채팅 입력란만 포커스 */
  onAddClick?: () => void;
  /** 예시 칩 클릭 시 호출 — text 는 그대로 채팅 입력란에 prefill */
  onExampleClick?: (text: string) => void;
  /** 빈 상태 헤드라인에 들어갈 자연어 라벨 — "오늘"/"어제"/"내일"/"M월 d일 (요일)". 미지정 시 "오늘". */
  dateLabel?: string;
}

/** 자연어 일정 만들기 첫 경험을 도와주는 예시. KST 기준 자연스럽게 읽히는 문장만. */
const EXAMPLES = [
  "내일 오후 3시에 운동 1시간",
  "매주 화요일 9시 팀 미팅",
  "오늘 저녁 8시 책 읽기 30분",
];

export function EmptyState({ onAddClick, onExampleClick, dateLabel = "오늘" }: EmptyStateProps) {
  // 한국어 조사("은/는") 가 라벨 마지막 음절에 따라 달라지는 문제를 회피 — 조사 생략해
  // "{라벨} 일정이 없어요" 로 통일. 오늘/어제/내일/"M월 d일 (요일)" 모두 자연스럽게 읽힌다.
  const headline = `${dateLabel} 일정이 없어요`;
  return (
    <div className="flex flex-col items-center gap-3 px-2 py-6 text-center">
      <span aria-hidden className="text-3xl">
        📅
      </span>
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {headline}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          채팅으로 자연어로 만들어 보세요
        </p>
      </div>
      {onAddClick && (
        <button
          type="button"
          onClick={onAddClick}
          className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-3 py-1.5 text-[12px] font-medium text-violet-700 transition-colors hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200 dark:hover:bg-violet-950 dark:focus-visible:ring-offset-slate-950"
        >
          <span aria-hidden>+</span>
          <span>일정 추가</span>
        </button>
      )}
      {onExampleClick && (
        <div className="mt-1 flex w-full flex-col gap-1.5">
          <ul className="flex flex-col gap-1">
            {EXAMPLES.map((text) => (
              <li key={text}>
                <button
                  type="button"
                  onClick={() => onExampleClick(text)}
                  className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-left text-[11px] text-slate-600 transition-colors hover:border-slate-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-950"
                >
                  &ldquo;{text}&rdquo;
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
