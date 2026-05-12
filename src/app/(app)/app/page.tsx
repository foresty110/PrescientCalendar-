import { auth, signOut } from "@/auth";
import { AppShell } from "./AppShell";

export default async function AppHomePage() {
  const session = await auth();

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
        <h1 className="text-xl font-bold sm:text-2xl">Prescient Calendar</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-slate-500 sm:inline">{session?.user?.email}</span>
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

      <AppShell />
    </main>
  );
}
