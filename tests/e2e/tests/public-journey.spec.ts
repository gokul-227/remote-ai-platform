import { test, expect } from "@playwright/test";
import { scanForA11yViolations, withoutKnownDesignTokenGaps } from "./a11y-helpers";

test.describe("Public Experience and Visitor Journeys", () => {
  test("visitor can browse landing page, search jobs, view engineers and companies directories", async ({ page }, testInfo) => {
    // 1. Landing Page
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/remote engineering/i, { timeout: 15000 });
    await expect(page.getByRole("link", { name: /find your next role/i })).toBeVisible();
    const landingViolations = await scanForA11yViolations(page, testInfo, "landing-page");
    expect(landingViolations, describeViolations(landingViolations)).toEqual([]);

    // 2. Public Jobs Directory
    await page.goto("/jobs");
    await expect(page.getByPlaceholder(/job title, tech stack, company/i)).toBeVisible({ timeout: 15000 });
    const jobsViolations = withoutKnownDesignTokenGaps(await scanForA11yViolations(page, testInfo, "jobs-directory"));
    expect(jobsViolations, describeViolations(jobsViolations)).toEqual([]);

    // 3. Public Engineers Directory
    await page.goto("/engineers");
    await expect(page.getByPlaceholder(/search by skill/i)).toBeVisible({ timeout: 15000 });
    const engineersViolations = await scanForA11yViolations(page, testInfo, "engineers-directory");
    expect(engineersViolations, describeViolations(engineersViolations)).toEqual([]);

    // 4. Public Companies Directory
    await page.goto("/companies");
    await expect(page.getByPlaceholder(/search by organization/i)).toBeVisible({ timeout: 15000 });
    const companiesViolations = await scanForA11yViolations(page, testInfo, "companies-directory");
    expect(companiesViolations, describeViolations(companiesViolations)).toEqual([]);
  });
});

function describeViolations(violations: Awaited<ReturnType<typeof scanForA11yViolations>>) {
  return violations
    .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)`)
    .join("\n");
}
