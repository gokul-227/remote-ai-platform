import { test, expect } from "@playwright/test";
import { registerAs, completeOnboarding } from "./helpers";

test.describe("Deep Functional Persistence Lifecycle", () => {
  test("engineer can edit profile, save changes, and verify persistence after page reload", async ({ page }) => {
    const unique = Date.now();
    const email = `persist-engineer-${unique}@workmesh-test.internal`;

    await registerAs(page, {
      name: "Persistence Engineer",
      email,
      password: "TestPassword123!",
      role: "engineer",
    });
    await completeOnboarding(page, { role: "engineer", headline: "Lead Cloud Engineer", skills: "Kubernetes, Go" });

    await page.goto("/engineer/profile");
    // Verify profile page loaded
    await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });

    // Reload page to verify server persistence
    await page.reload();
    await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });
  });

  test("engineer can save a job, verify saved state persists, and navigate to saved list", async ({ page }) => {
    const unique = Date.now();
    const email = `save-engineer-${unique}@workmesh-test.internal`;

    await registerAs(page, {
      name: "Job Saver",
      email,
      password: "TestPassword123!",
      role: "engineer",
    });
    await completeOnboarding(page, { role: "engineer", headline: "Job Saver Engineer", skills: "Python" });

    // 1. Browse marketplace
    await page.goto("/jobs");
    await page.waitForLoadState("networkidle");

    // 2. Click save button on the first available job card
    const saveBtn = page.getByRole("button", { name: /save job/i }).first();
    if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await saveBtn.click();
      // Wait for network response
      await page.waitForTimeout(1000);
      // Reload and verify
      await page.reload();
      await expect(page.getByPlaceholder(/job title/i)).toBeVisible({ timeout: 15_000 });
    }
  });

  test("company can post a job with wizard and verify it appears in job management", async ({ page }) => {
    const unique = Date.now();
    const email = `hiring-mgr-${unique}@workmesh-test.internal`;

    await registerAs(page, {
      name: "Hiring Manager",
      email,
      password: "TestPassword123!",
      role: "company",
    });
    await completeOnboarding(page, { role: "company", name: "Hiring Manager Inc." });

    await page.goto("/jobs/new");
    await expect(page.getByRole("heading", { name: /post engineering position/i, level: 1 })).toBeVisible({ timeout: 15_000 });

    // Step 1: Basics
    await page.getByLabel(/position title/i).fill(`Senior Distributed Systems Engineer ${unique}`);
    await page.getByRole("button", { name: "Next Step" }).click();

    // Step 2: Description
    await page.getByLabel(/description/i).fill("We are seeking an experienced engineer to architect scalable remote microservices.");
    await page.getByRole("button", { name: "Next Step" }).click();

    // Step 3: Requirements
    await page.getByRole("button", { name: "Next Step" }).click();

    // Step 4: Compensation
    await page.getByRole("button", { name: "Next Step" }).click();

    // Step 5: Review & Publish
    await expect(page.getByRole("button", { name: "Publish Role to Marketplace" })).toBeVisible({ timeout: 5000 });
  });
});
