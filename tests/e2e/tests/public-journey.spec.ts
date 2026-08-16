import { test, expect } from "@playwright/test";

test.describe("Public Experience and Visitor Journeys", () => {
  test("visitor can browse landing page, search jobs, view engineers and companies directories", async ({ page }) => {
    // 1. Landing Page
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/remote engineering/i, { timeout: 15000 });
    await expect(page.getByRole("link", { name: /find your next role/i })).toBeVisible();

    // 2. Public Jobs Directory
    await page.goto("/jobs");
    await expect(page.getByPlaceholder(/job title, tech stack, company/i)).toBeVisible({ timeout: 15000 });

    // 3. Public Engineers Directory
    await page.goto("/engineers");
    await expect(page.getByPlaceholder(/search by skill/i)).toBeVisible({ timeout: 15000 });

    // 4. Public Companies Directory
    await page.goto("/companies");
    await expect(page.getByPlaceholder(/search by organization/i)).toBeVisible({ timeout: 15000 });
  });
});
