import { auth, signOut } from "@/auth";

export default async function AppHomePage() {
  const session = await auth();

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
        <h1 className="text-2xl font-bold">Prescient Calendar</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-500">{session?.user?.email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1 text-xs transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              로그아웃
            </button>
          </form>
        </div>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">환영합니다, {session?.user?.name}님</h2>
        <p className="text-sm text-slate-500">
          Step 3 (Auth.js) 까지 완료. 다음: Step 4 LLM 레이어 + Step 5 채팅 + 캘린더.
        </p>
      </section>
    </main>
  );
}
