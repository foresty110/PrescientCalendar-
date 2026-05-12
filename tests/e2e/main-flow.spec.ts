/**
 * Step 9에서 채울 핵심 e2e — 로그인 → 일정 생성 → 캘린더 표시.
 * 지금은 스캐폴딩만.
 */
import { test, expect } from "@playwright/test";

test("랜딩 페이지가 뜬다 (스캐폴딩 검증)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Prescient Calendar" })).toBeVisible();
});
