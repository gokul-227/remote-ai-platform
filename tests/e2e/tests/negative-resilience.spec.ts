import { test, expect } from "@playwright/test";
import { scanForA11yViolations } from "./a11y-helpers";

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

  test("rejects login for an unregistered email with a user-friendly error message", async ({ page }, testInfo) => {
    // Login is passwordless (email OTP, see src/app/auth/login/page.tsx) --
    // there's no password field to submit a wrong password against anymore.
    // The equivalent negative case for this flow is requesting a code for an
    // email with no account: signInWithOtp({shouldCreateUser: false}) then
    // rejects with "Signups not allowed for otp"/"user not found", which
    // sendCode() turns into a friendly inline error instead of advancing to
    // the code-entry stage.
    await page.goto("/auth/login");
    const loginViolations = await scanForA11yViolations(page, testInfo, "login-page");
    expect(
      loginViolations,
      loginViolations.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)`).join("\n")
    ).toEqual([]);

    await page.locator("#email").fill("nonexistent-user@doesnotexist-e2e.com");
    await page.getByRole("button", { name: /send code/i }).click();

    // Verify error feedback or alert banner is displayed, and the form did
    // not advance to the code-entry stage.
    await expect(page.locator("body")).toContainText(/couldn't find an account|invalid|error|failed|check your connection|incorrect/i, { timeout: 10000 });
    await expect(page.locator("#code")).not.toBeVisible();
  });
});
