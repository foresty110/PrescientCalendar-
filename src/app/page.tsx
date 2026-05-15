import Link from "next/link";
import { auth } from "@/auth";

const GITHUB_REPO_URL = "https://github.com/foresty110/PrescientCalendar-";
const GITHUB_DECISIONS_URL = `${GITHUB_REPO_URL}/tree/main/docs/decisions`;

export default async function LandingPage() {
  const session = await auth();
  const isAuthed = !!session?.user;

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-blue-50/60 via-white to-white px-6 dark:from-blue-950/20 dark:via-slate-950 dark:to-slate-950">
      <section className="flex w-full max-w-2xl flex-col items-center text-center">
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl">
          이번 달에도
          <br />
          계획만 세우셨죠?
        </h1>
        <p aria-hidden className="mt-3 text-3xl sm:text-4xl">
          🔥
        </p>

        <p className="mt-8 text-lg leading-relaxed text-slate-600 dark:text-slate-300 sm:text-xl">
          매주 화요일 9시 독서,
          <br />
          지난달엔{" "}
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            12번 중 3번
          </span>
          만 하셨죠.
          <br />
          AI 캘린더는 그 패턴까지 다 보고 있어요.
        </p>

        <div className="mt-10">
          {isAuthed ? (
            <Link
              href="/app"
              className="inline-flex items-center gap-1 rounded-full bg-blue-500 px-7 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
            >
              대시보드로 <span aria-hidden>→</span>
            </Link>
          ) : (
            <Link
              href="/signin"
              className="inline-flex items-center gap-1 rounded-full bg-blue-500 px-7 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
            >
              구글로 1분이면 끝 <span aria-hidden>→</span>
            </Link>
          )}
        </div>

        <p className="mt-5 text-xs text-slate-400 dark:text-slate-500">
          광고 없어요 <span aria-hidden>·</span> 코드 공개{" "}
          <span aria-hidden>·</span> 사이드프로젝트
        </p>
      </section>

      <footer className="absolute inset-x-0 bottom-6 flex items-center justify-center gap-3 text-[11px] text-slate-400 dark:text-slate-500">
        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="hover:text-slate-600 dark:hover:text-slate-300"
        >
          GitHub
        </a>
        <span aria-hidden>·</span>
        <Link
          href="/api/docs"
          className="hover:text-slate-600 dark:hover:text-slate-300"
        >
          API
        </Link>
        <span aria-hidden>·</span>
        <a
          href={GITHUB_DECISIONS_URL}
          target="_blank"
          rel="noreferrer"
          className="hover:text-slate-600 dark:hover:text-slate-300"
        >
          결정 기록
        </a>
      </footer>
    </main>
  );
}
