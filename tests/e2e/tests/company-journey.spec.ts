import { test, expect } from "@playwright/test";
import { registerAs } from "./helpers";

// Real E2E journey against the live stack: register as a company -> create
// company profile -> post a job (5-step wizard) -> land on the candidate
// discovery view.
test("company can register, create profile, and post a job", async ({ page }) => {
  const email = `e2e-company-${Date.now()}@example.com`;
  const password = "e2eTestPassword123";

  await registerAs(page, { name: "E2E Test Company", email, password, role: "company" });

  await expect(page).toHaveURL(/\/company\/profile/, { timeout: 30_000 });

  await page.getByLabel("Company name").fill("E2E Test Company Inc.");
  await page.getByLabel("Industry").fill("Software");
  await page.getByLabel("Location").fill("Remote-first");
  await page.getByLabel("Description").fill("A company created by an automated E2E test.");
  // Wait for the actual POST /companies/me response, not just the click —
  // without this, a fast test runner can navigate to /jobs/new before the
  // company profile actually exists server-side, which then makes job
  // creation genuinely fail with "Unable to publish this job. Check your
  // company profile and try again." This was the real, reproducible root
  // cause of an earlier flaky failure here — not latency.
  const [profileResponse] = await Promise.all([
    page.waitForResponse((res) => res.url().includes("/companies/me") && res.request().method() === "POST", { timeout: 30_000 }),
    page.getByRole("button", { name: /save|create/i }).click(),
  ]);
  expect(profileResponse.ok()).toBeTruthy();

  // Profile save should not leave the form in an error state.
  await expect(page.locator("body")).not.toContainText(/unexpected error/i);

  // /jobs/new is a 5-step wizard: role basics -> description -> requirements
  // -> compensation -> review. Only "Job title" is required to advance past
  // step 1, so compensation is deliberately left at its defaults here.
  await page.goto("/jobs/new");
  await page.getByLabel("Job title").fill("E2E Test Role — Senior Engineer");
  await page.getByRole("button", { name: /^next$/i }).click();

  await page.getByLabel("Description").fill("A role created by an automated E2E test to verify job posting works end to end.");
  await page.getByRole("button", { name: /^next$/i }).click();

  await page.getByLabel("Required skills").fill("Python, TypeScript");
  await page.getByRole("button", { name: /^next$/i }).click();

  // Compensation step — leave budget fields blank, advance to review.
  await page.getByRole("button", { name: /^next$/i }).click();

  // Clicking "Publish Job" fires the create-job mutation and an immediate
  // client-side router.push to the new job's detail page. Confirmed via
  // repeated local repro (screenshots) that the job is created and the page
  // has already reached /jobs/[id] in every case this raises — the failure
  // is Playwright's own action-tracking racing the navigation (it keeps
  // waiting to re-resolve the now-gone "Publish Job" button on the new page),
  // not a real app bug. Without an explicit timeout, click() inherits the
  // *whole test's* 90s budget internally, so a swallowed click error alone
  // still starves the real assertion below of any time to run. Give it a
  // short explicit timeout so it fails fast and leaves the URL assertion
  // (the outcome we actually care about) the rest of the budget.
  await page.getByRole("button", { name: /publish job/i }).click({ timeout: 5_000 }).catch(() => {});
  await expect(page).not.toHaveURL(/\/jobs\/new$/, { timeout: 60_000 });

  await page.goto("/company/candidates");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("body")).not.toContainText(/unexpected error/i);
});
