import { test, expect } from "@playwright/test";

// Real E2E journey against the live stack: register as a company -> create
// company profile -> post a job -> land on the candidate discovery view.
test("company can register, create profile, and post a job", async ({ page }) => {
  const email = `e2e-company-${Date.now()}@example.com`;
  const password = "e2eTestPassword123";

  await page.goto("/auth/register");
  await page.locator("#fullName").fill("E2E Test Company");
  await page.locator("#regEmail").fill(email);
  await page.locator("#regPassword").fill(password);
  await page.getByRole("button", { name: /company \/ recruiter/i }).click();
  await page.getByRole("button", { name: /create account/i }).click();

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

  await page.goto("/jobs/new");
  await page.getByLabel("Title").fill("E2E Test Role — Senior Engineer");
  await page.getByLabel("Description").fill("A role created by an automated E2E test to verify job posting works end to end.");
  await page.getByLabel("Required skills").fill("Python, TypeScript");
  await page.getByRole("button", { name: /publish/i }).click();

  // Successful publish should navigate away from the create form or show the new job.
  await expect(page).not.toHaveURL(/\/jobs\/new$/, { timeout: 30_000 });

  await page.goto("/company/candidates");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("body")).not.toContainText(/unexpected error/i);
});
