import { test, expect } from "@playwright/test";

// Real E2E journey against the live stack: log in as the seeded admin user
// and confirm the dashboard renders real backend-driven data.
// Requires `python -m app.scripts.seed_data` to have been run against the
// stack under test (creates admin@workmesh.ai / admin123).
test("admin can log in and view platform stats, users, and sync status", async ({ page }) => {
  await page.goto("/auth/login");
  await page.locator("#email").fill("admin@workmesh.ai");
  await page.locator("#password").fill("admin123");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page).not.toHaveURL(/\/auth\/login$/, { timeout: 15_000 });

  await page.goto("/admin/dashboard");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText(/registered engineers/i)).toBeVisible();
  await expect(page.getByText(/companies/i).first()).toBeVisible();

  // The dashboard should not be showing a hard failure state.
  await expect(page.locator("body")).not.toContainText(/unexpected error/i);
});

test("a non-admin engineer cannot reach admin data via the API", async ({ page, request }) => {
  const email = `e2e-nonadmin-${Date.now()}@example.com`;
  const password = "e2eTestPassword123";

  const apiBase = process.env.E2E_API_URL || "http://localhost:8000/api/v1";

  const registerRes = await request.post(`${apiBase}/auth/register`, {
    data: { full_name: "E2E Non-Admin", email, password, role: "ENGINEER" },
  });
  expect(registerRes.ok()).toBeTruthy();

  const loginRes = await request.post(`${apiBase}/auth/login`, {
    data: { email, password },
  });
  expect(loginRes.ok()).toBeTruthy();
  const { access_token } = await loginRes.json();

  const adminRes = await request.get(`${apiBase}/admin/stats`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  expect(adminRes.status()).toBe(403);
});
