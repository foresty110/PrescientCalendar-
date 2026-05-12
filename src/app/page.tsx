export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-16">
      <h1 className="text-3xl font-bold sm:text-4xl">Prescient Calendar</h1>
      <p className="text-base text-slate-600 dark:text-slate-300">
        자연어로 일정을 만들고, 회고하고, 다음 주를 예측하는 AI 캘린더.
      </p>
      <p className="text-sm text-slate-500">
        Step 1 스캐폴딩 완료. 다음: Prisma 스키마 + Auth.js (Step 3).
      </p>
    </main>
  );
}
