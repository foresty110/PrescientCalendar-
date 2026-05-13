/**
 * 핵심 흐름 e2e — 인증 주입 후 대시보드까지 렌더되는지 확인.
 *
 * LLM 호출이 발생하는 채팅·실제 일정 생성은 비용 회피를 위해 이 스위트에선
 * 다루지 않음. Anthropic mock은 별도 PR로 추가 가능 (현재는 로컬 전용 스위트).
 */
import { test, expect } from "@playwright/test";

import {
  cleanupE2EData,
  createE2ESession,
  disconnectDb,
  type InjectedSession,
} from "./helpers/auth";

test.afterAll(async () => {
  await cleanupE2EData();
  await disconnectDb();
});

test("공개 랜딩 페이지가 로그아웃 상태에서 표시된다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Prescient Calendar" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Google로 시작하기/ })).toBeVisible();
});

test("로그아웃 상태로 /app 접근 시 /signin으로 리다이렉트", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/signin/);
});

test("세션 쿠키 주입 후 /app에서 대시보드가 렌더된다", async ({ page, context, baseURL }) => {
  const session: InjectedSession = await createE2ESession();
  await context.addCookies([
    {
      name: session.cookieName,
      value: session.sessionToken,
      url: baseURL ?? "http://localhost:3000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.goto("/app");

  // 헤더의 제품명
  await expect(page.getByRole("heading", { name: "Prescient Calendar" })).toBeVisible();
  // 로그인된 사용자 이메일 (헤더 우측)
  await expect(page.getByText(session.email)).toBeVisible();
  // 채팅 + 캘린더 컴포넌트 핵심 요소
  await expect(page.getByRole("button", { name: "보내기" })).toBeVisible();
  await expect(page.getByPlaceholder(/일정을 자연어로 입력/)).toBeVisible();
});
