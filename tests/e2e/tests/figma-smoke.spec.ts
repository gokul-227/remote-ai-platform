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
