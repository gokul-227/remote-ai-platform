import { test, expect } from "@playwright/test";

// The frontend is the Figma Make app (hash-routed, sample data). These checks
// guard that it renders and that legacy URLs still land on the right screen.
test("Figma app shell renders on the home route", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: /main navigation/i })).toBeVisible({ timeout: 15_000 });
});

test("hiring dashboard route renders", async ({ page }) => {
  await page.goto("/#codash");
  await expect(page.getByRole("heading", { name: /your hiring workspace/i })).toBeVisible({ timeout: 15_000 });
});

test("sign-in screen renders", async ({ page }) => {
  await page.goto("/#login");
  await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible({ timeout: 15_000 });
});

test("legacy path URLs redirect to the matching Figma screen", async ({ page }) => {
  await page.goto("/auth/login");
  await expect(page).toHaveURL(/\/#login$/, { timeout: 15_000 });
  await page.goto("/jobs");
  await expect(page).toHaveURL(/\/#jobs$/, { timeout: 15_000 });
});

test("deploy verification endpoints respond", async ({ request }) => {
  expect((await request.get("/health/version")).ok()).toBeTruthy();
  expect((await request.get("/api/version")).ok()).toBeTruthy();
});

test("sign-in is real: an unregistered email gets a friendly error, not a code screen", async ({ page }) => {
  await page.goto("/#login");
  await page.locator("#email").fill("nonexistent-user@doesnotexist-e2e.com");
  await page.getByRole("button", { name: /email me a sign-in code/i }).click();
  await expect(page.locator("p[role=alert]")).toContainText(/couldn't find an account|invalid|error|failed/i, { timeout: 15_000 });
  await expect(page.locator("#code")).not.toBeVisible();
});

test("jobs screen lists real jobs from the API", async ({ page }) => {
  const res = await page.request.get(`${process.env.E2E_API_URL || "http://localhost:18000"}/api/v1/jobs?limit=1`).catch(() => null);
  test.skip(!res?.ok() || !(await res.json()).length, "no jobs in this environment's API");
  await page.goto("/#jobs");
  await expect(page.getByText(/live remote roles - [1-9]\d* results/i)).toBeVisible({ timeout: 20_000 });
});
