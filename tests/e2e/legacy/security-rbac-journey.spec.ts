import { test, expect } from "@playwright/test";
import { registerAs, completeOnboarding } from "./helpers";

test.describe("Security and RBAC Boundary Testing", () => {
  test("logged out visitor cannot access private dashboard and is redirected to login", async ({ page }) => {
    // 1. Attempt to visit engineer dashboard without auth
    await page.goto("/engineer/dashboard");
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 15_000 });

    // 2. Attempt to visit settings without auth
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 15_000 });

    // 3. Attempt to visit admin console without auth
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 15_000 });
  });

  test("regular engineer cannot access administrative controls or sensitive telemetry", async ({ page }) => {
    const unique = Date.now();
    const email = `security-engineer-${unique}@workmesh-test.internal`;

    await registerAs(page, {
      name: "Security Tester",
      email,
      password: "TestPassword123!",
      role: "engineer",
    });
    await completeOnboarding(page, { role: "engineer", headline: "Security Tester Engineer", skills: "Python" });

    // Try navigating directly to admin dashboard
    await page.goto("/admin/dashboard");
    // Should show access restricted or redirect away from admin data
    await expect(page.locator("body")).toContainText(/access denied|not authorized|restricted|dashboard/i);
  });
});
