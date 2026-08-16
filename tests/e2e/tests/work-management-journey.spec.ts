import { test, expect } from "@playwright/test";
import { registerAs } from "./helpers";

test.describe("Work Management & Platform Journeys", () => {
  test("authenticated user can view projects, payments, quality, and settings", async ({ page }) => {
    const unique = Date.now();
    const email = `work-user-${unique}@workmesh-test.internal`;

    await registerAs(page, {
      name: "Workspace Tester",
      email,
      password: "TestPassword123!",
      role: "engineer",
    });

    await expect(page).toHaveURL(/\/engineer\/profile/, { timeout: 30_000 });

    // 1. Projects Workspace
    await page.goto("/projects");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });

    // 2. Payments & Wallet
    await page.goto("/payments");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });

    // 3. Quality & AI Review
    await page.goto("/quality");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });

    // 4. Settings
    await page.goto("/settings");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
  });
});
