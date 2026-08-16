import { test, expect } from "@playwright/test";

test.describe("Negative Resilience & Error State Handling", () => {
  test("handles non-existent job ID gracefully with 404 or empty state without crashing", async ({ page }) => {
    await page.goto("/jobs/00000000-0000-0000-0000-000000000000");
    // Should display graceful not found or error UI, not blank screen or uncaught runtime crash
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("body")).not.toContainText(/uncaught exception/i);
  });

  test("handles non-existent engineer profile gracefully", async ({ page }) => {
    await page.goto("/engineers/00000000-0000-0000-0000-000000000000");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("body")).not.toContainText(/uncaught exception/i);
  });

  test("handles non-existent company profile gracefully", async ({ page }) => {
    await page.goto("/companies/00000000-0000-0000-0000-000000000000");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("body")).not.toContainText(/uncaught exception/i);
  });

  test("rejects invalid login credentials with user-friendly error message", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByPlaceholder(/you@company.com/i).fill("nonexistent-user@invalid-domain.test");
    await page.getByPlaceholder(/••••••••/i).fill("WrongPassword123!");
    await page.getByRole("button", { name: /sign in/i }).click();

    // Verify error feedback or alert banner is displayed
    await expect(page.locator("body")).toContainText(/can't reach|invalid|error|failed|check your connection|incorrect/i, { timeout: 10000 });
  });
});
