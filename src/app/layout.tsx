import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prescient Calendar",
  description: "자연어로 일정을 만들고, 회고하고, 다음 주를 예측하는 AI 캘린더",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-white text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
