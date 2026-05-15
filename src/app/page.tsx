import Link from "next/link";
import { auth } from "@/auth";

export default async function LandingPage() {
  const session = await auth();
  const isAuthed = !!session?.user;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-8 px-6">
      <div className="space-y-3">
        <h1 className="text-4xl font-bold sm:text-5xl">Prescient Calendar</h1>
        <p className="text-lg text-slate-600 dark:text-slate-300">
          자연어로 일정을 만들고, 회고하고, 다음 주를 예측하는 AI 캘린더.
        </p>
      </div>

      <ul className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
        <li>· &quot;내일 3시 운동 1시간&quot; → 일정 자동 생성</li>
        <li>· &quot;아까 30분 늦게 시작했어&quot; → 회고 자동 기록</li>
        <li>· 과거 패턴으로 다음 주 일정 예측</li>
      </ul>

      <div className="flex gap-3">
        {isAuthed ? (
          <Link
            href="/app"
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            대시보드로 →
          </Link>
        ) : (
          <Link
            href="/signin"
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            Google로 시작하기
          </Link>
        )}
      </div>
    </main>
  );
}
