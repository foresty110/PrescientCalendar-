import Link from "next/link";
import { auth } from "@/auth";

export default async function LandingPage() {
  const session = await auth();
  const isAuthed = !!session?.user;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-blue-50/60 via-white to-white px-6 dark:from-blue-950/20 dark:via-slate-950 dark:to-slate-950">
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
          계획은 늘었는데,{" "}
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            지킨 건 적죠.
          </span>
          <br />
          <br />
          내가 진짜 뭐를 할 수 있는지,{" "}
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            AI 가 패턴까지 읽어
          </span>{" "}
          알려줘요.
        </p>

        <div className="mt-10">
          {isAuthed ? (
            <Link
              href="/app"
              className="inline-flex items-center gap-1 rounded-full bg-blue-500 px-7 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
            >
              내 캘린더로 <span aria-hidden>→</span>
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
      </section>
    </main>
  );
}
